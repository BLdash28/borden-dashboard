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
  return s.length >= 13 ? s.slice(0, 13) : s.padStart(13, '0')
}

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
    const anoP   = searchParams.get('ano')
    const mesP   = searchParams.get('mes')
    const catP   = searchParams.get('categoria')
    const cadenaP = searchParams.get('cadena')

    const buildQ = () => {
      let q = supabase
        .from('inventario_colombia')
        .select('ano, mes, pais, cliente, cadena, formato, categoria, subcategoria, punto_venta, codigo_barras, descripcion, qty, precio_valor')
      if (anoP)    q = q.eq('ano', parseInt(anoP))
      if (mesP)    q = q.eq('mes', parseInt(mesP))
      if (catP)    q = q.ilike('categoria', catP)
      if (cadenaP) q = q.ilike('cadena', cadenaP)
      return q
    }

    // Fecha hace 90 días
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - 90)
    const cutoffAno = cutoff.getFullYear()
    const cutoffMes = cutoff.getMonth() + 1

    const [invRows, salesData] = await Promise.all([
      fetchAll(buildQ()),
      fetchAll(
        supabase
          .from('fact_sales_sellout')
          .select('codigo_barras, ventas_unidades')
          .eq('pais', 'CO')
          .gte('ano', cutoffAno)
      ).catch(() => []),
    ])

    // Mapa ventas 90d por EAN
    const salesMap: Record<string, number> = {}
    for (const r of salesData) {
      const en = eanNorm(r.codigo_barras || '')
      if (en) salesMap[en] = (salesMap[en] || 0) + (Number(r.ventas_unidades) || 0)
    }

    // Agregar inventario por codigo_barras
    type InvEntry = {
      ean: string; descripcion: string
      categoria: string; subcategoria: string
      cadena: string; formato: string; cliente: string; pais: string
      qty: number; precio_valor: number
      pdvs: Set<string>
    }
    const invMap: Record<string, InvEntry> = {}

    for (const r of invRows) {
      const en = eanNorm(r.codigo_barras || '') || (r.codigo_barras || r.descripcion || String(Math.random()))

      if (!invMap[en]) invMap[en] = {
        ean:          en,
        descripcion:  r.descripcion   || '',
        categoria:    r.categoria     || '',
        subcategoria: r.subcategoria  || '',
        cadena:       r.cadena        || '',
        formato:      r.formato       || '',
        cliente:      r.cliente       || '',
        pais:         r.pais          || '',
        qty:          0,
        precio_valor: 0,
        pdvs:         new Set(),
      }

      invMap[en].qty          += parseFloat(String(r.qty))          || 0
      invMap[en].precio_valor += parseFloat(String(r.precio_valor)) || 0
      if (r.punto_venta) invMap[en].pdvs.add(r.punto_venta)
    }

    const skus = Object.values(invMap).map(s => {
      const ventas90d = salesMap[s.ean] ?? null
      const avgDaily  = ventas90d !== null ? ventas90d / 90 : null
      const doi       = avgDaily !== null && avgDaily > 0
        ? Math.round((s.qty / avgDaily) * 10) / 10
        : null
      return {
        ean:          s.ean,
        descripcion:  s.descripcion,
        categoria:    s.categoria,
        subcategoria: s.subcategoria,
        cadena:       s.cadena,
        formato:      s.formato,
        cliente:      s.cliente,
        qty:          s.qty,
        precio_valor: s.precio_valor,
        n_pdvs:       s.pdvs.size,
        ventas_90d:   ventas90d !== null ? Math.round(ventas90d) : null,
        avg_daily:    avgDaily  !== null ? Math.round(avgDaily * 10) / 10 : null,
        doi,
      }
    }).sort((a, b) => b.qty - a.qty)

    const totalQty   = invRows.reduce((s: number, r: any) => s + (Number(r.qty) || 0), 0)
    const totalValor = invRows.reduce((s: number, r: any) => s + (Number(r.precio_valor) || 0), 0)
    const totalPdvs  = new Set(invRows.map((r: any) => r.punto_venta).filter(Boolean)).size
    const totalSkus  = Object.keys(invMap).length

    const catOpts    = [...new Set(skus.map(s => s.categoria).filter(Boolean))].sort()
    const cadenaOpts = [...new Set(skus.map(s => s.cadena).filter(Boolean))].sort()
    const periodos   = [...new Set(invRows.map((r: any) => `${r.ano}-${String(r.mes).padStart(2,'0')}`))]
      .sort().reverse().slice(0, 24)

    // Mapas para el merge en la vista Colombia
    const eanQtyMap:  Record<string, number> = {}
    const descMap:    Record<string, string>  = {}

    for (const s of Object.values(invMap)) {
      eanQtyMap[s.ean] = s.qty
      if (s.descripcion) descMap[s.ean] = s.descripcion
    }

    return NextResponse.json({
      kpi: { totalQty, totalValor, totalPdvs, totalSkus },
      skus,
      eanQtyMap,
      skuQtyMap:  {},
      skuEanMap:  {},
      skuDescMap: {},
      descMap,
      catOpts,
      cadenaOpts,
      periodos,
    })
  } catch (err: any) {
    console.error('inventario/colombia error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
