import * as XLSX from 'xlsx'
import ExcelJS from 'exceljs'
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
      return await _generarCobertura(filtros)
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

async function _generarCobertura(filtros: Filtros): Promise<Buffer> {
  const exWb = new ExcelJS.Workbook()
  exWb.creator = 'BL Dashboard'

  const { rows: [dateRow] } = await pool.query(`SELECT MAX(fecha) AS max_fecha FROM inventario_tiendas`)
  const maxFecha = dateRow?.max_fecha
  if (!maxFecha) {
    const ws = exWb.addWorksheet('Sin datos')
    ws.addRow(['Sin datos en inventario_tiendas'])
    return Buffer.from(await exWb.xlsx.writeBuffer() as ArrayBuffer)
  }

  // Format date for display
  const d = maxFecha instanceof Date ? maxFecha : new Date(String(maxFecha))
  const day   = String(d.getUTCDate()).padStart(2, '0')
  const month = String(d.getUTCMonth() + 1).padStart(2, '0')
  const year  = d.getUTCFullYear()
  const dateStr = `${day}/${month}/${year}`

  // Countries
  let paises: string[] = filtros.pais?.length ? filtros.pais : []
  if (!paises.length) {
    const { rows: pr } = await pool.query(
      `SELECT DISTINCT pais FROM inventario_tiendas WHERE fecha = $1 ORDER BY pais`, [maxFecha]
    )
    paises = pr.map((r: any) => r.pais)
  }

  // Categories — sanitized whitelist
  const catSafe = (filtros.categoria ?? []).filter(c => /^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s]+$/.test(c))
  const cats = catSafe.length ? catSafe : ['Queso', 'Leche', 'Helado']

  const HEADER_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E79' } }
  const HEADER_FONT: Partial<ExcelJS.Font> = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 }
  const TITLE_FONT:  Partial<ExcelJS.Font> = { bold: true, size: 11 }
  const SUB_FONT:    Partial<ExcelJS.Font> = { italic: true, size: 9, color: { argb: 'FF595959' } }
  const COL_HEADERS = ['Tienda #', 'Tienda', 'UPC', 'Descripción', 'Inventario UND', 'Tránsito', 'CEDI', 'Precio de Venta', 'DOH (8 días)']
  const COL_WIDTHS  = [10, 28, 14, 40, 14, 10, 10, 14, 12]

  // ── Resumen sheet ──────────────────────────────────────────────────────────
  const wsRes = exWb.addWorksheet('Resumen')
  wsRes.mergeCells('A1:D1')
  wsRes.getCell('A1').value = `Resumen de Quiebres — ${dateStr}`
  wsRes.getCell('A1').font = TITLE_FONT
  wsRes.mergeCells('A2:D2')
  wsRes.getCell('A2').value = 'Fuente: inventario_tiendas · BL Dashboard'
  wsRes.getCell('A2').font = SUB_FONT
  const resHeaders = ['País', 'Categoría', 'Quiebres', 'Tiendas Afectadas']
  resHeaders.forEach((h, i) => {
    const c = wsRes.getCell(3, i + 1)
    c.value = h; c.font = HEADER_FONT; c.fill = HEADER_FILL
    c.alignment = { horizontal: 'center' }
  })
  wsRes.getColumn(1).width = 8; wsRes.getColumn(2).width = 15
  wsRes.getColumn(3).width = 12; wsRes.getColumn(4).width = 18

  let resRow = 4
  for (const pais of paises) {
    for (const cat of cats) {
      const pat = `%${cat.toLowerCase().replace(/s$/, '')}%`
      const { rows: [agg] } = await pool.query(`
        SELECT COUNT(*) AS quiebres, COUNT(DISTINCT tienda_nbr) AS tiendas
        FROM inventario_tiendas
        WHERE fecha = $1 AND pais = $2 AND inv_mano <= 0 AND LOWER(descripcion) LIKE $3
      `, [maxFecha, pais, pat])
      if (Number(agg?.quiebres) > 0) {
        wsRes.getCell(resRow, 1).value = pais
        wsRes.getCell(resRow, 2).value = cat
        wsRes.getCell(resRow, 3).value = Number(agg.quiebres)
        wsRes.getCell(resRow, 4).value = Number(agg.tiendas)
        resRow++
      }
    }
  }

  // ── One sheet per country+category ────────────────────────────────────────
  for (const pais of paises) {
    for (const cat of cats) {
      const pat = `%${cat.toLowerCase().replace(/s$/, '')}%`
      const { rows } = await pool.query(`
        SELECT t.tienda_nbr, t.tienda_nombre, t.upc, t.descripcion,
               t.inv_mano, t.inv_transito, c.inv_mano_cajas
        FROM inventario_tiendas t
        LEFT JOIN inventario_cedi c ON c.pais = t.pais AND c.upc = t.upc AND c.fecha = t.fecha
        WHERE t.fecha = $1 AND t.pais = $2 AND t.inv_mano <= 0 AND LOWER(t.descripcion) LIKE $3
        ORDER BY t.tienda_nombre, t.descripcion
      `, [maxFecha, pais, pat])

      if (!rows.length) continue

      const ws = exWb.addWorksheet(`${pais} - ${cat}`.substring(0, 31))

      ws.mergeCells('A1:I1')
      ws.getCell('A1').value = `Quiebres de Stock - ${cat} (${rows.length} casos) — ${pais}`
      ws.getCell('A1').font = TITLE_FONT

      ws.mergeCells('A2:I2')
      ws.getCell('A2').value = `Fecha del reporte: ${dateStr} · Datos: inventario_tiendas Supabase`
      ws.getCell('A2').font = SUB_FONT

      COL_HEADERS.forEach((h, i) => {
        const c = ws.getCell(3, i + 1)
        c.value = h; c.font = HEADER_FONT; c.fill = HEADER_FILL
        c.alignment = { horizontal: 'center' }
      })
      COL_WIDTHS.forEach((w, i) => { ws.getColumn(i + 1).width = w })

      rows.forEach((r: any) => {
        ws.addRow([
          r.tienda_nbr, r.tienda_nombre, r.upc, r.descripcion,
          r.inv_mano, r.inv_transito, r.inv_mano_cajas ?? null,
          null, null,
        ])
      })
    }
  }

  return Buffer.from(await exWb.xlsx.writeBuffer() as ArrayBuffer)
}
