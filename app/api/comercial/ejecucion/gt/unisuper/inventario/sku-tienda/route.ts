import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'
import { handleApiError } from '@/lib/api/errors'

export const dynamic = 'force-dynamic'

/**
 * Detalle Inventario Unisuper GT por SKU × Tienda del último snapshot.
 * Resuelve SKU/descripción vía dim_producto por EAN (mismas variantes que
 * el bot Python) para que las tablas de Quiebres / Inv Bajo muestren el
 * SKU BL Foods canónico y no el codigo_sucursal buggy o el SKU Unisuper.
 * Calcula DOH (days on hand) usando velocidad de venta últimos 90d.
 */
function csv(sp: URLSearchParams, key: string): string[] {
  const v = sp.get(key)
  return v ? v.split(',').map(s => s.trim()).filter(Boolean) : []
}

const EAN_OVERRIDE: Record<string, string> = {
  '0053000071884': '130748', // BORDEN QUESO MOZZARELLA RALLADO 32 OZ
  '0053000052036': '139893', // BORDEN QUESO CHEDDAR MILD SNACK BARS 7.5OZ → 139893 DESCONTINUADO
  '0053000053361': '137693', // BORDEN QUESO EN RODAJA ASIAGO 6OZ → 137693 DESCONTINUADO
  '0053000057253': '136912', // BORDEN QUESO RODAJAS HAVARTI 6OZ → 136912 DESCONTINUADO
  '0053000006053': '130634', // BORDEN QUESO RODAJADO AMERICANO LIGHT MILK 6.56OZ → 130634 DESCONTINUADO
  '0053000068037': '139896', // BORDEN QUESO PEPPER JACK SNACK BARS 7.5OZ → 139896 DESCONTINUADO
  '0053000072157': '144358', // BORDEN QUESO MOZZARELLA STRING KID BULDER 10 OZ → 144358 KID MOZARELLA DESCONTINUADO
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
    const sp       = req.nextUrl.searchParams
    const cadenas  = csv(sp, 'cadenas')
    const saludArr = csv(sp, 'saludes')
    const prod     = (sp.get('prod') ?? '').toLowerCase()

    // 1) Cargar dim_producto + índice EAN + override
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
    for (const [eanRet, skuBord] of Object.entries(EAN_OVERRIDE)) {
      const row = skuToRow.get(skuBord)
      if (row) for (const v of eanVariants(eanRet)) dimByEan.set(v, row)
    }
    const resolve = (ean: string | null): DimRow | null => {
      if (!ean) return null
      for (const v of eanVariants(ean)) {
        const p = dimByEan.get(v)
        if (p) return p
      }
      return null
    }

    // 2) Query snapshot (filtro cadenas en SQL, resto post)
    const params: unknown[] = []
    let cadenaFilter = ''
    if (cadenas.length) {
      const start = params.length
      cadenas.forEach(v => params.push(v))
      cadenaFilter = `AND i.cadena IN (${cadenas.map((_, i) => `$${start + 1 + i}`).join(',')})`
    }
    const snapR = await pool.query(`
      WITH ult AS (SELECT MAX(fecha) AS f FROM inventario_unisuper WHERE pais='GT'),
      vel AS (
        SELECT codigo_barras, sku,
               ROUND((SUM(ventas_unidades) / 90.0)::numeric, 4) AS venta_dia
        FROM fact_ventas_unisuper
        WHERE pais='GT' AND fecha >= CURRENT_DATE - INTERVAL '90 day' AND ventas_unidades > 0
        GROUP BY codigo_barras, sku
      )
      SELECT
        i.codigo_sku       AS sku_ret,
        i.codigo_barra     AS codigo_barras,
        i.descripcion_sku  AS desc_ret,
        i.subcategoria     AS subcat_ret,
        i.cadena,
        i.nombre_sucursal  AS punto_venta,
        i.cantidad::float  AS inv_und,
        COALESCE(v_ean.venta_dia, v_sku.venta_dia, 0)::float AS venta_dia
      FROM inventario_unisuper i
      LEFT JOIN vel v_ean ON v_ean.codigo_barras = i.codigo_barra
      LEFT JOIN vel v_sku ON v_sku.sku = i.codigo_sku
      WHERE i.pais='GT' AND i.fecha = (SELECT f FROM ult)
        ${cadenaFilter}
    `, params)

    // 3) Resolver via dim_producto + consolidar por (sku_resuelto, cadena, punto_venta)
    type Row = { sku: string; codigo_barras: string; descripcion: string; subcategoria: string | null; cadena: string; punto_venta: string; inv_mano: number; venta_dia: number }
    const consolidated = new Map<string, Row>()

    for (const r of snapR.rows) {
      const p = resolve(r.codigo_barras)
      const sku          = p?.sku          ?? String(r.sku_ret ?? '')
      const descripcion  = p?.descripcion  ?? String(r.desc_ret ?? '')
      const subcategoria = p?.subcategoria ?? (r.subcat_ret ?? null)
      const codigoBarras = p?.codigo_barras ?? String(r.codigo_barras ?? '')

      const key = `${sku}|${r.cadena}|${r.punto_venta}`
      let a = consolidated.get(key)
      if (!a) {
        a = { sku, codigo_barras: codigoBarras, descripcion, subcategoria,
              cadena: r.cadena, punto_venta: r.punto_venta, inv_mano: 0, venta_dia: 0 }
        consolidated.set(key, a)
      }
      a.inv_mano  += Number(r.inv_und) || 0
      a.venta_dia = Math.max(a.venta_dia, Number(r.venta_dia) || 0)
    }

    // 4) Calcular DOH + salud, aplicar filtro prod (post-resolución) + salud
    const enriched = Array.from(consolidated.values()).map(r => {
      const doh = r.venta_dia > 0 ? Number((r.inv_mano / r.venta_dia).toFixed(1)) : null
      let salud = 'SIN VPD'
      if (doh !== null) {
        if      (doh <= 7)   salud = 'CRÍTICO'
        else if (doh <= 14)  salud = 'ATENCIÓN'
        else if (doh <= 60)  salud = 'SALUDABLE'
        else if (doh <= 120) salud = 'COBERTURA ALTA'
        else                 salud = 'SOBRESTOCK'
      }
      return { ...r, doh, salud }
    })

    const filtered = enriched.filter(r => {
      if (saludArr.length && !saludArr.includes(r.salud)) return false
      if (prod) {
        const hit = (r.descripcion?.toLowerCase().includes(prod) || r.sku?.toLowerCase().includes(prod))
        if (!hit) return false
      }
      return true
    }).sort((a, b) => b.inv_mano - a.inv_mano).slice(0, 3000)

    return NextResponse.json({
      rows: filtered.map(r => ({
        sku:            r.sku,
        codigo_barras:  r.codigo_barras,
        descripcion:    r.descripcion,
        subcategoria:   r.subcategoria,
        cadena:         r.cadena,
        punto_venta:    r.punto_venta,
        nombre_tienda:  r.punto_venta,
        inv_mano:       r.inv_mano,
        venta_dia:      r.venta_dia,
        doh:            r.doh,
        salud:          r.salud,
      })),
      total: filtered.length,
    })
  } catch (err) {
    return handleApiError(err)
  }
}
