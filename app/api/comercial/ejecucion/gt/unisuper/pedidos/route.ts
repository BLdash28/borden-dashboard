import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'
import { handleApiError } from '@/lib/api/errors'

export const revalidate = 300

/**
 * Pedidos sell-in Unisuper GT — agrupados por número de factura.
 * Devuelve cada pedido con su cabecera (fecha, moneda, totales) + líneas (SKUs).
 * Fuente: fact_sales_sellin (cliente_nombre='UNISUPER', pais='GT').
 * Filtros opcionales (CSV): skus, subcategorias, desde, hasta.
 */
function csv(sp: URLSearchParams, key: string): string[] {
  const v = sp.get(key)
  return v ? v.split(',').map(s => s.trim()).filter(Boolean) : []
}

function buildWhere(sp: URLSearchParams) {
  const params: unknown[] = []
  const conds: string[] = [`pais = 'GT'`, `cliente_nombre = 'UNISUPER'`]

  const skus = csv(sp, 'skus')
  if (skus.length) {
    const start = params.length
    skus.forEach(v => params.push(v))
    conds.push(`sku IN (${skus.map((_, i) => `$${start + 1 + i}`).join(',')})`)
  }
  const subcats = csv(sp, 'subcategorias')
  if (subcats.length) {
    const start = params.length
    subcats.forEach(v => params.push(v))
    conds.push(`subcategoria IN (${subcats.map((_, i) => `$${start + 1 + i}`).join(',')})`)
  }
  const desde = sp.get('desde')
  if (desde) { params.push(desde); conds.push(`fecha_factura >= $${params.length}::date`) }
  const hasta = sp.get('hasta')
  if (hasta) { params.push(hasta); conds.push(`fecha_factura <= $${params.length}::date`) }

  return { where: conds.join(' AND '), params }
}

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams
    const w  = buildWhere(sp)

    const { rows } = await pool.query(`
      SELECT
        numero_factura,
        linea_factura,
        fecha_factura::date              AS fecha,
        moneda,
        sku,
        descripcion,
        categoria,
        subcategoria,
        marca,
        cantidad_cajas,
        cantidad_unidades,
        cantidad_kg,
        precio_unitario,
        venta_bruta,
        venta_neta,
        descuento_valor,
        margen_valor,
        margen_pct
      FROM fact_sales_sellin
      WHERE ${w.where}
      ORDER BY fecha_factura DESC, numero_factura DESC, linea_factura ASC
    `, w.params)

    // Agrupar por numero_factura
    type Linea = {
      linea: number; sku: string; descripcion: string; categoria: string | null; subcategoria: string | null;
      cajas: number; unidades: number; kg: number; precio: number;
      venta_neta: number; venta_bruta: number; descuento: number; margen: number; margen_pct: number | null
    }
    type Pedido = {
      numero_factura: string; fecha: string; moneda: string;
      total_cajas: number; total_unidades: number; total_kg: number;
      total_venta_neta: number; total_venta_bruta: number; total_descuento: number; total_margen: number;
      num_lineas: number;
      lineas: Linea[]
    }

    const byPedido = new Map<string, Pedido>()
    for (const r of rows) {
      const key = r.numero_factura
      const fechaIso = r.fecha instanceof Date ? r.fecha.toISOString().slice(0, 10) : String(r.fecha).slice(0, 10)
      let p = byPedido.get(key)
      if (!p) {
        p = {
          numero_factura: r.numero_factura,
          fecha: fechaIso,
          moneda: r.moneda ?? 'USD',
          total_cajas: 0, total_unidades: 0, total_kg: 0,
          total_venta_neta: 0, total_venta_bruta: 0, total_descuento: 0, total_margen: 0,
          num_lineas: 0,
          lineas: [],
        }
        byPedido.set(key, p)
      }
      const cajas    = parseFloat(r.cantidad_cajas    ?? '0')
      const unidades = parseFloat(r.cantidad_unidades ?? '0')
      const kg       = parseFloat(r.cantidad_kg       ?? '0')
      const vNeta    = parseFloat(r.venta_neta        ?? '0')
      const vBruta   = parseFloat(r.venta_bruta       ?? '0')
      const desc     = parseFloat(r.descuento_valor   ?? '0')
      const margen   = parseFloat(r.margen_valor      ?? '0')
      p.total_cajas       += cajas
      p.total_unidades    += unidades
      p.total_kg          += kg
      p.total_venta_neta  += vNeta
      p.total_venta_bruta += vBruta
      p.total_descuento   += desc
      p.total_margen      += margen
      p.num_lineas        += 1
      p.lineas.push({
        linea:        r.linea_factura,
        sku:          r.sku,
        descripcion:  r.descripcion,
        categoria:    r.categoria,
        subcategoria: r.subcategoria,
        cajas, unidades, kg,
        precio:       parseFloat(r.precio_unitario ?? '0'),
        venta_neta:   vNeta,
        venta_bruta:  vBruta,
        descuento:    desc,
        margen,
        margen_pct:   r.margen_pct !== null ? parseFloat(r.margen_pct) : null,
      })
    }

    const pedidos = Array.from(byPedido.values()).sort((a, b) => {
      if (a.fecha === b.fecha) return b.numero_factura.localeCompare(a.numero_factura)
      return b.fecha.localeCompare(a.fecha)
    })

    return NextResponse.json({
      pais: 'GT',
      cliente: 'UNISUPER',
      total_pedidos: pedidos.length,
      pedidos,
    })
  } catch (err) {
    return handleApiError(err)
  }
}
