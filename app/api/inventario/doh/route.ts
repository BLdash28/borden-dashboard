// app/api/inventario/doh/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getUserRestrictions } from '@/lib/auth/restrictions'

// ── Clientes ─────────────────────────────────────────────────────────────────
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

import { pool as poolNeon } from '@/lib/db/pool'

// ── Mapeo de códigos de cadena ────────────────────────────────────────────────
const CADENA_MAP: Record<string, string> = {
  HM: 'WALMART',
  ME: 'MAS X MENOS',
  MI: 'MAXI PALI',
  PI: 'PALI',
  DF: 'DESPENSA FAMILIAR',
  PZ: 'PAIZ',
  LN: 'LA UNION',
  LJ: 'DESPENSA DON JUAN',
}

function normCadena(c: string): string {
  const upper = (c || '').trim().toUpperCase()
  return CADENA_MAP[upper] ?? (c || '').trim()
}

function parseMV(s: string | null): string[] {
  return (s || '').split(',').map(v => v.trim()).filter(Boolean)
}

/** Trae TODAS las filas paginando de a 1000 */
async function fetchAll(query: any): Promise<any[]> {
  const PAGE = 1000
  let all: any[] = []
  let from = 0
  while (true) {
    const { data, error } = await query.range(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    if (!data || data.length === 0) break
    all = all.concat(data)
    if (data.length < PAGE) break
    from += PAGE
  }
  return all
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const paisFilter   = parseMV(searchParams.get('paises'))
  const catFilter    = parseMV(searchParams.get('categorias'))
  const cadenaFilter = (searchParams.get('cadena') || '').trim().toUpperCase()
  const skuSearch    = (searchParams.get('sku') || '').trim()

  try {
    const restrictions = await getUserRestrictions()
    const allowedPaises = restrictions?.isRestricted ? restrictions.paises : null
    const efectivoPaises = allowedPaises
      ? (paisFilter.length > 0 ? paisFilter.filter(p => allowedPaises.includes(p)) : allowedPaises)
      : paisFilter

    // ── 1. Inventario (Supabase) + Neon queries en paralelo ──────────────────
    const includeCO = efectivoPaises.length === 0 || efectivoPaises.includes('CO')

    const buildQ = () => {
      let q = supabase
        .from('inventario_pdv')
        .select('pais, cliente, cadena, categoria, subcategoria, punto_venta, codigo_barras, sku, descripcion, qty')

      if (efectivoPaises.length > 0) q = q.in('pais', efectivoPaises)
      if (catFilter.length === 1)    q = q.ilike('categoria', catFilter[0])
      else if (catFilter.length > 1) q = q.in('categoria', catFilter)
      if (skuSearch) q = q.or(`descripcion.ilike.%${skuSearch}%,codigo_barras.ilike.%${skuSearch}%,sku.ilike.%${skuSearch}%`)

      return q
    }

    // inventario_colombia: snapshot más reciente por ean_producto + punto_venta
    const buildQCO = () => {
      let q = supabase
        .from('inventario_colombia')
        .select('punto_venta, codigo_barras, descripcion, qty')
        .order('ano', { ascending: false })
        .order('mes', { ascending: false })
      if (skuSearch) q = q.or(`descripcion.ilike.%${skuSearch}%,codigo_barras.ilike.%${skuSearch}%`)
      return q
    }

    const [rows, coRows, neonResults] = await Promise.all([
      fetchAll(buildQ()),
      includeCO ? fetchAll(buildQCO()) : Promise.resolve([]),
      Promise.allSettled([
        // Ventas 90d por descripción + país
        poolNeon.query(
          `SELECT UPPER(TRIM(REGEXP_REPLACE(descripcion, '^\\d+[-–]\\s*', ''))) AS desc_norm,
                  pais, SUM(ventas_unidades)::numeric AS ventas_90d
           FROM v_ventas
           WHERE make_date(ano::int, mes::int, COALESCE(dia::int, 1)) >= CURRENT_DATE - INTERVAL '90 days'
           GROUP BY UPPER(TRIM(REGEXP_REPLACE(descripcion, '^\\d+[-–]\\s*', ''))), pais`
        ),
        // Catálogo completo dim_producto (68 productos activos)
        poolNeon.query(
          `SELECT sku, codigo_barras, ean_normalizado, descripcion, categoria, subcategoria
           FROM dim_producto
           WHERE is_active = TRUE
           ORDER BY categoria, descripcion`
        ),
        // Países en ventas Neon (para incluir CO aunque no esté en Supabase inventory)
        poolNeon.query(
          `SELECT DISTINCT pais FROM v_ventas WHERE ano > 2000 AND pais IS NOT NULL ORDER BY pais`
        ),
        // Opciones globales de filtro (sin restricciones)
        fetchAll(
          supabase.from('inventario_pdv').select('pais, categoria, subcategoria')
        ),
      ]),
    ])

    // Desempacar resultados Neon
    const salesRows  = neonResults[0].status === 'fulfilled' ? (neonResults[0] as PromiseFulfilledResult<any>).value.rows  : []
    const dimProds   = neonResults[1].status === 'fulfilled' ? (neonResults[1] as PromiseFulfilledResult<any>).value.rows  : []
    const neonPaises = neonResults[2].status === 'fulfilled'
      ? ((neonResults[2] as PromiseFulfilledResult<any>).value.rows as any[]).map((r: any) => r.pais as string) : []
    const allOpts    = neonResults[3].status === 'fulfilled' ? (neonResults[3] as PromiseFulfilledResult<any>).value as any[] : []

    if (neonResults[0].status === 'rejected')
      console.warn('DOH: Neon sales failed:', (neonResults[0] as PromiseRejectedResult).reason?.message)
    if (neonResults[1].status === 'rejected')
      console.warn('DOH: dim_producto failed:', (neonResults[1] as PromiseRejectedResult).reason?.message)

    // ── 1b. Convertir inventario_colombia → formato inventario_pdv ────────────
    // Catálogo Colombia para categoría/subcategoría
    const { data: dimCO } = await supabase
      .from('dim_producto_colombia')
      .select('cod_barras, cod_interno, descripcion, categoria, subcategoria')
      .eq('is_active', true)

    const dimCOByEan: Record<string, any> = {}
    const dimCOBySku: Record<string, any> = {}
    for (const p of (dimCO || [])) {
      if (p.cod_barras) dimCOByEan[String(p.cod_barras).trim()] = p
      if (p.cod_interno) dimCOBySku[String(p.cod_interno).trim().toUpperCase()] = p
    }

    // snapshot más reciente por punto_venta + ean_producto (evitar duplicados)
    const coSnap: Record<string, any> = {}
    for (const r of coRows) {
      const k = `${r.punto_venta}|${r.codigo_barras}`
      if (!coSnap[k]) coSnap[k] = r
    }

    const coMapped = Object.values(coSnap).map((r: any) => {
      const ean = (r.codigo_barras || '').trim()
      const sku = ean
      const dim = dimCOByEan[ean] || dimCOBySku[sku] || null
      // filtro de categoría client-side si viene catFilter
      if (catFilter.length && dim && !catFilter.some(c => (dim.categoria || '').toLowerCase() === c.toLowerCase())) return null
      return {
        pais:         'CO',
        cliente:      '',
        cadena:       'Éxito',
        categoria:    dim?.categoria    || '',
        subcategoria: dim?.subcategoria || '',
        punto_venta:  r.punto_venta     || '',
        codigo_barras: ean              || sku,
        sku:          sku               || ean,
        descripcion:  dim?.descripcion  || r.descripcion || '',
        qty:          Number(r.qty)     || 0,
      }
    }).filter(Boolean) as any[]

    const allRows = [...rows, ...coMapped]

    // ── 2. Mapa de ventas ─────────────────────────────────────────────────────
    const salesMap: Record<string, number> = {}
    for (const r of salesRows) {
      salesMap[`${r.desc_norm}|${r.pais}`] = Number(r.ventas_90d) || 0
    }

    // ── 2b. Mapas de lookup dim_producto ──────────────────────────────────────
    // Misma lógica que fn_ean_normalize (odd/even check-digit rule)
    function eanNorm(raw: string): string | null {
      const s = (raw || '').replace(/\D/g, '')
      if (s.length < 2) return null
      const base = s.length % 2 !== 0 ? s.slice(0, -1) : s
      return base.padStart(13, '0')
    }
    function descNormKey(d: string): string {
      return (d || '').replace(/^\d+[-–]\s*/i, '').trim().toUpperCase()
    }

    type DimProd = { sku: string; barcode: string; descripcion: string; categoria: string; subcategoria: string }
    const bySkuCodInterno: Record<string, DimProd> = {}
    const byEan:           Record<string, DimProd> = {}
    const byDesc:          Record<string, DimProd> = {}

    for (const p of dimProds) {
      const prod: DimProd = {
        sku:          p.sku          || '',
        barcode:      p.codigo_barras || p.ean_normalizado || '',
        descripcion:  p.descripcion  || '',
        categoria:    p.categoria    || '',
        subcategoria: p.subcategoria || '',
      }
      // 1. Por cod_interno (sku en dim_producto)
      if (p.sku) bySkuCodInterno[String(p.sku).trim().toUpperCase()] = prod
      // 2. Por ean_normalizado (columna pre-calculada)
      if (p.ean_normalizado) byEan[String(p.ean_normalizado).trim()] = prod
      // 3. Por codigo_barras normalizado (fallback)
      const en = eanNorm(p.codigo_barras || '')
      if (en && !byEan[en]) byEan[en] = prod
      // 4. Por descripción normalizada
      const dk = descNormKey(p.descripcion)
      if (dk) byDesc[dk] = prod
    }

    function matchDim(invSku: string, invDesc: string): DimProd | null {
      const skuKey = (invSku || '').trim().toUpperCase()
      // a. cod_interno exacto
      if (skuKey && bySkuCodInterno[skuKey]) return bySkuCodInterno[skuKey]
      // b. EAN normalizado (el sku del inventario podría ser un barcode)
      const en = eanNorm(invSku)
      if (en && byEan[en]) return byEan[en]
      // c. Barcode sin normalizar (directo)
      const stripped = (invSku || '').replace(/^0+/, '')
      if (stripped) {
        for (const [key, prod] of Object.entries(byEan)) {
          if (key.replace(/^0+/, '') === stripped) return prod
        }
      }
      // d. Descripción normalizada
      const dk = descNormKey(invDesc)
      if (dk && byDesc[dk]) return byDesc[dk]
      return null
    }

    // ── 3. Agrupar inventario por SKU + País ──────────────────────────────────
    type SkuEntry = {
      pais: string; sku: string; barcode: string; desc: string; cat: string; subcat: string
      qty: number; pdvs: Set<string>; cadeQty: Record<string, number>
    }
    const skuMap: Record<string, SkuEntry> = {}
    const porPais:   Record<string, number> = {}
    const porCat:    Record<string, number> = {}
    const porCadena: Record<string, number> = {}

    allRows.forEach((r: any) => {
      const cn  = normCadena(r.cadena || '')
      // Merge con catálogo maestro — usa codigo_barras primero, luego sku como fallback
      const dim = matchDim(r.codigo_barras || r.sku || '', r.descripcion || '')
      const canonSku     = dim ? (dim.sku          || r.sku)          : (r.sku || '')
      const canonBarcode = dim ? (dim.barcode || r.codigo_barras || r.sku) : (r.codigo_barras || r.sku || '')
      const canonDesc    = dim ? (dim.descripcion   || r.descripcion)  : (r.descripcion || '')
      const canonCat     = dim ? (dim.categoria     || r.categoria)    : (r.categoria   || '')
      const canonSub     = dim ? (dim.subcategoria  || r.subcategoria) : (r.subcategoria || '')

      const k = canonSku + '|' + (r.pais || '')
      if (!skuMap[k]) skuMap[k] = {
        pais: r.pais, sku: canonSku, barcode: canonBarcode, desc: canonDesc,
        cat: canonCat, subcat: canonSub,
        qty: 0, pdvs: new Set(), cadeQty: {},
      }
      const qty = Number(r.qty) || 0
      skuMap[k].qty += qty
      if (r.punto_venta) skuMap[k].pdvs.add(r.punto_venta)
      if (cn) skuMap[k].cadeQty[cn] = (skuMap[k].cadeQty[cn] || 0) + qty

      if (r.pais)    porPais[r.pais]   = (porPais[r.pais]   || 0) + qty
      if (canonCat)  porCat[canonCat]  = (porCat[canonCat]  || 0) + qty
      if (cn)        porCadena[cn]     = (porCadena[cn]      || 0) + qty
    })

    // ── 4. Lista SKU con DOH + detalle por cadena ─────────────────────────────
    const cadenaOptSet = new Set<string>()
    const skuList = Object.values(skuMap)
      .map(s => {
        const sortedCadenas    = Object.entries(s.cadeQty).sort((a, b) => b[1] - a[1])
        const cadena_principal = sortedCadenas[0]?.[0] ?? ''
        const cadenas_list     = sortedCadenas.map(e => e[0])
        const cadenas_detail   = sortedCadenas.map(([cadena, qty]) => ({ cadena, qty }))
        cadenas_list.forEach(c => cadenaOptSet.add(c))

        const descClean = s.desc.replace(/^\d+[-–]\s*/i, '').trim()
        const descNorm  = descClean.toUpperCase()
        const ventas90d = salesMap[`${descNorm}|${s.pais}`] ?? null
        const avgDaily  = ventas90d !== null ? ventas90d / 90 : null
        const doh       = avgDaily !== null && avgDaily > 0
          ? Math.round((s.qty / avgDaily) * 10) / 10
          : null

        return {
          pais: s.pais, sku: s.sku, barcode: s.barcode, desc: s.desc, cat: s.cat, subcat: s.subcat,
          qty: s.qty, n_pdvs: s.pdvs.size, n_cadenas: cadenas_list.length,
          cadena_principal, cadenas_list, cadenas_detail,
          ventas90d: ventas90d !== null ? Math.round(ventas90d) : null,
          avg_daily: avgDaily !== null ? Math.round(avgDaily * 10) / 10 : null,
          doh,
          noStock: false,
        }
      })
      .filter(s => !cadenaFilter || s.cadenas_list.some(c => c.toUpperCase() === cadenaFilter))
      .sort((a, b) => b.qty - a.qty)

    // ── 5. Agregar SKUs del catálogo sin inventario ───────────────────────────
    // Solo cuando no hay filtro de país activo (los catalog rows no tienen país)
    const skuInInventory = new Set(skuList.map(s => s.sku).filter(Boolean))
    const showCatalogRows = efectivoPaises.length === 0 && !cadenaFilter
    const catalogRows = showCatalogRows
      ? dimProds
          .filter((p: any) => p.sku && !skuInInventory.has(p.sku))
          .filter((p: any) =>
            !catFilter.length ||
            catFilter.some((c: any) => (p.categoria || '').toLowerCase() === c.toLowerCase())
          )
          .filter((p: any) =>
            !skuSearch ||
            (p.descripcion || '').toLowerCase().includes(skuSearch.toLowerCase()) ||
            (p.sku || '').toLowerCase().includes(skuSearch.toLowerCase()) ||
            (p.codigo_barras || '').toLowerCase().includes(skuSearch.toLowerCase())
          )
          .map((p: any) => ({
            pais: '', sku: p.sku as string, barcode: p.codigo_barras as string || '',
            desc: p.descripcion as string || '',
            cat: p.categoria as string || '', subcat: p.subcategoria as string || '',
            qty: 0, n_pdvs: 0, n_cadenas: 0,
            cadena_principal: '', cadenas_list: [], cadenas_detail: [],
            ventas90d: null, avg_daily: null, doh: null, noStock: true,
          }))
      : []

    const fullSkuList = [...skuList, ...catalogRows]

    // ── 6. Totales ────────────────────────────────────────────────────────────
    const byPais   = Object.entries(porPais).map(([pais, qty]) => ({ pais, qty })).sort((a, b) => b.qty - a.qty)
    const byCat    = Object.entries(porCat).map(([cat, qty]) => ({ cat, qty })).sort((a, b) => b.qty - a.qty)
    const byCadena = Object.entries(porCadena).map(([cadena, qty]) => ({ cadena, qty }))
      .sort((a, b) => b.qty - a.qty).slice(0, 10)

    const totalQty    = allRows.reduce((s: number, r: any) => s + (Number(r.qty) || 0), 0)
    const totalPdvs   = new Set(allRows.map((r: any) => r.punto_venta).filter(Boolean)).size
    const totalSkus   = new Set(allRows.map((r: any) => r.sku).filter(Boolean)).size
    const totalPaises = new Set(allRows.map((r: any) => r.pais).filter(Boolean)).size

    // PDVs únicos por país — para calcular presencia correctamente por país
    const pdvsByPais: Record<string, number> = {}
    for (const r of allRows) {
      if (!r.pais || !r.punto_venta) continue
      if (!pdvsByPais[r.pais]) pdvsByPais[r.pais] = 0
    }
    for (const pais of Object.keys(pdvsByPais)) {
      pdvsByPais[pais] = new Set(
        allRows.filter((r: any) => r.pais === pais && r.punto_venta).map((r: any) => r.punto_venta)
      ).size
    }

    // ── 7. Opciones de filtro (con CO desde Neon) ─────────────────────────────
    const supabasePaises = [...new Set((allOpts as any[]).map((r: any) => r.pais).filter(Boolean))]
    const paisOpts    = [...new Set([...supabasePaises, ...neonPaises])].sort()
    const catOpts     = [...new Set((allOpts as any[]).map((r: any) => r.categoria).filter(Boolean))].sort()
    const subcatOpts  = [...new Set((allOpts as any[]).map((r: any) => r.subcategoria).filter(Boolean))].sort()
    const cadenaOpts  = [...cadenaOptSet].sort()

    return NextResponse.json({
      kpi: { totalQty, totalPdvs, totalSkus, totalPaises },
      pdvsByPais,
      skus: fullSkuList,
      byPais,
      byCat,
      byCadena,
      paisOpts,
      catOpts,
      subcatOpts,
      cadenaOpts,
    })
  } catch (err: any) {
    console.error('inventario/doh error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
