// Retorna las opciones para los filtros jerárquicos del ranking geográfico
// GET ?nivel=pais
// GET ?nivel=cadena&pais=CR
// GET ?nivel=tienda&pais=CR&cadena=WALMART
import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'
import { withCache, cacheHeaders } from '@/lib/db/cache'

export async function GET(req: NextRequest) {
  const sp     = req.nextUrl.searchParams
  const nivel  = sp.get('nivel') || 'pais'
  const pais   = sp.get('pais')
  const cadena = sp.get('cadena')
  const anoP   = sp.get('ano')
  const mesP   = sp.get('mes')

  try {
    const cacheKey = `geo-opciones:${nivel}:${pais}:${cadena}:${anoP}:${mesP}`
    const TTL = 5 * 60 * 1000 // 5 min

    const { data, cached } = await withCache(cacheKey, async () => {
      const conds: string[] = ['ano > 2000']
      const params: any[]   = []
      let idx = 1

      if (anoP) { conds.push(`ano = $${idx++}`); params.push(parseInt(anoP)) }
      if (mesP) { conds.push(`mes = $${idx++}`); params.push(parseInt(mesP)) }

      let col: string
      if (nivel === 'pais') {
        col = 'pais'
      } else if (nivel === 'cadena') {
        col = 'cadena'
        if (pais) { conds.push(`pais = $${idx++}`); params.push(pais) }
      } else {
        col = 'punto_venta'
        if (pais)   { conds.push(`pais = $${idx++}`);   params.push(pais) }
        if (cadena) { conds.push(`cadena = $${idx++}`); params.push(cadena) }
      }

      const where = 'WHERE ' + conds.join(' AND ')

      const r = await pool.query(
        `SELECT DISTINCT ${col} AS valor
         FROM mv_sellout_mensual ${where}
         ORDER BY ${col}`,
        params
      )

      return { opciones: r.rows.map((row: any) => row.valor).filter(Boolean) }
    }, TTL)

    return NextResponse.json(data, {
      headers: { ...cacheHeaders(300), 'X-Cache': cached ? 'HIT' : 'MISS' },
    })
  } catch (err: any) {
    console.error('[geo/opciones]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
