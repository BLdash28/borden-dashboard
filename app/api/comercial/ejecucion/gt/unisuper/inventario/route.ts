import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'
import { handleApiError } from '@/lib/api/errors'

export const revalidate = 1800

/**
 * Inventario Unisuper GT — desde tabla `inventario_unisuper`.
 * Resuelve SKU/descripción/categoría/subcategoría vía `dim_producto` por EAN
 * normalizado (leading zeros + check digit), replicando la lógica del bot
 * Python `_ean_variants`. Necesario porque `inventario_unisuper` guarda SKUs
 * y descripciones nativos de Unisuper que no matchean directo con BL Foods.
 *
 * Nota: el filtro `subcategorias` se aplica POST-resolución para que use la
 * subcategoría canónica de dim_producto, no la del retailer.
 */
function csv(sp: URLSearchParams, key: string): string[] {
  const v = sp.get(key)
  return v ? v.split(',').map(s => s.trim()).filter(Boolean) : []
}

// Overrides retailer-EAN → SKU BL Foods (mismo diccionario que unisuper_ingest.py).
// Usado cuando el EAN del retailer no matchea via _eanVariants (ambos EANs válidos
// pero con distinto check digit, típicamente dim_producto guardado con leading
// zero implícito y trailing 0 en vez de check real).
const EAN_OVERRIDE: Record<string, string> = {
  '0053000071884': '130748', // BORDEN QUESO MOZZARELLA RALLADO 32 OZ
}

function eanVariants(ean: string): string[] {
  if (!ean) return []
  const digits = String(ean).replace(/\D/g, '')
  if (!digits) return []
  const stripped = digits.replace(/^0+/, '')
  const out = new Set<string>([digits])
  if (stripped) out.add(stripped)
  if (digits.length > 1) out.add(digits.slice(0, -1))
  if (stripped.length > 1) out.add(stripped.slice(0, -1))
  return Array.from(out)
}

type DimRow = { sku: string; codigo_barras: string; descripcion: string; categoria: string | null; subcategoria: string | null }

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams
    const cadenas = csv(sp, 'cadenas')
    const subcats = csv(sp, 'subcategorias')

    // 1) Cargar dim_producto y armar índice de variantes de EAN
    const dimR = await pool.query<DimRow>(`
      SELECT sku, codigo_barras, descripcion, categoria, subcategoria
      FROM dim_producto WHERE codigo_barras IS NOT NULL
    `)
    const dimByEan = new Map<string, DimRow>()
    for (const r of dimR.rows) {
      for (const v of eanVariants(r.codigo_barras)) {
        if (!dimByEan.has(v)) dimByEan.set(v, r)
      }
    }
    const skuToRow = new Map<string, DimRow>(dimR.rows.map(r => [r.sku, r]))
    for (const [eanRetailer, skuBorden] of Object.entries(EAN_OVERRIDE)) {
      const row = skuToRow.get(skuBorden)
      if (!row) continue
      for (const v of eanVariants(eanRetailer)) dimByEan.set(v, row)
    }
    const resolve = (codigoBarra: string | null): DimRow | null => {
      if (!codigoBarra) return null
      for (const v of eanVariants(codigoBarra)) {
        const p = dimByEan.get(v)
        if (p) return p
      }
      return null
    }

    // 2) Snapshot del último día (aplica filtro cadenas en SQL — el de subcategorías
    //    se aplica post-resolución para respetar la subcategoría canónica)
    const params: unknown[] = []
    let cadenaFilter = ''
    if (cadenas.length) {
      const start = params.length
      cadenas.forEach(v => params.push(v))
      cadenaFilter = `AND i.cadena IN (${cadenas.map((_, i) => `$${start + 1 + i}`).join(',')})`
    }

    const snapR = await pool.query(`
      WITH ult AS (SELECT MAX(fecha) AS f FROM inventario_unisuper WHERE pais='GT')
      SELECT
        i.codigo_sku       AS sku_ret,
        i.codigo_barra     AS codigo_barras,
        i.descripcion_sku  AS desc_ret,
        i.subcategoria     AS subcat_ret,
        i.categoria        AS cat_ret,
        i.cadena,
        i.nombre_sucursal  AS punto_venta,
        i.cantidad::float  AS inv_und,
        i.valor_gtq::float AS valor_gtq,
        (SELECT f::date FROM ult) AS fecha_snap
      FROM inventario_unisuper i
      WHERE i.pais='GT' AND i.fecha = (SELECT f FROM ult)
        ${cadenaFilter}
    `, params)

    const fechaSnap = snapR.rows[0]?.fecha_snap ?? null

    // 3) Resolver via dim_producto + consolidar por (sku_resuelto, cadena, punto_venta)
    type Row = { sku: string; codigo_barras: string; descripcion: string; categoria: string | null; subcategoria: string | null; cadena: string; punto_venta: string; inv_mano: number; valor_gtq: number }
    const consolidated = new Map<string, Row>()
    const pdvsSet = new Set<string>()
    const skusSet = new Set<string>()
    let totalUds = 0
    let totalValor = 0

    for (const r of snapR.rows) {
      const p = resolve(r.codigo_barras)
      const sku          = p?.sku          ?? String(r.sku_ret ?? '')
      const descripcion  = p?.descripcion  ?? String(r.desc_ret ?? '')
      const subcategoria = p?.subcategoria ?? (r.subcat_ret ?? null)
      const categoria    = p?.categoria    ?? (r.cat_ret ?? null)
      const codigoBarras = p?.codigo_barras ?? String(r.codigo_barras ?? '')

      if (subcats.length && !subcats.includes(String(subcategoria ?? ''))) continue

      const key = `${sku}|${r.cadena}|${r.punto_venta}`
      let a = consolidated.get(key)
      if (!a) {
        a = { sku, codigo_barras: codigoBarras, descripcion, categoria, subcategoria, cadena: r.cadena, punto_venta: r.punto_venta, inv_mano: 0, valor_gtq: 0 }
        consolidated.set(key, a)
      }
      a.inv_mano  += Number(r.inv_und)   || 0
      a.valor_gtq += Number(r.valor_gtq) || 0
      totalUds    += Number(r.inv_und)   || 0
      totalValor  += Number(r.valor_gtq) || 0
      pdvsSet.add(r.punto_venta)
      skusSet.add(sku)
    }

    const disponible = totalUds > 0 || consolidated.size > 0
    if (!disponible) return NextResponse.json({ disponible: false })

    const rowsFinal = Array.from(consolidated.values())
      .sort((a, b) => b.inv_mano - a.inv_mano)
      .slice(0, 3000)

    return NextResponse.json({
      disponible: true,
      pais: 'GT',
      kpis: {
        fecha_tiendas:    fechaSnap,
        fecha_cedi:       fechaSnap,
        pdv_inv:          totalUds,
        pdv_valor:        totalValor,
        pdv_tiendas_dist: pdvsSet.size,
        cedi_unidades:    0,
        cedi_valor:       0,
        cedi_skus:        0,
        skus_total:       skusSet.size,
      },
      cedi_rows: [],
      rows: rowsFinal,
    })
  } catch (err) {
    return handleApiError(err)
  }
}
