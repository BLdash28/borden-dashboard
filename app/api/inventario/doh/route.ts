// app/api/inventario/doh/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Pool } from 'pg'
import { getUserRestrictions } from '@/lib/auth/restrictions'

export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const poolNeon = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 5,
})

function ceil0(n: number | null): number | null {
  if (n === null || !isFinite(n)) return null
  return Math.ceil(n)
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const paisFilter   = (searchParams.get('paises')    || '').split(',').map(v => v.trim()).filter(Boolean)
  const catFilter    = (searchParams.get('categorias') || '').split(',').map(v => v.trim()).filter(Boolean)
  const cadenaFilter = (searchParams.get('cadena')     || '').trim()
  const q            = (searchParams.get('q')          || '').trim().toLowerCase()

  try {
    const restrictions  = await getUserRestrictions()
    const allowedPaises = restrictions?.isRestricted ? restrictions.paises : null
    const efectivoPaises = allowedPaises
      ? (paisFilter.length > 0 ? paisFilter.filter((p: string) => allowedPaises.includes(p)) : allowedPaises)
      : paisFilter

    const incluirCO = efectivoPaises.length === 0 || efectivoPaises.includes('CO')
    const incluirRL = efectivoPaises.length === 0 || efectivoPaises.some((p: string) => p !== 'CO')

    // ── 1. Retail Link (Neon) — semana más reciente por pais+item ─────────────
    const rlRows: any[] = []
    if (incluirRL) {
      const paisCondRL = efectivoPaises.filter((p: string) => p !== 'CO')
      const paisWhereRL = paisCondRL.length > 0
        ? `AND pais IN (${paisCondRL.map((_: string, i: number) => '$' + (i + 1)).join(',')})`
        : ''
      const { rows } = await poolNeon.query(
        `SELECT DISTINCT ON (pais, item_nbr)
           pais, item_nbr, item, item_type, item_status,
           inventario, ordenes, transito, wharehouse,
           inv_cedi_cajas, inv_cedi_unds, semana
         FROM inventario_doh_retail
         WHERE 1=1 ${paisWhereRL}
         ORDER BY pais, item_nbr, semana DESC`,
        paisCondRL
      )
      rlRows.push(...rows)
    }

    // ── 2. Colombia (Supabase) — período más reciente ─────────────────────────
    let coRows: any[] = []
    if (incluirCO) {
      // Obtener período más reciente
      const { data: periodos } = await supabase
        .from('inventario_colombia')
        .select('ano, mes')
        .order('ano', { ascending: false })
        .order('mes', { ascending: false })
        .limit(1)

      if (periodos && periodos.length > 0) {
        const { ano, mes } = periodos[0]
        const { data } = await supabase
          .from('inventario_colombia')
          .select('ean_producto, codigo_interno, descripcion, qty, punto_venta')
          .eq('ano', ano)
          .eq('mes', mes)

        // Agregar por ean_producto (sumar qty de todas las tiendas)
        const coMap: Record<string, any> = {}
        for (const r of (data || [])) {
          const key = r.ean_producto || r.codigo_interno || ''
          if (!key) continue
          if (!coMap[key]) {
            coMap[key] = {
              pais:       'CO',
              item_nbr:   r.ean_producto || r.codigo_interno,
              item:       r.descripcion  || '',
              item_type:  '',
              item_status: 'A',
              inventario: 0,
              ordenes:    0,
              transito:   0,
              wharehouse: 0,
              inv_cedi_cajas: 0,
              inv_cedi_unds:  0,
              cadena:     'Éxito',
            }
          }
          coMap[key].inventario += Number(r.qty) || 0
        }
        coRows = Object.values(coMap)
      }
    }

    // ── 3. VPD 90 días (mv_vpd_90d en Neon) ──────────────────────────────────
    let vpdMap: Record<string, { vpd_unidades: number; vpd_valor: number; descripcion: string; categoria: string }> = {}
    try {
      const { rows: vpdRows } = await poolNeon.query(
        `SELECT pais, sku, vpd_unidades, vpd_valor, descripcion, categoria
         FROM mv_vpd_90d`
      )
      for (const r of vpdRows) {
        vpdMap[`${r.pais}|${r.sku}`] = {
          vpd_unidades: Number(r.vpd_unidades) || 0,
          vpd_valor:    Number(r.vpd_valor)    || 0,
          descripcion:  r.descripcion || '',
          categoria:    r.categoria   || '',
        }
      }
    } catch {
      // mv_vpd_90d no existe aún — VPD vacío, DOH será null
    }

    // ── 4. Unificar filas ─────────────────────────────────────────────────────
    const allRows = [
      ...rlRows.map((r: any) => ({
        pais:       r.pais,
        cadena:     'Walmart',
        item_nbr:   String(r.item_nbr),
        item:       r.item       || '',
        item_type:  r.item_type  || '',
        item_status: r.item_status || 'A',
        inventario: Number(r.inventario)     || 0,
        ordenes:    Number(r.ordenes)        || 0,
        transito:   Number(r.transito)       || 0,
        wharehouse: Number(r.wharehouse)     || 0,
        inv_cedi_cajas: Number(r.inv_cedi_cajas) || 0,
        inv_cedi_unds:  Number(r.inv_cedi_unds)  || 0,
        semana:     r.semana ?? null,
      })),
      ...coRows.map((r: any) => ({ ...r, semana: null })),
    ]

    // ── 5. Calcular DOH ───────────────────────────────────────────────────────
    const result = allRows.map((r: any) => {
      const vpd = vpdMap[`${r.pais}|${r.item_nbr}`]
      const vpd_u = vpd?.vpd_unidades ?? 0
      // Si la descripción del VPD es más completa, usarla
      const item      = r.item || vpd?.descripcion || r.item_nbr
      const item_type = r.item_type || vpd?.categoria || ''

      const doh_tiendas   = vpd_u > 0 ? ceil0(r.inventario / vpd_u)               : null
      const doh_tiendas_t = vpd_u > 0 ? ceil0((r.inventario + r.transito) / vpd_u) : null
      const doh_cedi      = vpd_u > 0 ? ceil0(r.inv_cedi_unds / vpd_u)             : null
      const doh_cedi_t    = vpd_u > 0 ? ceil0((r.inv_cedi_unds + r.transito) / vpd_u) : null

      return {
        pais:        r.pais,
        cadena:      r.cadena,
        item_nbr:    r.item_nbr,
        item,
        item_type,
        item_status: r.item_status,
        inventario:  r.inventario,
        ordenes:     r.ordenes,
        transito:    r.transito,
        wharehouse:  r.wharehouse,
        inv_cedi_cajas: r.inv_cedi_cajas,
        inv_cedi_unds:  r.inv_cedi_unds,
        prom_diario:    vpd_u,
        doh_tiendas,
        doh_tiendas_t,
        doh_cedi,
        doh_cedi_t,
        semana:      r.semana,
      }
    })

    // ── 6. Filtros client-side ────────────────────────────────────────────────
    const filtered = result.filter((r: any) => {
      if (catFilter.length && !catFilter.some(c => (r.item_type || '').toLowerCase() === c.toLowerCase())) return false
      if (cadenaFilter && r.cadena.toLowerCase() !== cadenaFilter.toLowerCase()) return false
      if (q && !r.item.toLowerCase().includes(q) && !r.item_nbr.toLowerCase().includes(q)) return false
      return true
    })

    // ── 7. KPIs ───────────────────────────────────────────────────────────────
    const riesgo    = filtered.filter((r: any) => r.doh_tiendas !== null && r.doh_tiendas <= 7).length
    const sobrestock = filtered.filter((r: any) => r.doh_tiendas !== null && r.doh_tiendas > 60).length
    const vpd_total = filtered.reduce((s: number, r: any) => s + r.prom_diario, 0)
    const conDoh    = filtered.filter((r: any) => r.doh_tiendas !== null)
    const doh_prom  = conDoh.length > 0
      ? Math.round(conDoh.reduce((s: number, r: any) => s + r.doh_tiendas!, 0) / conDoh.length)
      : null

    // Opciones de filtro únicas
    const paisOpts   = [...new Set(result.map((r: any) => r.pais))].sort()
    const cadenaOpts = [...new Set(result.map((r: any) => r.cadena))].sort()
    const catOpts    = [...new Set(result.map((r: any) => r.item_type).filter(Boolean))].sort()

    return NextResponse.json({
      rows: filtered,
      kpi: { riesgo, sobrestock, vpd_total: Math.round(vpd_total), doh_prom },
      paisOpts,
      cadenaOpts,
      catOpts,
    })
  } catch (err: any) {
    console.error('inventario/doh error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
