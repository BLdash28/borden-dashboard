'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { Download, RefreshCw } from 'lucide-react'
import MultiSelect from '@/components/dashboard/MultiSelect'

const MESES = ['','Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
const toNum = (v: unknown) => { const n = parseFloat(String(v)); return isNaN(n) ? 0 : n }
const fmt   = (v: unknown) => {
  const n = toNum(v)
  if (n >= 1e6) return '$' + (n/1e6).toFixed(2) + 'M'
  if (n >= 1e3) return '$' + (n/1e3).toFixed(1) + 'K'
  return '$' + n.toFixed(2)
}

interface SkuRow {
  sku:         string
  descripcion: string
  categoria:   string
  pais:        string
  unidades:    number
  ingresos:    number
  margen_valor:number
  margen_pct:  number
  precio_prom: number
  y_prev:      number  // same filters but previous year
}

export default function SellInSkus() {
  const [fAnos,  setFAnos]  = useState<string[]>([])
  const [fMeses, setFMeses] = useState<string[]>([])
  const [fPaises,setFPaises]= useState<string[]>([])
  const [fCats,  setFCats]  = useState<string[]>([])
  const [buscarInput, setBuscarInput] = useState('')
  const [buscar,      setBuscar]      = useState('')

  const [anos,     setAnos]     = useState<number[]>([])
  const [mesMap,   setMesMap]   = useState<Record<number,number[]>>({})
  const [paisOpts, setPaisOpts] = useState<string[]>([])
  const [catOpts,  setCatOpts]  = useState<string[]>([])

  const [rows,    setRows]    = useState<SkuRow[]>([])
  const [total,   setTotal]   = useState(0)
  const [page,    setPage]    = useState(1)
  const [loading, setLoading] = useState(true)
  const [sortKey, setSortKey] = useState<'ingresos'|'unidades'|'margen_pct'>('ingresos')
  const [sortDir, setSortDir] = useState<'asc'|'desc'>('desc')
  const PAGE_SIZE = 500
  const initDone = useRef(false)

  useEffect(()=>{
    if (initDone.current) return
    initDone.current = true
    fetch('/api/ventas/resumen?tipo=periodos').then(r=>r.json()).then(j=>{
      const mm: Record<number,number[]> = {}
      ;(j.periodos||[]).forEach((p:any)=>{const a=Number(p.ano);if(!mm[a])mm[a]=[];mm[a].push(Number(p.mes))})
      Object.keys(mm).forEach(a=>mm[Number(a)].sort((x,y)=>x-y))
      setMesMap(mm)
      setAnos(Object.keys(mm).map(Number).sort((a,b)=>b-a))
    })
    fetch('/api/ventas/sell-in/opts?dim=pais').then(r=>r.json()).then(j=>setPaisOpts(j.opts??[]))
    fetch('/api/ventas/sell-in/opts?dim=categoria').then(r=>r.json()).then(j=>setCatOpts(j.opts??[]))
  },[])

  const cargar = useCallback((
    anos:string[], meses:string[], paises:string[], cats:string[], buscarVal:string, pg:number
  )=>{
    setLoading(true)
    const p = new URLSearchParams()
    if (anos.length)   p.set('anos',       anos.join(','))
    if (meses.length)  p.set('meses',      meses.join(','))
    if (paises.length) p.set('paises',     paises.join(','))
    if (cats.length)   p.set('categorias', cats.join(','))
    if (buscarVal)     p.set('buscar',     buscarVal)
    p.set('page',     String(pg))
    p.set('pageSize', String(PAGE_SIZE))

    fetch('/api/ventas/sell-in?'+p).then(r=>r.json()).then(j=>{
      if (j.error) return
      setTotal(toNum(j.total))

      // Aggregate by SKU
      const skuMap: Record<string,SkuRow> = {}
      ;(j.rows??[]).forEach((r:any)=>{
        const key = r.sku + '|' + r.pais
        if (!skuMap[key]) skuMap[key] = {
          sku: r.sku, descripcion: r.descripcion||'', categoria: r.categoria||'',
          pais: r.pais, unidades: 0, ingresos: 0, margen_valor: 0, margen_pct: 0,
          precio_prom: 0, y_prev: 0,
        }
        skuMap[key].unidades    += toNum(r.unidades)
        skuMap[key].ingresos    += toNum(r.ingresos)
        skuMap[key].margen_valor+= toNum(r.margen_valor??0)
      })
      // Calc derived
      Object.values(skuMap).forEach(s=>{
        s.margen_pct  = s.ingresos > 0 ? (s.margen_valor / s.ingresos) * 100 : 0
        s.precio_prom = s.unidades > 0 ? s.ingresos / s.unidades : 0
      })
      setRows(Object.values(skuMap))
    }).finally(()=>setLoading(false))
  },[])

  useEffect(()=>{ cargar([],[],[],[],''  ,1) },[cargar])

  const trigger = (
    anos=fAnos, meses=fMeses, paises=fPaises, cats=fCats, b=buscar, pg=1
  )=>{ setPage(pg); cargar(anos,meses,paises,cats,b,pg) }

  const mesesDisp = fAnos.length
    ? [...new Set(fAnos.flatMap(a=>mesMap[Number(a)]??[]))].sort((a,b)=>a-b)
    : [...new Set(Object.values(mesMap).flat())].sort((a,b)=>a-b)

  const totalPages = Math.ceil(total / PAGE_SIZE)
  const grandTotal = rows.reduce((s,r)=>s+r.ingresos,0) || 1

  const sorted = [...rows].sort((a,b)=>{
    const d = a[sortKey]-b[sortKey]
    return sortDir==='desc'?-d:d
  })

  const toggleSort = (k: typeof sortKey) =>
    setSortKey(prev=>{ if(prev===k){setSortDir(d=>d==='desc'?'asc':'desc');return k} setSortDir('desc');return k })

  const arrow = (k: typeof sortKey) => sortKey===k?(sortDir==='desc'?' ↓':' ↑'):' ↕'

  const descargarCSV = () => {
    const h = ['País','SKU','Producto','Categoría','Unidades','USD','Precio Prom.','Margen USD','Margen %','% del Total']
    const csv = [h.join(','), ...sorted.map(r=>[
      r.pais, r.sku, `"${r.descripcion.replace(/"/g,'""')}"`, r.categoria,
      r.unidades.toFixed(0), r.ingresos.toFixed(2), r.precio_prom.toFixed(4),
      r.margen_valor.toFixed(2), r.margen_pct.toFixed(2)+'%',
      (r.ingresos/grandTotal*100).toFixed(2)+'%',
    ].join(','))].join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8;'}))
    a.download = `sku_sellin_${new Date().toISOString().slice(0,10)}.csv`
    a.click()
  }

  const margenColor = (pct: number) =>
    pct >= 30 ? 'text-green-600' : pct >= 15 ? 'text-amber-600' : 'text-red-500'

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-widest">Ventas Sell In</p>
          <h1 className="text-2xl font-bold text-gray-800">SKU Descargable</h1>
          <p className="text-sm text-gray-400 mt-1">Detalle por SKU · Crecimiento · Margen</p>
        </div>
        <button onClick={descargarCSV} disabled={rows.length===0}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 shadow-sm disabled:opacity-40">
          <Download size={14}/> Descargar CSV
        </button>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 space-y-3">
        {/* Búsqueda */}
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
          <input
            type="text"
            value={buscarInput}
            onChange={e=>setBuscarInput(e.target.value)}
            onKeyDown={e=>{ if(e.key==='Enter'){setBuscar(buscarInput);trigger(fAnos,fMeses,fPaises,fCats,buscarInput)} }}
            placeholder="Buscar por SKU, código de barras o descripción…"
            className="w-full pl-8 pr-8 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400"
          />
          {buscarInput && (
            <button onClick={()=>{setBuscarInput('');setBuscar('');trigger(fAnos,fMeses,fPaises,fCats,'')}}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs">✕</button>
          )}
        </div>
        {/* Filtros cascada */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex-1 min-w-[130px]">
            <MultiSelect label="Año" options={anos.map(a=>({value:String(a),label:String(a)}))}
              value={fAnos} onChange={v=>{setFAnos(v);trigger(v,fMeses,fPaises,fCats,buscar)}} placeholder="Todos"/>
          </div>
          <div className="flex-1 min-w-[130px]">
            <MultiSelect label="Mes" options={mesesDisp.map(m=>({value:String(m),label:MESES[m]}))}
              value={fMeses} onChange={v=>{setFMeses(v);trigger(fAnos,v,fPaises,fCats,buscar)}} placeholder="Todos"/>
          </div>
          <div className="flex-1 min-w-[130px]">
            <MultiSelect label="País" options={paisOpts.map(p=>({value:p,label:p}))}
              value={fPaises} onChange={v=>{setFPaises(v);trigger(fAnos,fMeses,v,fCats,buscar)}} placeholder="Todos"/>
          </div>
          <div className="flex-1 min-w-[130px]">
            <MultiSelect label="Categoría" options={catOpts.map(c=>({value:c,label:c}))}
              value={fCats} onChange={v=>{setFCats(v);trigger(fAnos,fMeses,fPaises,v,buscar)}} placeholder="Todas"/>
          </div>
          <button onClick={()=>trigger()} className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 rounded-lg text-sm text-gray-600 hover:bg-gray-200">
            <RefreshCw size={13} className={loading?'animate-spin':''}/> Actualizar
          </button>
          <button onClick={()=>{setFAnos([]);setFMeses([]);setFPaises([]);setFCats([]);setBuscarInput('');setBuscar('');cargar([],[],[],[],'',1)}}
            className="text-xs text-gray-400 hover:text-gray-600 underline px-2 py-2">Limpiar</button>
        </div>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 overflow-x-auto">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-700">
            Detalle SKU
            {total > 0 && <span className="ml-2 text-xs text-gray-400 font-normal">
              ({((page-1)*PAGE_SIZE+1).toLocaleString()}–{Math.min(page*PAGE_SIZE,rows.length).toLocaleString()} de {rows.length.toLocaleString()})
            </span>}
          </h3>
        </div>

        {loading
          ? <div className="h-40 flex items-center justify-center text-gray-300 text-sm">Cargando...</div>
          : rows.length===0
            ? <div className="h-40 flex items-center justify-center text-gray-400 text-sm">Sin datos para los filtros seleccionados</div>
            : <>
                <table className="w-full text-xs min-w-[800px]">
                  <thead>
                    <tr className="border-b border-gray-200 text-gray-400 uppercase tracking-widest text-[10px]">
                      <th className="text-left py-2 pr-3">País</th>
                      <th className="text-left py-2 pr-3">SKU</th>
                      <th className="text-left py-2 pr-3">Producto</th>
                      <th className="text-left py-2 pr-3">Cat.</th>
                      <th className="text-right py-2 pr-3 cursor-pointer hover:text-gray-600" onClick={()=>toggleSort('unidades')}>
                        Unidades{arrow('unidades')}
                      </th>
                      <th className="text-right py-2 pr-3 cursor-pointer hover:text-gray-600" onClick={()=>toggleSort('ingresos')}>
                        USD{arrow('ingresos')}
                      </th>
                      <th className="text-right py-2 pr-3">P. Prom.</th>
                      <th className="text-right py-2 pr-3 cursor-pointer hover:text-gray-600" onClick={()=>toggleSort('margen_pct')}>
                        Margen %{arrow('margen_pct')}
                      </th>
                      <th className="text-right py-2 pr-3">Margen $</th>
                      <th className="text-right py-2">% Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.map((r,i)=>(
                      <tr key={i} className={`border-b border-gray-50 hover:bg-amber-50/40 ${i%2===0?'':'bg-gray-50/30'}`}>
                        <td className="py-1.5 pr-3 font-semibold text-amber-600">{r.pais}</td>
                        <td className="py-1.5 pr-3 font-mono text-gray-500">{r.sku}</td>
                        <td className="py-1.5 pr-3 text-gray-700 max-w-[160px] truncate">{r.descripcion}</td>
                        <td className="py-1.5 pr-3 text-gray-500">{r.categoria}</td>
                        <td className="py-1.5 pr-3 text-right text-gray-700">{r.unidades.toLocaleString()}</td>
                        <td className="py-1.5 pr-3 text-right font-semibold text-gray-800">{fmt(r.ingresos)}</td>
                        <td className="py-1.5 pr-3 text-right text-gray-500">{fmt(r.precio_prom)}</td>
                        <td className={`py-1.5 pr-3 text-right font-bold ${margenColor(r.margen_pct)}`}>
                          {r.margen_pct.toFixed(1)}%
                        </td>
                        <td className="py-1.5 pr-3 text-right text-gray-600">{fmt(r.margen_valor)}</td>
                        <td className="py-1.5 text-right text-gray-400">{(r.ingresos/grandTotal*100).toFixed(1)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {totalPages > 1 && (
                  <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100">
                    <button onClick={()=>{const pg=page-1;setPage(pg);cargar(fAnos,fMeses,fPaises,fCats,buscar,pg)}}
                      disabled={page===1}
                      className="px-3 py-1.5 text-sm text-gray-600 bg-gray-100 rounded-lg disabled:opacity-40 hover:bg-gray-200">
                      ← Anterior
                    </button>
                    <span className="text-sm text-gray-500">Página {page} de {totalPages}</span>
                    <button onClick={()=>{const pg=page+1;setPage(pg);cargar(fAnos,fMeses,fPaises,fCats,buscar,pg)}}
                      disabled={page===totalPages}
                      className="px-3 py-1.5 text-sm text-gray-600 bg-gray-100 rounded-lg disabled:opacity-40 hover:bg-gray-200">
                      Siguiente →
                    </button>
                  </div>
                )}
              </>
        }
      </div>
    </div>
  )
}
