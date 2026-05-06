import * as XLSX from 'xlsx'
import { pool } from '@/lib/db/pool'

export type TipoReporte =
  | 'ventas_por_pais'
  | 'top_productos'
  | 'kpis_resumen'
  | 'top_tiendas'

interface Filtros {
  pais?:      string[]
  categoria?: string[]
  periodo?:   string   // 'ultimo_mes' | 'ultima_semana' | 'ultimo_trimestre'
}

export async function generarExcel(
  tipoReporte: TipoReporte,
  filtros: Filtros = {}
): Promise<Buffer> {
  const wb = XLSX.utils.book_new()

  const dateFilter = buildDateFilter(filtros.periodo)
  const paisFilter = filtros.pais?.length
    ? `AND pais IN (${filtros.pais.map(p => `'${p}'`).join(',')})`
    : ''
  const catFilter = filtros.categoria?.length
    ? `AND categoria IN (${filtros.categoria.map(c => `'${c}'`).join(',')})`
    : ''

  switch (tipoReporte) {
    case 'ventas_por_pais': {
      const { rows } = await pool.query(`
        SELECT pais, categoria,
               SUM(venta_neta) AS venta_neta,
               SUM(cantidad_unidades) AS unidades
        FROM fact_sales_sellin
        WHERE 1=1 ${dateFilter} ${paisFilter} ${catFilter}
        GROUP BY pais, categoria
        ORDER BY venta_neta DESC
      `)
      addSheet(wb, rows, 'Ventas por País')
      break
    }
    case 'top_productos': {
      const { rows } = await pool.query(`
        SELECT descripcion_sku AS producto, pais, categoria,
               SUM(venta_neta) AS venta_neta,
               SUM(cantidad_unidades) AS unidades
        FROM fact_sales_sellin
        WHERE 1=1 ${dateFilter} ${paisFilter} ${catFilter}
        GROUP BY descripcion_sku, pais, categoria
        ORDER BY venta_neta DESC
        LIMIT 100
      `)
      addSheet(wb, rows, 'Top Productos')
      break
    }
    case 'kpis_resumen': {
      const { rows } = await pool.query(`
        SELECT
          SUM(venta_neta)        AS venta_neta_total,
          SUM(cantidad_unidades) AS unidades_total,
          COUNT(DISTINCT pais)   AS paises,
          COUNT(DISTINCT sku)    AS skus_activos
        FROM fact_sales_sellin
        WHERE 1=1 ${dateFilter} ${paisFilter}
      `)
      addSheet(wb, rows, 'KPIs Resumen')
      break
    }
    case 'top_tiendas': {
      const { rows } = await pool.query(`
        SELECT cliente_nombre AS tienda, pais,
               SUM(venta_neta) AS venta_neta,
               SUM(cantidad_unidades) AS unidades
        FROM fact_sales_sellin
        WHERE 1=1 ${dateFilter} ${paisFilter} ${catFilter}
        GROUP BY cliente_nombre, pais
        ORDER BY venta_neta DESC
        LIMIT 100
      `)
      addSheet(wb, rows, 'Top Tiendas')
      break
    }
  }

  return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }))
}

function addSheet(wb: XLSX.WorkBook, rows: any[], sheetName: string) {
  const ws = XLSX.utils.json_to_sheet(rows)
  XLSX.utils.book_append_sheet(wb, ws, sheetName)
}

function buildDateFilter(periodo?: string): string {
  switch (periodo) {
    case 'ultima_semana':   return `AND fecha >= NOW() - INTERVAL '7 days'`
    case 'ultimo_mes':      return `AND fecha >= NOW() - INTERVAL '1 month'`
    case 'ultimo_trimestre':return `AND fecha >= NOW() - INTERVAL '3 months'`
    default:                return `AND ano = EXTRACT(YEAR FROM NOW())::int`
  }
}
