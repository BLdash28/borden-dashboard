import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'
import { handleApiError, AppError } from '@/lib/api/errors'
import { requireAuth } from '@/lib/api/auth'

export const dynamic = 'force-dynamic'

/**
 * GET /api/ofertas-impacto/[id]/analisis
 *
 * Ejecuta el RPC `analizar_oferta_impacto(id)` y devuelve el análisis por-SKU
 * junto con la oferta cabecera y un totalizador simple (suma de las métricas
 * individuales, NO recalculado desde un pool mezclado).
 */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireAuth()
    const id = params.id

    const [ofertaR, analisisR] = await Promise.all([
      pool.query(
        `SELECT id, nombre, mecanica, precio_display, precio_regular, precio_oferta,
                pais, cadenas, vigencia_inicio, vigencia_fin, semanas_ventana,
                created_at
         FROM ofertas WHERE id = $1`,
        [id],
      ),
      pool.query('SELECT * FROM analizar_oferta_impacto($1)', [id]),
    ])

    if (ofertaR.rowCount === 0) throw new AppError(404, 'not found', 'Oferta no encontrada')

    const rows = analisisR.rows as Array<{
      upc: string
      descripcion: string | null
      baseline_semanal: string | null
      durante_semanal:  string | null
      despues_semanal:  string | null
      uplift_pct:       string | null
      pull_forward_flag: boolean | null
      venta_incremental_neta: string | null
      semanas_con_venta: number
      semanas_baseline_totales: number
      baseline_confiable: boolean
      serie_semanal: any
    }>

    // Total: suma directa de los valores por-SKU (no recalcula sobre pool).
    // Los promedios semanales SÍ se suman (baseline_total = Σ baseline_por_sku),
    // porque la métrica "cuántas unidades semanales representa esta oferta"
    // es aditiva entre SKUs.
    const sumNum = (getter: (r: (typeof rows)[number]) => string | null) =>
      rows.reduce((s, r) => s + (Number(getter(r) ?? 0) || 0), 0)

    const total = {
      baseline_semanal: rows.length ? Math.round(sumNum(r => r.baseline_semanal) * 100) / 100 : null,
      durante_semanal:  rows.length ? Math.round(sumNum(r => r.durante_semanal)  * 100) / 100 : null,
      // El "después" es NULL si CUALQUIER SKU está NULL (oferta en curso)
      despues_semanal: rows.every(r => r.despues_semanal !== null)
        ? Math.round(sumNum(r => r.despues_semanal) * 100) / 100
        : null,
      venta_incremental_neta_total: rows.length
        ? Math.round(sumNum(r => r.venta_incremental_neta) * 100) / 100
        : null,
      pull_forward_skus: rows.filter(r => r.pull_forward_flag === true).length,
      baseline_no_confiable_skus: rows.filter(r => !r.baseline_confiable).length,
      total_skus: rows.length,
    }

    return NextResponse.json({
      oferta:    ofertaR.rows[0],
      por_sku:   rows,
      total,
    })
  } catch (err) {
    return handleApiError(err)
  }
}
