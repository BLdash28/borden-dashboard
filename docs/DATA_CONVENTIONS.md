# Convenciones de datos — bl-dashboard

Reglas obligatorias para endpoints que exponen productos al dashboard.

## Regla 1 — Descripción, categoría, subcategoría siempre desde `dim_producto`

Las tablas de retailer (`fact_ventas_unisuper`, `fact_ventas_walmart`,
`fact_ventas_exito`, `inventario_unisuper`, `surtido_unisuper`, etc.) guardan
la descripción **como la envía el retailer**, con formato inconsistente:

```
"2007398-BORDEN QUESO CHEDDAR MILD SNACK BARS 7.5OZ"     ← Unisuper
"2086537-BORDEN QUESO MOZZARELLA RALLADO 32 OZ"          ← Unisuper (código embebido)
"BORDEN MUESTER QUESO RODEAJEADO 10U"                    ← con typos
"BORDEN LONCHAS IMITACION AMERICANO X 180 G"             ← formato Éxito
```

**Nunca** exponer estas descripciones al usuario. Siempre `LEFT JOIN dim_producto`
por `sku` (o `codigo_barras` como fallback) y usar `dim_producto.descripcion`,
`.categoria`, `.subcategoria`:

```sql
LEFT JOIN dim_producto dp ON dp.sku = t.sku
SELECT
  t.sku,
  COALESCE(dp.descripcion,  t.descripcion)  AS descripcion,
  COALESCE(dp.categoria,    t.categoria)    AS categoria,
  COALESCE(dp.subcategoria, t.subcategoria) AS subcategoria,
  ...
```

Con `COALESCE` a la del retailer como fallback (solo si el SKU no existe en
dim_producto, que debería ser cada vez menos frecuente).

## Regla 2 — SKU siempre BL Foods (`dim_producto.sku`), no retailer

Los retailers guardan SKUs internos distintos para el mismo producto:

| Producto | BL Foods | Unisuper | Éxito | Walmart |
|---|---|---|---|---|
| Mozzarella Reg Cut Shred 32oz | `130748` | `2086537` | — | `75332133` |
| Americano light | `130685` | `2007516` | — | — |

Los endpoints deben devolver **siempre** el SKU BL Foods. La resolución vive
en dos capas:

1. **En la ingesta** — el bot Python resuelve al insertar (`_ean_variants`
   en `unisuper_ingest.py`, `EAN_OVERRIDE` para casos edge)
2. **En el endpoint** — si la ingesta no resolvió (tabla legacy, falta EAN),
   hacer resolución vía `dim_producto` por `codigo_barras`. Ejemplo:
   [`app/api/comercial/ejecucion/gt/unisuper/inventario/route.ts`](../app/api/comercial/ejecucion/gt/unisuper/inventario/route.ts)

## Regla 3 — Código de barras canónico

Al mostrar/exportar EAN, usar el de `dim_producto.codigo_barras`. Los EANs del
retailer pueden traer variantes (leading zero, check digit corrupto, etc.).
Ver [`reference_unisuper_ean_override.md`](../../.claude/…/memory/reference_unisuper_ean_override.md)
en memoria para el patrón de override.

## Cómo detectar endpoints que violan estas reglas

```bash
# Grep de queries que devuelven descripcion sin JOIN a dim_producto:
grep -rlE "MAX\(.*descripcion\)|(\bt\.|\bi\.|\bs\.|\bf\.)descripcion\b" app/api \
  | while read f; do
      grep -L "dim_producto" "$f" && echo "  ⚠️  falta JOIN dim_producto en $f"
    done
```

Casos válidos donde no aplica el join (agregaciones puras sin exponer producto):
- Filtros de opciones (`filtros-opciones/route.ts`): solo devuelve valores únicos
- KPIs agregados sin detalle de producto

## Prevención futura

- Cuando agregues un endpoint nuevo que devuelve productos, revisá esta guía primero.
- Si estás modificando uno viejo y notás que devuelve descripción raw, arreglá
  el JOIN de una vez.
- El resolver de SKU en el bot Python (`unisuper_ingest.py`, `surtido_ingest.py`)
  ya maneja aliases + fuzzy matching + overrides — ampliá esos diccionarios si
  aparecen typos nuevos.
