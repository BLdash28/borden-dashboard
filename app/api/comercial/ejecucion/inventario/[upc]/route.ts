import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'
import { handleApiError } from '@/lib/api/errors'

export const revalidate = 0

export async function GET(
  req: NextRequest,
  { params }: { params: { upc: string } }
) {
  try {
    const upc    = params.upc
    const paises = req.nextUrl.searchParams.get('pais')?.split(',').filter(Boolean) ?? []

    const inC = (col: string, vals: string[]) =>
      `${col} IN (${vals.map(v => `'${v.replace(/'/g,"''")}'`).join(',')})`

    const paisFilter = paises.length ? 'AND ' + inC('t.pais', paises) : ''

    const res = await pool.query(`
      WITH
      -- Última fecha de inventario disponible
      ultima AS (
        SELECT MAX(fecha) AS fecha FROM inventario_tiendas
      ),
      -- Metadatos del producto desde dim_producto
      prod AS (
        SELECT sku, descripcion, categoria, subcategoria, codigo_barras
        FROM dim_producto
        WHERE codigo_barras IS NOT NULL
          AND LPAD(LEFT(codigo_barras, LENGTH(codigo_barras) - 1), 13, '0') = $1
        LIMIT 1
      ),
      -- Venta diaria por tienda (últimos 90 días desde hoy)
      vta AS (
        SELECT
          fs.punto_venta,
          ROUND((SUM(fs.ventas_unidades) / 90.0)::numeric, 4) AS vta_dia
        FROM fact_sales_sellout fs
        JOIN prod p ON fs.sku = p.sku
        WHERE MAKE_DATE(fs.ano::int, fs.mes::int, fs.dia::int)
              >= CURRENT_DATE - INTERVAL '90 days'
        GROUP BY fs.punto_venta
      )
      SELECT
        t.tienda_nbr,
        t.tienda_nombre,
        t.pais,
        t.inv_mano,
        COALESCE(v.vta_dia, 0)                                              AS vta_dia,
        COALESCE(p.descripcion, NULLIF(t.descripcion, ''))                  AS descripcion,
        p.categoria,
        p.subcategoria,
        p.sku,
        p.codigo_barras
      FROM inventario_tiendas t
      JOIN ultima u   ON t.fecha = u.fecha
      LEFT JOIN prod p ON TRUE
      LEFT JOIN vta v  ON v.punto_venta = t.tienda_nombre
      WHERE t.upc = $1 ${paisFilter}
      ORDER BY t.inv_mano DESC
    `, [upc])

    if (res.rows.length === 0) {
      return NextResponse.json({
        upc, codigo_barras: null, descripcion: null, categoria: null, subcategoria: null, sku: null, tiendas: []
      })
    }

    const meta = res.rows[0]

    const semaforo = (doh: number | null) =>
      doh === null ? 'sin_datos'
        : doh <= 7  ? 'rojo'
        : doh <= 21 ? 'amarillo'
        : doh <= 60 ? 'verde'
        : 'azul'

    const tiendas = res.rows.map(r => {
      const inv     = parseFloat(r.inv_mano)  || 0
      const vtaDia  = parseFloat(r.vta_dia)   || 0
      const doh     = vtaDia > 0 ? inv / vtaDia : null
      return {
        tienda_nbr:    r.tienda_nbr,
        tienda_nombre: r.tienda_nombre,
        pais:          r.pais,
        inv_mano:      inv,
        venta_dia:     vtaDia,
        doh,
        semaforo:      semaforo(doh),
      }
    })

    return NextResponse.json({
      upc,
      codigo_barras: meta.codigo_barras ?? null,
      descripcion:   meta.descripcion,
      categoria:     meta.categoria,
      subcategoria:  meta.subcategoria,
      sku:           meta.sku,
      tiendas,
    })
  } catch (err) {
    return handleApiError(err)
  }
}
