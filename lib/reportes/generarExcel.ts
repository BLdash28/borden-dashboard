import * as XLSX from 'xlsx'
import { pool } from '@/lib/db/pool'

export type TipoReporte =
  | 'ventas_por_pais'
  | 'top_productos'
  | 'kpis_resumen'
  | 'top_tiendas'
  | 'cobertura_quiebres'

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

    case 'cobertura_quiebres': {
      // Fecha más reciente con datos
      const { rows: [dateRow] } = await pool.query(
        `SELECT MAX(fecha) AS max_fecha FROM inventario_tiendas`
      )
      const maxFecha = dateRow?.max_fecha
      if (!maxFecha) { addSheet(wb, [{ mensaje: 'Sin datos en inventario_tiendas' }], 'Sin datos'); break }

      // Países a incluir
      let paises: string[] = filtros.pais?.length ? filtros.pais : []
      if (!paises.length) {
        const { rows: pr } = await pool.query(
          `SELECT DISTINCT pais FROM inventario_tiendas WHERE fecha = $1 ORDER BY pais`,
          [maxFecha]
        )
        paises = pr.map((r: any) => r.pais)
      }

      // Condición de categoría (solo letras/espacios para evitar injection)
      const catSafe = (filtros.categoria ?? []).filter(c => /^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s]+$/.test(c))
      const catCond = catSafe.length
        ? catSafe.map(c => `LOWER(t.categoria) LIKE '%${c.toLowerCase().replace(/s$/, '')}%'`).join(' OR ')
        : '1=1'

      // Hoja resumen
      const { rows: resumen } = await pool.query(`
        SELECT t.pais               AS "País",
               t.categoria          AS "Categoría",
               COUNT(*)             AS "Quiebres",
               COUNT(DISTINCT t.tienda_nbr) AS "Tiendas afectadas"
        FROM inventario_tiendas t
        WHERE t.fecha = $1
          AND t.inv_mano = 0
          AND (${catCond})
          ${paises.length ? `AND t.pais IN (${paises.map(p => `'${p}'`).join(',')})` : ''}
        GROUP BY t.pais, t.categoria
        ORDER BY t.pais, t.categoria
      `, [maxFecha])
      addSheet(wb, resumen, 'Resumen')

      // Una hoja por país
      for (const pais of paises) {
        const { rows } = await pool.query(`
          SELECT
            t.tienda_nbr     AS "Tienda #",
            t.tienda_nombre  AS "Tienda",
            t.upc            AS "UPC",
            t.descripcion    AS "Descripción",
            t.categoria      AS "Categoría",
            t.inv_mano       AS "Inv. Mano",
            t.inv_transito   AS "En Tránsito",
            t.inv_almacen    AS "En Almacén",
            c.inv_mano_cajas AS "CEDI (cajas)"
          FROM inventario_tiendas t
          LEFT JOIN inventario_cedi c
            ON c.pais = t.pais AND c.upc = t.upc AND c.fecha = t.fecha
          WHERE t.fecha = $1
            AND t.pais = $2
            AND t.inv_mano = 0
            AND (${catCond})
          ORDER BY t.tienda_nombre, t.descripcion
        `, [maxFecha, pais])

        addSheet(wb, rows, pais.substring(0, 31))
      }
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
