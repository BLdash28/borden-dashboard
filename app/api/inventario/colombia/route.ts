import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function eanNorm(raw: string): string | null {
  const s = (raw || '').replace(/\D/g, '')
  if (s.length < 2) return null
  // EAN-13 o mayor: usar como está (no quitar check digit)
  // EAN-8 / UPC-A (≤12): rellenar con ceros a la izquierda
  return s.length >= 13 ? s.slice(0, 13) : s.padStart(13, '0')
}

/** Pagina Supabase de a 1000 hasta traer todo */
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
  try {
    const { searchParams } = new URL(req.url)
    const anoP    = searchParams.get('ano')
    const mesP    = searchParams.get('mes')
    const marcaP  = searchParams.get('marca')
    const catP    = searchParams.get('categoria')

    // ── 1. Inventario Colombia (Supabase) + dim_producto (Neon) en paralelo ──
    const buildQ = () => {
      let q = supabase
        .from('inventario_colombia')
        .select('ano, mes, dia, ean_punto_venta, punto_venta, marca, codigo_interno, ean_producto, descripcion, qty, valor_cop')
      if (anoP)   q = q.eq('ano', parseInt(anoP))
      if (mesP)   q = q.eq('mes', parseInt(mesP))
      if (marcaP) q = q.ilike('marca', marcaP)
      return q
    }

    // Fecha hace 90 días para filtrar ventas
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - 90)
    const cutoffAno = cutoff.getFullYear()
    const cutoffMes = cutoff.getMonth() + 1

    const [invRows, dimRows, salesData] = await Promise.all([
      fetchAll(buildQ()),
      // Catálogo maestro Colombia desde Supabase
      fetchAll(
        supabase
          .from('dim_producto_colombia')
          .select('cod_barras, cod_interno, descripcion, categoria, subcategoria')
          .eq('is_active', true)
      ),
      // Ventas 90d Colombia para calcular DOI — via Supabase (fact_sales_sellout)
      fetchAll(
        supabase
          .from('fact_sales_sellout')
          .select('codigo_barras, ventas_unidades, ano, mes')
          .eq('pais', 'CO')
          .or(`ano.gt.${cutoffAno},and(ano.eq.${cutoffAno},mes.gte.${cutoffMes})`)
      ),
    ])

    // Agregar ventas 90d por codigo_barras
    const salesMap90: Record<string, number> = {}
    for (const r of salesData) {
      const en = eanNorm(r.codigo_barras || '')
      if (en) salesMap90[en] = (salesMap90[en] || 0) + (Number(r.ventas_unidades) || 0)
    }
    const salesRows = Object.entries(salesMap90).map(([codigo_barras, ventas_90d]) => ({ codigo_barras, ventas_90d }))

    // ── 2. Mapas de lookup dim_producto_colombia ──────────────────────────────
    type DimProd = { sku: string; barcode: string; descripcion: string; categoria: string; subcategoria: string }
    const byEan: Record<string, DimProd> = {}
    const byPlu: Record<string, DimProd> = {}

    for (const p of dimRows) {
      const prod: DimProd = {
        sku:          p.cod_interno  || '',
        barcode:      p.cod_barras   || '',
        descripcion:  p.descripcion  || '',
        categoria:    p.categoria    || '',
        subcategoria: p.subcategoria || '',
      }
      const en = eanNorm(p.cod_barras || '')
      if (en) byEan[en] = prod
      if (p.cod_interno) byPlu[String(p.cod_interno).trim().toUpperCase()] = prod
    }

    function matchDim(ean: string, plu: string): DimProd | null {
      const en = eanNorm(ean)
      if (en && byEan[en]) return byEan[en]
      const pk = (plu || '').trim().toUpperCase()
      if (pk && byPlu[pk]) return byPlu[pk]
      return null
    }

    // ── 3. Mapa de ventas 90d por código de barras ────────────────────────────
    const salesMap: Record<string, number> = {}
    for (const r of salesRows) {
      const en = eanNorm(r.codigo_barras || '')
      if (en) salesMap[en] = Number(r.ventas_90d) || 0
    }

    // ── 4. Agregar inventario por ean_producto ────────────────────────────────
    type InvEntry = {
      ean: string; sku: string; descripcion: string
      categoria: string; subcategoria: string; marca: string
      qty: number; valor_cop: number
      pdvs: Set<string>; marcas: Set<string>
    }
    const invMap: Record<string, InvEntry> = {}

    for (const r of invRows) {
      const dim = matchDim(r.ean_producto || '', r.codigo_interno || '')
      const en  = eanNorm(r.ean_producto || '') || (r.ean_producto || '')

      if (!invMap[en]) invMap[en] = {
        ean:          en,
        sku:          dim?.sku          || r.codigo_interno || '',
        descripcion:  dim?.descripcion  || r.descripcion    || '',
        categoria:    dim?.categoria    || '',
        subcategoria: dim?.subcategoria || '',
        marca:        r.marca           || '',
        qty:          0,
        valor_cop:    0,
        pdvs:         new Set(),
        marcas:       new Set(),
      }

      invMap[en].qty       += Number(r.qty)       || 0
      invMap[en].valor_cop += Number(r.valor_cop) || 0
      if (r.punto_venta) invMap[en].pdvs.add(r.punto_venta)
      if (r.marca)       invMap[en].marcas.add(r.marca)
    }

    // ── 5. Calcular DOI y construir lista final ───────────────────────────────
    const skus = Object.values(invMap)
      .filter(s => !catP || s.categoria.toLowerCase() === catP.toLowerCase())
      .map(s => {
        const ventas90d = salesMap[s.ean] ?? null
        const avgDaily  = ventas90d !== null ? ventas90d / 90 : null
        const doi       = avgDaily !== null && avgDaily > 0
          ? Math.round((s.qty / avgDaily) * 10) / 10
          : null
        return {
          ean:          s.ean,
          sku:          s.sku,
          descripcion:  s.descripcion,
          categoria:    s.categoria,
          subcategoria: s.subcategoria,
          marca:        s.marca,
          qty:          s.qty,
          valor_cop:    s.valor_cop,
          n_pdvs:       s.pdvs.size,
          ventas_90d:   ventas90d !== null ? Math.round(ventas90d) : null,
          avg_daily:    avgDaily  !== null ? Math.round(avgDaily * 10) / 10 : null,
          doi,
        }
      })
      .sort((a, b) => b.qty - a.qty)

    // ── 6. KPIs y opciones de filtro ─────────────────────────────────────────
    const totalQty  = invRows.reduce((s: number, r: any) => s + (Number(r.qty) || 0), 0)
    const totalValor = invRows.reduce((s: number, r: any) => s + (Number(r.valor_cop) || 0), 0)
    const totalPdvs = new Set(invRows.map((r: any) => r.punto_venta).filter(Boolean)).size
    const totalSkus = Object.keys(invMap).length

    const marcaOpts   = [...new Set(invRows.map((r: any) => r.marca).filter(Boolean))].sort()
    const catOpts     = [...new Set(skus.map(s => s.categoria).filter(Boolean))].sort()
    const subcatOpts  = [...new Set(skus.map(s => s.subcategoria).filter(Boolean))].sort()
    const periodos    = [...new Set(invRows.map((r: any) => `${r.ano}-${String(r.mes).padStart(2,'0')}`))]
      .sort().reverse().slice(0, 24)

    // ── Mapas para el merge en el Colombia page ───────────────────────────────
    const eanQtyMap:  Record<string, number> = {}  // ean normalizado → qty
    const skuQtyMap:  Record<string, number> = {}  // cod_interno → qty
    const descMap:    Record<string, string> = {}  // ean normalizado → descripcion
    const skuDescMap: Record<string, string> = {}  // cod_interno → descripcion
    const skuEanMap:  Record<string, string> = {}  // cod_interno → ean original (para mostrar en pantalla)

    for (const entry of Object.values(invMap)) {
      eanQtyMap[entry.ean] = entry.qty
      if (entry.descripcion) descMap[entry.ean] = entry.descripcion
      if (entry.sku) {
        const k = entry.sku.trim().toUpperCase()
        skuQtyMap[k]  = entry.qty
        skuEanMap[k]  = entry.ean   // ean del inventario para ese cod_interno
        if (entry.descripcion) skuDescMap[k] = entry.descripcion
      }
    }

    return NextResponse.json({
      kpi: { totalQty, totalValor, totalPdvs, totalSkus },
      skus,
      eanQtyMap,
      skuQtyMap,
      skuEanMap,
      descMap,
      skuDescMap,
      marcaOpts,
      catOpts,
      subcatOpts,
      periodos,
    })
  } catch (err: any) {
    console.error('inventario/colombia error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
