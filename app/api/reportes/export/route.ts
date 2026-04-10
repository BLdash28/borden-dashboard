import { NextRequest, NextResponse } from 'next/server'
import { Pool } from 'pg'
import * as XLSX from 'xlsx'

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 5,
})

async function getMejorPeriodo(client: any, anoFiltro?: number) {
  if (anoFiltro) {
    const r = await client.query(
      'SELECT ano, mes FROM v_ventas WHERE ano = $1 ' +
      'GROUP BY ano, mes HAVING COUNT(*) > 100 ORDER BY mes DESC LIMIT 1',
      [anoFiltro]
    )
    return r.rows[0] ? { ano: Number(r.rows[0].ano), mes: Number(r.rows[0].mes) } : null
  }
  const r = await client.query(
    'SELECT ano, mes FROM v_ventas WHERE ano > 2000 ' +
    'GROUP BY ano, mes HAVING COUNT(*) > 1000 ORDER BY ano DESC, mes DESC LIMIT 1'
  )
  return r.rows[0] ? { ano: Number(r.rows[0].ano), mes: Number(r.rows[0].mes) } : null
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const tipo      = searchParams.get('tipo') || 'sellout'
  const anoP      = searchParams.get('ano')
  const mesP      = searchParams.get('mes')
  const pais      = searchParams.get('pais')
  const categoria = searchParams.get('categoria')
  const cliente   = searchParams.get('cliente')
  const sku       = searchParams.get('sku')

  // Solo sellout y resumen tienen datos reales en DB
  if (!['sellout', 'resumen'].includes(tipo)) {
    return NextResponse.json({ error: 'Este reporte aún no tiene datos disponibles' }, { status: 404 })
  }

  try {
    const client = await pool.connect()

    let anoQ = anoP ? parseInt(anoP) : null
    let mesQ = mesP ? parseInt(mesP) : null

    if (tipo === 'sellout' && !mesQ) {
      const mejor = await getMejorPeriodo(client, anoQ ?? undefined)
      if (mejor) { anoQ = mejor.ano; mesQ = mejor.mes }
    }

    const conds: string[] = []
    const params: any[]   = []
    let idx = 1

    if (anoQ)                               { conds.push('ano = $'           + idx++); params.push(anoQ) }
    if (mesQ)                               { conds.push('mes = $'           + idx++); params.push(mesQ) }
    if (pais      && pais !== 'Todos')      { conds.push('pais = $'          + idx++); params.push(pais) }
    if (categoria && categoria !== 'Todas') { conds.push('categoria ILIKE $' + idx++); params.push(categoria) }
    if (cliente   && cliente !== 'Todos')   { conds.push('cliente ILIKE $'   + idx++); params.push('%' + cliente + '%') }
    if (sku)                                { conds.push('(sku ILIKE $' + idx + ' OR descripcion ILIKE $' + idx + ')'); idx++; params.push('%' + sku + '%') }

    const where = conds.length ? 'WHERE ' + conds.join(' AND ') : ''

    let rows: any[]
    let sheetName: string
    let filename: string

    if (tipo === 'sellout') {
      const r = await client.query(
        'SELECT pais AS "País", cliente AS "Cliente", cadena AS "Cadena", ' +
        'formato AS "Formato", categoria AS "Categoría", subcategoria AS "Subcategoría", ' +
        'punto_venta AS "Punto Venta", codigo_barras AS "Cód. Barras", sku AS "SKU", ' +
        'descripcion AS "Descripción", ano AS "Año", mes AS "Mes", dia AS "Día", ' +
        'ROUND(ventas_unidades::numeric,0) AS "Unidades", ' +
        'ROUND(ventas_valor::numeric,2) AS "Valor USD" ' +
        'FROM v_ventas ' + where + ' ' +
        'ORDER BY pais, dia, ventas_valor DESC ' +
        'LIMIT 100000',
        params
      )
      rows = r.rows
      sheetName = 'Sellout'
      filename = `sellout_${anoQ || 'todos'}_${mesQ ? String(mesQ).padStart(2,'0') : 'todos'}.xlsx`
    } else {
      // resumen: agrupado por pais, ano, mes
      const r = await client.query(
        'SELECT pais AS "País", ano AS "Año", mes AS "Mes", ' +
        'categoria AS "Categoría", cliente AS "Cliente", ' +
        'SUM(ROUND(ventas_unidades::numeric,0)) AS "Unidades", ' +
        'ROUND(SUM(ventas_valor)::numeric,2) AS "Valor USD", ' +
        'COUNT(DISTINCT sku) AS "SKUs Distintos" ' +
        'FROM v_ventas ' + where + ' ' +
        'GROUP BY pais, ano, mes, categoria, cliente ' +
        'ORDER BY pais, ano, mes, "Valor USD" DESC',
        params
      )
      rows = r.rows
      sheetName = 'Resumen'
      filename = `resumen_ventas_${anoQ || 'todos'}.xlsx`
    }

    client.release()

    if (rows.length === 0) {
      return NextResponse.json({ error: 'Sin datos para los filtros seleccionados' }, { status: 404 })
    }

    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.json_to_sheet(rows)

    // Ancho de columnas automático
    const colWidths = Object.keys(rows[0]).map(key => ({
      wch: Math.max(key.length, ...rows.slice(0, 100).map(r => String(r[key] ?? '').length))
    }))
    ws['!cols'] = colWidths

    XLSX.utils.book_append_sheet(wb, ws, sheetName)
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(buffer.length),
      },
    })
  } catch (err: any) {
    console.error('export route error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
