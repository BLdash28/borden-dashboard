'use client'
import { useState, useEffect, useCallback } from 'react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import BarChartPro from '@/components/dashboard/BarChartPro'
import LineChartPro from '@/components/dashboard/LineChartPro'
import { KpiCard, SectionHeader, HBar } from '@/components/ui'
import FiltrosGlobales from '@/components/dashboard/FiltrosGlobales'
import { fmtK, COUNTRY_COLORS } from '@/utils/helpers'

const CAT_COLORS: Record<string, string> = { 'Quesos': '#c8873a', 'Leches': '#2a7a58', 'Helados': '#a78bfa' }

export default function ResumenComercial() {
  const [filtros, setFiltros]         = useState<any>({})
  const [loading, setLoading]         = useState(true)
  const [kpis, setKpis]               = useState({ total: 0, unidades: 0, precio: 0, proyeccion: 0 })
  const [dailyData, setDailyData]     = useState<any[]>([])
  const [countryData, setCountryData] = useState<any[]>([])
  const [catData, setCatData]         = useState<any[]>([])
  const [topProds, setTopProds]       = useState<any[]>([])
  const [weekData, setWeekData]       = useState<any[]>([])

  const handleFiltro = (key: string, value: any) =>
    setFiltros((f: any) => ({ ...f, [key]: value }))

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const p = new URLSearchParams()
      if (filtros.pais)      p.set('pais',      filtros.pais)
      if (filtros.categoria) p.set('categorias', filtros.categoria)
      if (filtros.ano)       p.set('anos',       String(filtros.ano))
      if (filtros.mes)       p.set('meses',      String(filtros.mes))
      if (filtros.cliente)   p.set('cliente',    filtros.cliente)
      if (filtros.sku)       p.set('sku',        filtros.sku)
      if (!filtros.ano && !filtros.mes) p.set('todos', '1')

      const res  = await fetch(`/api/ventas/resumen?${p}`)
      const data = await res.json()
      if (data.error) { console.error('resumen error:', data.error); return }

      const totalValor    = Number(data.kpi?.total_valor)    || 0
      const totalUnidades = Number(data.kpi?.total_unidades) || 0
      setKpis({
        total:      totalValor,
        unidades:   totalUnidades,
        precio:     totalUnidades > 0 ? totalValor / totalUnidades : 0,
        proyeccion: totalValor * 1.114,
      })

      // Serie de tiempo: diaria (mes filtrado) o mensual (todos/año)
      if ((data.dias ?? []).length > 0) {
        setDailyData(
          (data.dias as any[]).map(r => ({
            d: `${String(data.mes ?? filtros.mes ?? '').padStart(2,'0')}/${String(r.dia).padStart(2,'0')}`,
            v: Number(r.ventas_valor),
          })).slice(-27)
        )
      } else {
        setDailyData(
          (data.meses ?? []).map((r: any) => ({
            d: `${r.ano}/${String(r.mes).padStart(2,'0')}`,
            v: Number(r.ventas_valor),
          }))
        )
      }

      setCountryData(
        (data.paises ?? []).map((r: any) => ({
          pais:   r.pais,
          ventas: Number(r.ventas_valor),
          color:  COUNTRY_COLORS[r.pais] ?? '#888',
        }))
      )

      setCatData(
        (data.categorias ?? []).map((r: any) => ({
          name:  r.categoria,
          value: Number(r.ventas_valor),
          color: CAT_COLORS[r.categoria] ?? '#888',
        }))
      )

      setTopProds(
        (data.top_skus ?? []).map((r: any) => ({
          n:   r.descripcion ?? r.sku,
          s:   Number(r.ventas_valor),
          cat: r.categoria ?? '',
        }))
      )

      setWeekData(
        (data.semanas ?? []).map((r: any) => ({
          wk: `WK${r.semana}`,
          v:  Number(r.ventas_valor),
        }))
      )
    } finally {
      setLoading(false)
    }
  }, [filtros])

  useEffect(() => { loadData() }, [loadData])

  const totalCat = catData.reduce((a, d) => a + d.value, 0) || 1
  const maxProd  = topProds[0]?.s || 1

  return (
    <div className="space-y-5 animate-fade-up">
      <FiltrosGlobales filtros={filtros} onChange={handleFiltro} onSearch={loadData} />

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="Ventas Totales USD" value={loading ? '…' : `$${fmtK(kpis.total)}`}
          sub="Período filtrado"      color="#2a7a58" icon="💰" />
        <KpiCard label="Ventas Unidades"    value={loading ? '…' : fmtK(kpis.unidades)}
          sub="unidades vendidas"     color="#c8873a" icon="📦" />
        <KpiCard label="Precio Promedio"    value={loading ? '…' : `$${kpis.precio.toFixed(2)}`}
          sub="por unidad"            color="#3a6fa8" icon="🏷️" />
        <KpiCard label="Proyección Mes"     value={loading ? '…' : `$${fmtK(kpis.proyeccion)}`}
          sub="+11.4% estimado"       color="#6b4fa8" icon="📈" />
      </div>

      {/* Charts row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="card p-5 lg:col-span-2">
          <SectionHeader title="Ventas Diarias POS" sub="USD · Período filtrado" />
          {loading ? <div className="h-[180px] flex items-center justify-center text-[12px]" style={{color:'var(--t3)'}}>Cargando…</div> : (
            <LineChartPro
              data={dailyData}
              nameKey="d"
              dataKey="v"
              color="#c8873a"
              height={180}
              area
              formatter={(v: number) => '$' + v.toLocaleString('en-US')}
              tooltipUnit="Ventas"
              xTickFmt={(v: number) => String(v)}
              xInterval={4}
              yTickFmt={(v: number) => '$' + (v / 1000).toFixed(0) + 'K'}
              margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
            />
          )}
        </div>

        <div className="card p-5">
          <SectionHeader title="Mix Categoría" sub="% ventas USD"/>
          {loading ? <div className="h-[100px] flex items-center justify-center text-[12px]" style={{color:'var(--t3)'}}>Cargando…</div> : (
            <div className="flex items-center gap-3">
              <ResponsiveContainer width={100} height={100}>
                <PieChart>
                  <Pie data={catData} cx="50%" cy="50%" innerRadius={28} outerRadius={46} paddingAngle={3} dataKey="value">
                    {catData.map((d,i) => <Cell key={i} fill={d.color}/>)}
                  </Pie>
                  <Tooltip formatter={(v:any)=>fmtK(v)}/>
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1 space-y-2">
                {catData.map(d=>(
                  <div key={d.name}>
                    <div className="flex justify-between text-[11px] mb-0.5">
                      <span style={{color:'var(--t2)'}}>{d.name}</span>
                      <span className="font-bold" style={{color:'var(--t1)'}}>{fmtK(d.value)}</span>
                    </div>
                    <div className="h-1 rounded-full" style={{background:'var(--border)'}}>
                      <div className="h-full rounded-full"
                        style={{width:`${(d.value/totalCat*100).toFixed(0)}%`,background:d.color}}/>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Charts row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="card p-5">
          <SectionHeader title="Top Productos" sub="Ventas USD"/>
          {loading ? <div className="text-[12px]" style={{color:'var(--t3)'}}>Cargando…</div> : (
            topProds.map(p=>(
              <HBar key={p.n} label={p.n} value={p.s} max={maxProd}
                color={p.cat==='Quesos'?'#c8873a':p.cat==='Helados'?'#a78bfa':'#2a7a58'} suffix="$"/>
            ))
          )}
        </div>

        <div className="card p-5">
          <SectionHeader title="Ventas por País" sub="USD"/>
          {loading ? <div className="h-[200px] flex items-center justify-center text-[12px]" style={{color:'var(--t3)'}}>Cargando…</div> : (
            <BarChartPro
              data={countryData}
              dataKey="ventas"
              nameKey="pais"
              layout="vertical"
              height={200}
              formatter={(v: number) => '$' + (v / 1000).toFixed(0) + 'K'}
              tooltipUnit="Ventas"
              yWidth={28}
            />
          )}
        </div>

        <div className="card p-5">
          <SectionHeader title="Ventas por Semana" sub="Período filtrado"/>
          {loading ? <div className="h-[200px] flex items-center justify-center text-[12px]" style={{color:'var(--t3)'}}>Cargando…</div> : (
            <BarChartPro
              data={weekData}
              dataKey="v"
              nameKey="wk"
              colors="#c8873a"
              height={200}
              formatter={(v: number) => '$' + (v / 1000).toFixed(0) + 'K'}
              tooltipUnit="Ventas"
            />
          )}
        </div>
      </div>
    </div>
  )
}
