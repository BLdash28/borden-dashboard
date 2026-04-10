// app/api/mercadeo/recomendaciones/route.ts
// Multi-select: paises, categorias, anos, meses (comma-separated)
// Toma los 3 meses cerrados más recientes del rango filtrado
// Excluye mes en curso automáticamente
// Compara vs los 3 meses inmediatamente anteriores (período de referencia)
import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'
import { getUserRestrictions } from '@/lib/auth/restrictions'

export const dynamic = 'force-dynamic'

const MESES_LABEL = ['','Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

function parseMV(s: string | null): string[] {
  return (s || '').split(',').map(v => v.trim()).filter(Boolean)
}

function prevMonths(ano: number, mes: number, n: number): { ano: number; mes: number }[] {
  const out: { ano: number; mes: number }[] = []
  for (let i = n; i >= 1; i--) {
    let m = mes - i, a = ano
    while (m <= 0) { m += 12; a-- }
    out.push({ ano: a, mes: m })
  }
  return out
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)

  const paisList = parseMV(searchParams.get('paises'))
  const catList  = parseMV(searchParams.get('categorias'))
  const anoList  = parseMV(searchParams.get('anos')).map(Number).filter(n => n > 2000)
  const mesList  = parseMV(searchParams.get('meses')).map(Number).filter(n => n >= 1 && n <= 12)

  // Mes en curso → excluir siempre
  const now = new Date()
  const curAno = now.getFullYear()
  const curMes = now.getMonth() + 1

  const restrictions = await getUserRestrictions().catch(() => null)

  try {
    // ── Filtros base ────────────────────────────────────────
    const baseConds: string[] = ['ano > 2000', `NOT (ano = ${curAno} AND mes = ${curMes})`]
    const baseParams: any[]   = []
    let idx = 1

    // Restricciones de usuario
    const allowedPaises = restrictions?.isRestricted ? restrictions.paises : null
    const efectivoPaises = allowedPaises
      ? (paisList.length > 0 ? paisList.filter(p => allowedPaises.includes(p)) : allowedPaises)
      : paisList

    if (efectivoPaises.length > 0) {
      baseConds.push(`pais IN (${efectivoPaises.map(() => `$${idx++}`).join(',')})`)
      baseParams.push(...efectivoPaises)
    }
    if (catList.length > 0) {
      baseConds.push(`(${catList.map(() => `categoria ILIKE $${idx++}`).join(' OR ')})`)
      baseParams.push(...catList)
    }
    if (anoList.length > 0) {
      baseConds.push(`ano IN (${anoList.map(() => `$${idx++}`).join(',')})`)
      baseParams.push(...anoList)
    }
    if (mesList.length > 0) {
      baseConds.push(`mes IN (${mesList.map(() => `$${idx++}`).join(',')})`)
      baseParams.push(...mesList)
    }

    // ── Períodos disponibles en el rango filtrado ───────────
    const perQ = await pool.query(
      `SELECT ano, mes FROM v_ventas
       WHERE ${baseConds.join(' AND ')}
       GROUP BY ano, mes HAVING COUNT(*) > 50
       ORDER BY ano DESC, mes DESC`,
      baseParams
    )

    if (perQ.rows.length === 0) {
      return NextResponse.json({ skus: [], recientes: [], anteriores: [], periodoRef: null })
    }

    // Tomar los 3 más recientes cerrados
    const recientes = perQ.rows.slice(0, 3).map(r => ({ ano: Number(r.ano), mes: Number(r.mes) }))

    // Calcular los 3 meses anteriores al más antiguo del rango reciente
    const earliest    = recientes[recientes.length - 1]
    const anteriores  = prevMonths(earliest.ano, earliest.mes, 3)

    const allPeriods  = [...anteriores, ...recientes]

    // ── Construir WHERE para query de datos ─────────────────
    // Mismo filtro de pais/cat pero con períodos exactos (no ano/mes del usuario)
    const dConds: string[] = ['ano > 2000']
    const dParams: any[]   = []
    let di = 1

    if (efectivoPaises.length > 0) {
      dConds.push(`pais IN (${efectivoPaises.map(() => `$${di++}`).join(',')})`)
      dParams.push(...efectivoPaises)
    }
    if (catList.length > 0) {
      dConds.push(`(${catList.map(() => `categoria ILIKE $${di++}`).join(' OR ')})`)
      dParams.push(...catList)
    }

    // Período exacto = recientes + anteriores
    dConds.push(`(${allPeriods.map(() => `(ano=$${di++} AND mes=$${di++})`).join(' OR ')})`)
    dParams.push(...allPeriods.flatMap(p => [p.ano, p.mes]))

    // ── Query principal ────────────────────────────────────
    // Agrupa solo por sku (no por descripcion) para evitar duplicados
    // cuando el mismo SKU tiene variantes de texto en distintas filas.
    // MIN(descripcion) toma la primera alfabéticamente como canónica.
    const r = await pool.query(
      `SELECT
         sku,
         MIN(descripcion) AS descripcion,
         ano,
         mes,
         ROUND(SUM(ventas_unidades)::numeric, 0) AS ventas_unidades,
         ARRAY_AGG(DISTINCT pais ORDER BY pais)   AS paises_mes
       FROM v_ventas
       WHERE ${dConds.join(' AND ')}
       GROUP BY sku, ano, mes
       ORDER BY sku, ano, mes`,
      dParams
    )

    // Total unidades en período reciente (para participación)
    let totalReciente = 0
    for (const row of r.rows) {
      if (recientes.some(p => p.ano === Number(row.ano) && p.mes === Number(row.mes)))
        totalReciente += Number(row.ventas_unidades)
    }

    // ── Agrupar por SKU ────────────────────────────────────
    const porSku: Record<string, {
      sku: string; descripcion: string; vp: Record<string, number>; paises: Set<string>
    }> = {}

    for (const row of r.rows) {
      const k = row.sku || row.descripcion
      if (!porSku[k]) porSku[k] = { sku: row.sku || '', descripcion: row.descripcion || '', vp: {}, paises: new Set() }
      porSku[k].vp[`${row.ano}-${String(row.mes).padStart(2,'0')}`] = Number(row.ventas_unidades)
      for (const p of (row.paises_mes || [])) porSku[k].paises.add(p)
    }

    const pk = (p: { ano: number; mes: number }) => `${p.ano}-${String(p.mes).padStart(2,'0')}`

    const skuList = Object.values(porSku).map(({ sku, descripcion, vp, paises }) => {
      const sumRec  = recientes.reduce((s, p) => s + (vp[pk(p)] || 0), 0)
      const sumAnt  = anteriores.reduce((s, p) => s + (vp[pk(p)] || 0), 0)

      let crecimiento = 0
      if (sumAnt > 0)      crecimiento = ((sumRec - sumAnt) / sumAnt) * 100
      else if (sumRec > 0) crecimiento = 100

      const tendencia: 'creciendo' | 'estable' | 'declinando' =
        crecimiento >= 10 ? 'creciendo' : crecimiento <= -10 ? 'declinando' : 'estable'

      const accion: 'impulsar' | 'mantener' | 'revisar' | 'descontinuar' =
        crecimiento >= 10  ? 'impulsar'      :
        crecimiento >= -10 ? 'mantener'      :
        crecimiento >= -25 ? 'revisar'       : 'descontinuar'

      const participacion = totalReciente > 0 ? (sumRec / totalReciente) * 100 : 0

      const pctStr = (crecimiento > 0 ? '+' : '') + crecimiento.toFixed(1) + '%'
      const justificacion =
        accion === 'impulsar'      ? `Crecimiento de ${pctStr} vs período anterior. Reforzar visibilidad en punto de venta y asegurar abastecimiento continuo.`
        : accion === 'mantener'    ? `Variación de ${pctStr} dentro del rango estable. Sostener inversión actual y monitorear mes a mes.`
        : accion === 'revisar'     ? `Caída de ${pctStr} vs período anterior. Evaluar precio, canal de distribución o activaciones puntuales.`
        : `Caída severa de ${pctStr}. Analizar rentabilidad y evaluar retiro o reformulación del producto.`

      const serie = recientes.map(p => ({
        label: `${MESES_LABEL[p.mes]} ${String(p.ano).slice(2)}`,
        uds:   vp[pk(p)] || 0,
      }))

      return {
        sku, descripcion, sumReciente: sumRec, sumAnterior: sumAnt,
        crecimiento: Math.round(crecimiento * 10) / 10,
        tendencia, accion,
        participacion: Math.round(participacion * 10) / 10,
        serie, justificacion,
        paises: [...paises].sort(),
      }
    })

    // Solo SKUs con ventas en el período reciente (excluye los que solo aparecen en anteriores)
    const skuListActivos = skuList.filter(s => s.sumReciente > 0)
    skuListActivos.sort((a, b) => b.crecimiento - a.crecimiento)

    return NextResponse.json({
      skus: skuListActivos,
      recientes,
      anteriores,
      periodoRef:  { ano: recientes[0].ano, mes: recientes[0].mes },
      mesActual:   { ano: curAno, mes: curMes },
      totalSkus:   skuListActivos.length,
    })
  } catch (err: any) {
    console.error('mercadeo/recomendaciones error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
