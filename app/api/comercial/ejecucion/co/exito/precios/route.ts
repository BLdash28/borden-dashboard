import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'
import { handleApiError } from '@/lib/api/errors'
import { parseExitoFilters } from '@/lib/api/exito-filtros'

export const revalidate = 300

export async function GET(req: NextRequest) {
  try {
    const f = parseExitoFilters(req)
    // Filtros compatibles con precios_exito: subcategoría (col: subcategoria)
    // y SKU (col: sku). Cadena/geo no aplican porque precios es catálogo global.
    let n = 1
    const parts: string[] = []
    const params: unknown[] = []
    if (f.subcategorias.length) { parts.push(`subcategoria = ANY($${n++})`); params.push(f.subcategorias) }
    if (f.skus.length)          { parts.push(`sku = ANY($${n++})`);          params.push(f.skus) }
    const where = parts.length ? ' AND ' + parts.join(' AND ') : ''

    const r = await pool.query(
      `SELECT ean13, plu, codigo_borden, sku, descripcion, gramos, subcategoria,
              precio_anterior_cop, precio_vigente_cop,
              costo_ant_cop, costo_cop,
              pvp_ant_cop, pvp_sugerido_cop,
              fecha_vigencia_desde, es_oferta, es_innovacion, cargado_en
       FROM precios_exito
       WHERE pais='CO' AND cliente='GRUPO ÉXITO' ${where}
       ORDER BY es_innovacion, es_oferta, plu`,
      params,
    )
    const filas = r.rows.map(x => ({
      ean13:                x.ean13,
      plu:                  x.plu,
      codigo_borden:        x.codigo_borden,
      sku:                  x.sku,
      descripcion:          x.descripcion,
      subcategoria:         x.subcategoria,
      gramos:               x.gramos !== null ? parseFloat(x.gramos) : null,
      // Costos Centurion (importador/proveedor)
      costo_ant_cop:        x.costo_ant_cop     !== null ? parseFloat(x.costo_ant_cop)     : null,
      costo_cop:            x.costo_cop         !== null ? parseFloat(x.costo_cop)         : null,
      // Lista de Precios (venta a Grupo Éxito)
      precio_anterior_cop:  x.precio_anterior_cop !== null ? parseFloat(x.precio_anterior_cop) : null,
      precio_vigente_cop:   x.precio_vigente_cop  !== null ? parseFloat(x.precio_vigente_cop)  : null,
      // PVP Sugerido (precio al público sugerido)
      pvp_ant_cop:          x.pvp_ant_cop       !== null ? parseFloat(x.pvp_ant_cop)       : null,
      pvp_sugerido_cop:     x.pvp_sugerido_cop  !== null ? parseFloat(x.pvp_sugerido_cop)  : null,
      fecha_vigencia_desde: x.fecha_vigencia_desde,
      es_oferta:            !!x.es_oferta,
      es_innovacion:        !!x.es_innovacion,
    }))
    const ultimaCarga = r.rows[0]?.cargado_en ?? null

    return NextResponse.json({ filas, ultima_carga: ultimaCarga, total: filas.length })
  } catch (err) {
    return handleApiError(err)
  }
}
