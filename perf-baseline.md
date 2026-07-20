# perf-baseline.md — Baseline de performance bl-dashboard

Snapshot inicial tras aplicar Fase 1 (índices + revalidate + dynamic + next/font).
Fecha: 2026-07-20 · Env: producción (bordenlat.com · Supabase pooler AWS us-east-2).

Este documento es la **línea base** contra la que comparar futuras optimizaciones.

---

## 1. Instrumentación activa

- `lib/api/withTiming.ts` — wrapper que loguea `[api] route=… ms=… rows=… status=…` a stdout de la function.
- Aplicado a 6 endpoints pesados:
  - `/api/comercial/ejecucion/wm/innovaciones`
  - `/api/comercial/ejecucion/co/exito/innovaciones`
  - `/api/comercial/ejecucion/sv/selectos/innovaciones`
  - `/api/comercial/ejecucion/gt/unisuper/innovaciones`
  - `/api/comercial/ejecucion/walmart/cobertura`
  - `/api/comercial/ejecucion/walmart/inventario`
  - `/api/comercial/ejecucion/walmart/top-skus`
- Bundle analyzer: `npm run analyze` → reports en `.next/analyze/{client,edge,nodejs}.html`.
- Postgres: `pg_stat_statements v1.11` activo.

---

## 2. Top 10 queries por tiempo total (pg_stat_statements)

| # | Query (100 chars)                                          | Calls | Total ms  | Mean ms  | % pool |
|---|------------------------------------------------------------|------:|----------:|---------:|-------:|
| 1 | `SELECT categoria AS nombre, SUM(ventas_valor)…`           |   337 | 9,509,010 | 28,216.6 |   6.2% |
| 2 | `SELECT cliente AS nombre, SUM(ventas_valor)…`             |   205 | 5,776,473 | 28,177.9 |   3.7% |
| 3 | `SELECT SUM(ventas_valor) AS total, SUM(unidades)…`        |   274 | 4,813,327 | 17,566.9 |   3.1% |
| 4 | `SELECT SUM(ventas_valor) AS total, SUM(unidades)…`        |   276 | 4,088,183 | 14,812.3 |   2.6% |
| 5 | `SELECT SUM(ventas_valor) AS total_valor…`                 |   142 | 3,894,001 | 27,422.5 |   2.5% |
| 6 | `REFRESH MATERIALIZED VIEW mv_sellout_mensual`             |   106 | 2,860,331 | 26,984.3 |   1.9% |
| 7 | `SELECT ano, mes, SUM(ventas_valor)…`                      |   142 | 2,690,887 | 18,949.9 |   1.7% |
| 8 | `SELECT pais, SUM(ventas_valor)…`                          |   123 | 2,343,694 | 19,054.4 |   1.5% |
| 9 | `SELECT ano, mes, COUNT(DISTINCT pais) …`                  |    63 | 2,195,366 | 34,847.1 |   1.4% |
|10 | `WITH cur AS (SELECT SUM(ventas_valorusd) AS valor…`       |   286 | 2,182,500 |  7,631.1 |   1.4% |

**Diagnóstico**: los agregadores `GROUP BY categoria|cliente|pais` sobre `fact_sales_sellout` (sospecha) dominan el tiempo total. Mean 15-35s por query — apuntan a MV faltante o falta de índice cubriendo esas dimensiones.

## 3. Top 10 queries por tiempo medio (más lentas)

| # | Query (100 chars)                                          | Calls | Mean ms | Max ms   |
|---|------------------------------------------------------------|------:|--------:|---------:|
| 1 | `SELECT SUM(ventas_valor)…`                                |    32 |  55,058 | 115,573  |
| 2 | `SELECT categoria AS nombre, SUM(ventas_valor)…`           |     5 |  44,966 |  68,097  |
| 3 | `SELECT pais AS nombre, SUM(ventas_valor)…`                |     5 |  43,731 |  74,713  |
| 4 | `SELECT SUM(ventas_valor)…`                                |     4 |  40,393 |  41,814  |
| 5 | `WITH cutoff AS (MAX(mes * 100 + dia) FROM v_ventas)…`     |    12 |  36,384 |  51,293  |
| 6 | `UPDATE fact_sales_sellout SET codigo_barras = dp.…`       |     6 |  36,237 |  97,276  |
| 7 | `SELECT ano, mes, COUNT(DISTINCT pais)…`                   |    63 |  34,847 |  88,262  |
| 8 | `SELECT cliente AS nombre, SUM(ventas_valor)…`             |     5 |  34,322 |  46,666  |
| 9 | `SELECT ano, mes, SUM(ventas_valor)…`                      |    34 |  33,717 |  98,875  |
|10 | `SELECT pais, SUM(ventas_valor)…`                          |    32 |  33,437 |  96,805  |

## 4. EXPLAIN ANALYZE — queries críticas identificadas por el audit

| Query                                              | Exec ms | Uses Index | Seq Scan on fact_* |
|----------------------------------------------------|--------:|:----------:|:------------------:|
| `wm/innovaciones :: primera venta CR (CTE base)`   | **3,446** | ✗       | **⚠ SÍ**           |
| `wm/innovaciones :: monthly por SKU (bucle N+1)`   |    19.6 | ✓          | no                 |
| `walmart/cobertura :: última fecha + join 90d`     |    38.5 | ✓          | no                 |
| `walmart/top-skus :: agregado por SKU 2026`        |    18.8 | ✓          | no                 |
| `walmart/inventario/sku-tienda :: última fecha`    |     1.4 | ✓          | no                 |
| `sell-in/kpis :: agregación por ano_pedido`        |    22.3 | ✓          | no                 |

**Hallazgo clave**: la CTE base de `wm/innovaciones` toma 3.4s por sí sola con **Seq Scan** sobre `fact_ventas_walmart`. El patrón `GROUP BY COALESCE(NULLIF(sku,''), codigo_barras)` no es sargable — ningún índice puede cubrirlo directamente. Combinado con el N+1 (5 queries × 9 SKUs) → **~4.3s por request** de innovaciones Walmart.

## 5. Bundle sizes por ruta clave (build production)

Baseline post-Fase-1 (después de dynamic + next/font):

| Ruta                                                | Route size | First Load JS |
|-----------------------------------------------------|-----------:|--------------:|
| `/dashboard/comercial/ejecucion/co/grupo-exito`     |    30.8 kB |     **243 kB**|
| `/dashboard/comercial/ejecucion/sv/selectos`        |    38.4 kB |     **253 kB**|
| `/dashboard/comercial/ejecucion/cr/walmart`         |     1.25 kB |    251 kB     |
| `/dashboard/comercial/ejecucion/cr/sensacion`       |     9.74 kB |    217 kB     |
| `/dashboard/comercial/ejecucion/cr/costa-dairy`     |     7.67 kB |    208 kB     |
| `/dashboard/comercial/ejecucion/gt/walmart`         |     1.25 kB |    251 kB     |
| `/dashboard/comercial/ejecucion/gt/unisuper`        |     2.59 kB |     99.7 kB   |
| `/dashboard/comercial/sell-in`                      |     0.18 kB |    152 kB     |
| `/dashboard/comercial/sell-in/resumen`              |     7.56 kB |    204 kB     |
| `/dashboard/comercial/sell-in/licenciamiento`       |     2.48 kB |    144 kB     |
| `/dashboard/comercial/sellout/ytd`                  |     5.96 kB |    150 kB     |
| `/dashboard/mercadeo/pais`                          |     3.24 kB |    263 kB     |
| First Load JS shared by all                         |            |     87.9 kB   |

**Observaciones**:
- El shell shared (87.9 kB) es razonable.
- Rutas más pesadas: Éxito CO (243 kB), Selectos SV (253 kB) y Mercadeo país (263 kB).
- Todas las Walmart de país comparten componente `WalmartEjecucion` (251 kB) — chunk único, reutilizado.
- Reports HTML disponibles en `.next/analyze/{client,edge,nodejs}.html` para drill-down por módulo.

## 6. Índices verificados (post-Fase-1)

17 índices creados en `scripts/add-indexes-p0.mjs` — usados por el planner según los EXPLAIN:
- `idx_fvw_pais_codigo_barras`, `idx_fvw_pais_fecha`, `idx_fvw_pais_sku_composite`, `idx_fvw_pais_punto_venta`
- `idx_fiwp_pais_fecha`, `idx_fiwp_pais_pdv`, `idx_fiwp_pais_cadena`, `idx_fiwp_pais_codigo_barras`, `idx_fiwp_pais_sku`
- `idx_fiwc_pais_fecha`, `idx_fiwc_pais_codigo_barras`
- `idx_fvs_codigo_barras`, `idx_fvu_codigo_barras`
- `idx_fve_pais_sku`, `idx_fve_pais_codigo_barras`
- `idx_fss_ano_pedido`, `idx_fss_cliente_ano`

---

## 7. Priorización tras el baseline

| P | Item                                                | Impacto estimado                        |
|---|-----------------------------------------------------|-----------------------------------------|
| **P0** | Reescribir innovaciones (CTE Seq Scan + N+1)   | 4.3s → 400ms (~90% menos)               |
| **P0** | Investigar el top 10 de pg_stat_statements (queries agregadoras 15-55s mean) | crear MV específica o funcional index |
| **P1** | MV `mv_walmart_cobertura_ultima` pre-agregada  | Cobertura de 38ms a <5ms                |
| **P1** | Migrar Resumen a Server Component + Suspense   | Elimina waterfall de 6-11 fetches       |
| **P2** | Extraer secciones de ExitoEjecucion.tsx (4154 líneas) en subcomponentes lazy | 243 kB → ~120 kB First Load JS |
| **P2** | `React.memo` + virtualización en tablas grandes | Cortar re-renders + jank de scroll     |

---

## 8. Cómo re-medir

**Endpoint puntual** (después de un cambio):
```bash
# Vercel logs → filtrar "[api] route=/api/comercial/ejecucion/wm/innovaciones"
# comparar mean ms antes/después.
```

**pg_stat_statements** (reset y remedir):
```sql
SELECT pg_stat_statements_reset();
-- ejercitar la ruta desde el dashboard 20-30 veces
SELECT query, calls, ROUND(mean_exec_time::numeric,1) mean_ms
FROM pg_stat_statements
WHERE query ILIKE '%fact_ventas_walmart%'
ORDER BY mean_exec_time DESC LIMIT 10;
```

**Bundle**:
```bash
npm run analyze
# abrir .next/analyze/client.html
```

**EXPLAIN**:
```bash
node tmp_explain_analyze.mjs  # (o mover a scripts/ si se quiere mantener)
```
