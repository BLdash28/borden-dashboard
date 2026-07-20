# PERFORMANCE.md — Plan de optimización de bl-dashboard

> Guía para Claude Code. Cada fase es independiente y ordenada por **impacto / esfuerzo**.
> Ejecuta una tarea a la vez, mide antes y después, y no pases a la siguiente sin verificar.
> Stack: Next.js 14 (App Router) · Supabase (node-pg pooler) · React Server Components.

---

## Cómo usar este documento con Claude Code

1. Empieza siempre por **medir** (Fase 0). Sin baseline no sabes si mejoraste.
2. Ataca en orden: **DB → Server/Cache → Cliente/Bundle**. La latencia casi siempre nace en la DB, no en React.
3. Después de cada tarea: corre el benchmark de esa ruta y anota el delta en el checklist del final.
4. No refactorices los archivos gigantes "de una". Extrae y verifica pieza por pieza.

---

## Fase 0 — Instrumentar y medir (hazlo primero, siempre)

**Objetivo:** saber dónde se va el tiempo antes de tocar nada.

- [ ] Añadir logging de duración por endpoint. Envolver los handlers de `app/api/**` con un timer que loguee `route`, `ms`, `rows`. Un pequeño wrapper `withTiming(handler)` en `lib/api/withTiming.ts` y aplicarlo a los endpoints pesados primero (ejecución de Éxito, Walmart, Selectos).
- [ ] Activar `pg_stat_statements` en Supabase y sacar el **top 20 de queries por tiempo total** y por tiempo medio. Ese ranking define el orden real de trabajo de la Fase 1.
- [ ] Para las 3–4 rutas más lentas, correr `EXPLAIN (ANALYZE, BUFFERS)` y guardar el plan. Buscar: `Seq Scan` sobre tablas grandes, `Sort` en disco, `Nested Loop` con muchas filas.
- [ ] Medir el bundle: `ANALYZE=true next build` con `@next/bundle-analyzer`. Anotar el peso del chunk de cada componente de ejecución.

**Entregable:** un archivo `perf-baseline.md` con: top queries, planes EXPLAIN de las rutas lentas, y tamaño de bundle por ruta.

---

## Fase 1 — Base de datos (mayor impacto)

La latencia percibida en dashboards analíticos casi siempre es la DB. Empieza aquí.

### 1.1 Índices dirigidos por EXPLAIN
- [x] Revisar `scripts/add-indexes-p0.mjs` contra el top de queries de Fase 0. Confirmar que cada query lenta tiene índice que cubre su `WHERE` + `ORDER BY`. — *17 índices aplicados 2026-07-20, ver script*
- [ ] Para queries que filtran por país/cadena/fecha (patrón dominante aquí), crear índices compuestos en ese orden: `(pais, cadena, fecha)` o el que revele el EXPLAIN. El orden de columnas importa.
- [ ] Considerar índices **parciales** para filtros recurrentes (ej. `WHERE ventas > 0`, o por país activo) — reducen tamaño de índice y aceleran.
- [ ] Considerar índices **covering** (`INCLUDE (...)`) para las columnas que se seleccionan, y así lograr `Index Only Scan`.
- [ ] Después de cada índice: re-correr `EXPLAIN ANALYZE` y confirmar que el planner lo usa. Un índice que el planner ignora es peso muerto.

### 1.2 Vistas materializadas para agregaciones
- [x] Identificar las agregaciones que se recalculan en cada request. — *MVs actuales: `mv_walmart_mensual`, `mv_sellout_mensual`, `mv_ventas_agg`, `mv_sku_mensual`, `mv_exito_mensual`, `mv_vpd_90d`*
- [ ] Crear MVs por grano de consulta faltantes: `mv_ejecucion_walmart_diaria`, `mv_kpis_exito`, `mv_walmart_cobertura_ultima` (identificada como P0 en audit).
- [ ] Indexar las MVs igual que tablas normales.
- [ ] Refrescar con `REFRESH MATERIALIZED VIEW CONCURRENTLY` (requiere índice único) desde los scripts de carga (`cargar-*.mjs`), justo después de ingerir. Nunca refrescar en el path de request.
- [ ] Regla: si un cálculo depende solo de datos que cambian 1×/día (cargas batch), no tiene por qué ejecutarse en cada request. Va a MV.

### 1.3 Query hygiene en los ~120 endpoints
- [ ] **N+1 en 4 endpoints de innovaciones** identificado (P0): `wm/`, `co/exito/`, `sv/selectos/`, `gt/unisuper/`. Cada uno hace 3-5 queries por SKU en un `for` loop. Reescribir a 1 query con `GROUP BY`.
- [ ] Eliminar `SELECT *` en tablas anchas de ventas. Seleccionar solo columnas usadas → menos I/O y habilita Index Only Scan.
- [ ] Paginar/limitar cualquier endpoint que devuelva miles de filas al cliente. Si la tabla del front pagina, el query también debe.
- [ ] Empujar cálculo a SQL, no a JS. Sumas, promedios, DOH, ratios → `GROUP BY` en el servidor, no `.reduce()` sobre 50k filas en el endpoint.

### 1.4 Connection pool (crítico en serverless)
- [ ] En `lib/db/pool.ts`: confirmar que apuntas al **pooler de Supabase en modo transaction** (puerto 6543), no a la conexión directa (5432), si corres en funciones serverless/edge.
- [ ] Ajustar `max` del pool node-pg a un valor bajo por instancia (serverless multiplica instancias × conexiones; agotas el pooler rápido). Empieza con `max: 1–3` por instancia y sube según métricas.
- [ ] Setear `statement_timeout` e `idle_in_transaction_session_timeout` para que un query colgado no bloquee el pool.
- [ ] Asegurar que el pool es **singleton** (no crear pool por request). En Next dev el hot-reload puede duplicarlo; usar el patrón `globalThis` para reusar.

---

## Fase 2 — Server Components, caching y streaming

Con la DB rápida, ahora que Next no repita trabajo ni bloquee el render.

### 2.1 Data Cache de Next (`unstable_cache` / `fetch` cache)
- [x] Endpoints `revalidate` alineados a cadencia de carga (batch diario). — *walmart/inventario, selectos-kpis, sell-in/variaciones → 1800s; walmart/filtros-opciones → 3600s (2026-07-20)*
- [ ] Envolver los reads que no cambian dentro del día con `unstable_cache(fn, keys, { revalidate, tags })`. Los KPIs batch son perfectos: `revalidate` de horas, no segundos.
- [ ] Usar **tags** por país/cadena y revalidar (`revalidateTag`) desde el script de carga cuando entran datos nuevos. Así el cache es fresco sin TTL corto.
- [ ] React `cache()` para deduplicar el mismo query dentro de un solo render (varios componentes piden los mismos datos → un solo hit).

### 2.2 Server Components donde hoy hay Client
- [ ] Los componentes de ejecución gigantes probablemente son `"use client"` completos. Auditar: la tabla y los KPIs que solo muestran datos **no necesitan** ser client. Muévelos a Server Components y deja `"use client"` solo en las islas interactivas (filtros, ordenamiento, tabs).
- [ ] Patrón: `page.tsx` (server) hace el fetch y pasa datos ya calculados a un componente cliente delgado que solo maneja interacción. Menos JS al navegador, menos hidratación.

### 2.3 Streaming con Suspense
- [x] `dashboard/loading.tsx` existe en las rutas principales (`comercial/ejecucion`, `comercial/sell-in`, `comercial/sellout`).
- [ ] Añadir `<Suspense>` **por sección** dentro de las páginas pesadas: KPIs cargan primero (rápidos), la tabla grande hace stream después. El usuario ve algo en <1s en vez de esperar el request más lento.
- [ ] Envolver cada bloque de datos independiente en su propio Suspense con skeleton propio.

### 2.4 Revalidación / ISR
- [ ] Para rutas cuyo dato cambia 1×/día, `export const revalidate = 3600` (o el tag-based de 2.1). Evita recomputar en cada visita.

---

## Fase 3 — Cliente y bundle (los archivos gigantes)

`ExitoEjecucion.tsx` (4154), `SelectosView.tsx` (4020), `WalmartEjecucion.tsx` (2936). Duelen en bundle, hidratación y re-renders.

### 3.1 Code splitting
- [x] Rutas `sv/selectos` y `gt/unisuper` envueltas en `next/dynamic`. — *2026-07-20*
- [x] `InnovacionesSection` cargada dinámicamente en `gt/unisuper` (solo al abrir el tab). — *2026-07-20*
- [x] Rutas `cr/walmart`, `co/grupo-exito`, `cr/sensacion`, `cr/costa-dairy` ya usan `dynamic()`.
- [ ] Separar por cadena: si el usuario entra a Walmart CR, no debería descargar el bundle de Éxito CO. La ruta `[dept]/[modulo]` ya ayuda; confirma que no hay un barrel import que jale todo.
- [ ] `dynamic(() => import(...), { ssr: false, loading: ... })` para vistas que no son visibles al cargar (tabs secundarios, modales, secciones colapsadas). No pagas su JS hasta que se abren.

### 3.2 Romper los componentes de 4000 líneas
- [ ] Extraer sub-vistas puras a archivos propios (una tabla, un bloque de KPIs, un chart por archivo). No es solo limpieza: permite memoizar y code-split por pieza.
- [ ] Hacerlo **incremental y verificado**: extrae un bloque, corre la ruta, confirma que se ve igual, commit. Repite. No muevas 4000 líneas de golpe.

### 3.3 Memoización y re-renders
- [x] Debounce 300ms en `filterKey` de `WalmartEjecucion` — evita disparar 5+ fetches por toggle. — *2026-07-20*
- [ ] `React.memo` en filas/celdas de tablas grandes para que un cambio de filtro no re-renderice 10k nodos.
- [ ] `useMemo` para los cálculos derivados pesados (ordenar/agrupar/formatear) que hoy corren en cada render.
- [ ] `useCallback` en handlers pasados a listas memoizadas (si no, rompes el memo).
- [ ] Revisar el `DashboardProvider` / contextos globales: un cambio de un filtro no debería re-renderizar todo el árbol. Separar contextos por dominio o usar selectores.

### 3.4 Virtualización de tablas
- [ ] Cualquier tabla que pinte cientos/miles de filas: virtualizar con `@tanstack/react-virtual`. Solo renderiza lo visible. Esto solo ya elimina el jank de scroll y baja el tiempo de montaje drásticamente.

---

## Fase 4 — Red y assets (pulido)

- [x] `next/font` (self-host de DM Sans + Syne, `display=swap`, CSS variables). — *2026-07-20, elimina round trip a Google Fonts*
- [ ] Comprimir/servir imágenes con `next/image` si hay logos/gráficas rasterizadas (`borden-logo.png` sigue como `<img>`).
- [ ] Revisar que las respuestas de API vayan con `Cache-Control` apropiado y compresión (gzip/br) activa (Vercel lo hace por default; verificar en headers).
- [ ] Prefetch de rutas probables con `<Link prefetch>` en la navegación del sidebar (Next.js Link ya prefetch por default; verificar).

---

## Reglas de oro (para no romper nada)

1. **Mide antes y después de cada tarea.** Sin número, no hubo mejora.
2. **DB primero.** El 80% de la latencia de un dashboard analítico está en queries, no en React.
3. **No recalcular en cada request** lo que solo cambia con la carga batch. Eso es MV + cache con tags.
4. **Refactor incremental y commiteado.** Nada de mover miles de líneas sin verificar la ruta entre pasos.
5. **Un índice que el planner ignora no cuenta.** Verifica con EXPLAIN que se usa.

---

## Checklist de progreso (llenar con deltas reales)

| Ruta / Endpoint         | Baseline (ms) | Después (ms) | Cambio aplicado            |
|-------------------------|---------------|--------------|----------------------------|
| /CO/exito (ejecución)   |               |              |                            |
| /CR/walmart (ejecución) |               |              |                            |
| /SV/selectos            |               |              |                            |
| KPIs innovaciones       |               |              |                            |
| Bundle CO Éxito (KB)    |               |              |                            |
