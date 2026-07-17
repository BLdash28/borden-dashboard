# Ofertas · Impacto — Setup

Módulo nuevo en `/dashboard/comercial/ofertas-impacto`. Coexiste con el módulo
Ofertas viejo (`dim_ofertas`, ruta `/dashboard/comercial/ofertas`), no lo toca.

## Instalación

Ejecutar **una sola vez** contra el Postgres de Supabase (misma instancia que
`v_ventas` y `dim_producto`). Dos opciones equivalentes:

**A. Supabase SQL Editor** — pegar el contenido de `db/ofertas_impacto_schema.sql` y correr.

**B. psql con la connection string directa** (`DATABASE_URL`, port 5432):

```bash
psql "$DATABASE_URL" -f db/ofertas_impacto_schema.sql
```

Los endpoints en `app/api/ofertas-impacto/*` usan el mismo `pool` (`lib/db/pool.ts`)
que ya conecta a Supabase Postgres. El auth de usuario se resuelve en la capa
API con `requireAuth()` — las tablas nuevas no necesitan RLS mientras se
accedan solo desde los endpoints.

Esto crea:
- `ofertas` — cabecera (1 país + N cadenas + N semanas ventana)
- `oferta_productos` — 1:N con la oferta, guarda `upc` ya normalizado (13 dígitos)
- `analizar_oferta_impacto(oferta_id UUID)` — RPC que devuelve la tabla por SKU

## Modelo mental

- **1 oferta = 1 mecánica de precio que aplica a N SKUs** en 1 país y ≥ 1 cadena
- **Baseline por-SKU** (crítico): las ventas del SKU en las N semanas antes de la vigencia, sumando las cadenas seleccionadas antes de promediar
- **Ventanas**:
  - `antes`   = `[wk_inicio - N sem, wk_inicio)`
  - `durante` = `[wk_inicio, wk_fin]`
  - `despues` = `(wk_fin, wk_fin + N sem]` — NULL si la oferta aún no cerró o queda menos de N/2 semanas post-cierre

## KPIs por SKU

| Campo | Definición |
|---|---|
| `baseline_semanal` | `AVG(uds)` sobre semanas del baseline (0 en semanas sin venta) |
| `durante_semanal` | `AVG(uds)` sobre semanas de vigencia |
| `despues_semanal` | `AVG(uds)` sobre semanas post-vigencia, o NULL si no aplica |
| `uplift_pct` | `(durante − baseline) / baseline × 100`, NULL si baseline = 0 |
| `pull_forward_flag` | `despues < baseline` — el SKU vendió menos después que antes de la promo (adelantó compras) |
| `venta_incremental_neta` | `MAX(0, durante − baseline) × n_dur − MAX(0, baseline − despues) × n_desp` |
| `semanas_con_venta` | Cuántas de las N semanas del baseline tuvieron venta > 0 |
| `baseline_confiable` | `semanas_con_venta / N ≥ 0.5` |

## Verificación manual

```sql
-- 1. Ver una oferta cargada
SELECT id, nombre, pais, cadenas, vigencia_inicio, vigencia_fin
FROM ofertas ORDER BY created_at DESC LIMIT 5;

-- 2. Correr el análisis
SELECT upc, descripcion, baseline_semanal, durante_semanal, uplift_pct,
       pull_forward_flag, venta_incremental_neta, semanas_con_venta
FROM analizar_oferta_impacto('<oferta_id>');
```

## Fase B pendiente

- Chart Recharts con la serie semanal (`serie_semanal` ya viene en el RPC)
- Cargar con `next/dynamic` para no pesar la ruta de listado
- Toggle vista agregada ↔ por-SKU
