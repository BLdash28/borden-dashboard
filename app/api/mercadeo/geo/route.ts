// app/api/mercadeo/geo/route.ts
// Drill-down geográfico: País → Cadena → Punto de Venta
// Solo ventas_unidades — sin ventas_valor (política Mercadeo)
import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'
import { getUserRestrictions } from '@/lib/auth/restrictions'
import { withCache, cacheHeaders } from '@/lib/db/cache'

type Nivel = 'pais' | 'cadena' | 'tienda'

export async function GET(req: NextRequest) {
  const sp       = req.nextUrl.searchParams
  const nivel    = (sp.get('nivel')    || 'pais') as Nivel
  const pais     = sp.get('pais')
  const cadena   = sp.get('cadena')
  const categoria = sp.get('categoria')
  const anoP     = sp.get('ano')
  const mesP     = sp.get('mes')

  const restrictions = await getUserRestrictions().catch(() => null)

  try {
    const cacheKey = `geo:${nivel}:${pais}:${cadena}:${categoria}:${anoP}:${mesP}:${restrictions?.isRestricted}`
    const TTL = 5 * 60 * 1000 // 5 min

    const { data, cached } = await withCache(cacheKey, async () => {
      const conds: string[] = ['ano > 2000']
      const params: any[]   = []
      let idx = 1

      if (anoP) { conds.push(`ano = $${idx++}`); params.push(parseInt(anoP)) }
      if (mesP) { conds.push(`mes = $${idx++}`); params.push(parseInt(mesP)) }

      if (restrictions?.isRestricted && restrictions.paises.length > 0) {
        const allowed = restrictions.paises
        if (pais && pais !== 'Todos' && allowed.includes(pais)) {
          conds.push(`pais = $${idx++}`); params.push(pais)
        } else if (nivel === 'pais') {
          conds.push(`pais IN (${allowed.map(() => `$${idx++}`).join(', ')})`); params.push(...allowed)
        }
      } else {
        if (pais && nivel !== 'pais') { conds.push(`pais = $${idx++}`); params.push(pais) }
      }

      if (cadena && nivel === 'tienda') {
        conds.push(`cadena = $${idx++}`); params.push(cadena)
      }

      if (categoria && categoria !== 'Todas') {
        conds.push(`categoria ILIKE $${idx++}`); params.push('%' + categoria + '%')
      }

      const where = 'WHERE ' + conds.join(' AND ')

      const groupCol: Record<Nivel, string> = {
        pais:   'pais',
        cadena: 'cadena',
        tienda: 'punto_venta',
      }
      const subCol: Record<Nivel, string> = {
        pais:   'COUNT(DISTINCT cadena)',
        cadena: 'COUNT(DISTINCT punto_venta)',
        tienda: 'COUNT(DISTINCT sku)',
      }
      const subLabel: Record<Nivel, string> = {
        pais:   'cadenas',
        cadena: 'tiendas',
        tienda: 'skus',
      }

      const col = groupCol[nivel]

      const [r, rPeriodos] = await Promise.all([
        pool.query(
          `SELECT
              ${col}                                      AS nombre,
              ROUND(SUM(ventas_unidades)::numeric, 0)    AS ventas_unidades,
              COUNT(DISTINCT descripcion)                AS n_productos,
              ${subCol[nivel]}                           AS n_sub
           FROM mv_sellout_mensual
           ${where}
           GROUP BY ${col}
           ORDER BY ventas_unidades DESC`,
          params
        ),
        pool.query(
          `SELECT DISTINCT ano, mes FROM mv_sellout_mensual
           WHERE ano > 2000 ORDER BY ano DESC, mes DESC LIMIT 36`
        ),
      ])

      return {
        nivel,
        rows:     r.rows,
        subLabel: subLabel[nivel],
        periodos: rPeriodos.rows,
      }
    }, TTL)

    return NextResponse.json(data, {
      headers: { ...cacheHeaders(300), 'X-Cache': cached ? 'HIT' : 'MISS' },
    })
  } catch (err: any) {
    console.error('mercadeo/geo error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
