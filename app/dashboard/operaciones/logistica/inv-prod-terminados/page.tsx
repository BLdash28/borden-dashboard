'use client'
import { useEffect, useState, useCallback } from 'react'
import { RefreshCw, Package, Box, Layers, AlertCircle, ArrowDownRight } from 'lucide-react'

const toNum = (v: any) => { const n = parseFloat(String(v)); return isNaN(n) ? 0 : n }
const fmtN  = (v: any) => toNum(v).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
const fmtFecha = (f: string) => {
  if (!f) return '—'
  const d = new Date(f)
  return d.toLocaleDateString('es-GT', { day: '2-digit', month: 'short', year: 'numeric' })
}

type SourceTag = 'corrugado' | 'empaque'

interface ProdRow {
  cod_interno: string
  descripcion: string
  u_m: string
  cant_bodega: number
  merma: number
  total_disponible: number
  fuente: SourceTag
}

interface SalidaRow {
  id: number
  fecha: string
  cod_interno: string
  descripcion: string
  u_m: string
  cantidad_salida: number
  referencia_pedido: number | null
  ref_orden: string | null
  observacion?: string | null
  fuente: SourceTag
}

const MERMA_CORRUGADO = 0.01   // 1%
const MERMA_TAPA      = 0.0125 // 1.25%
const MERMA_EMPAQUE   = 0.025  // 2.5%

const COD_TAPA  = 'A100000125'
const COD_CINTA = 'A885695101'

function getMermaEmpaque(cod: string, cant: number) {
  return cod === COD_TAPA ? cant * MERMA_TAPA : cant * MERMA_EMPAQUE
}

function getMermaCorrugado(cant: number) {
  return cant * MERMA_CORRUGADO
}

export default function InvProdTerminadosPage() {
  const [corrugados, setCorrugados] = useState<ProdRow[]>([])
  const [empaques,   setEmpaques]   = useState<ProdRow[]>([])
  const [salidas,    setSalidas]    = useState<SalidaRow[]>([])
  const [loading,    setLoading]    = useState(false)
  const [error,      setError]      = useState('')
  const [filtro,     setFiltro]     = useState<'todos' | SourceTag>('todos')
  const [busqueda,   setBusqueda]   = useState('')

  const cargar = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [rCor, rEmp, rSalCor, rSalEmp] = await Promise.all([
        fetch('/api/operaciones/inv-corrugados?vista=inventario').then(r => r.json()),
        fetch('/api/operaciones/inv-materiales?vista=inventario').then(r => r.json()),
        fetch('/api/operaciones/inv-corrugados?vista=salidas').then(r => r.json()),
        fetch('/api/operaciones/inv-materiales?vista=salidas').then(r => r.json()),
      ])

      if (rCor.error) throw new Error('Corrugados: ' + rCor.error)
      if (rEmp.error) throw new Error('Empaques: '   + rEmp.error)

      // Salidas combinadas ordenadas por fecha desc
      const salidasCor: SalidaRow[] = (rSalCor.rows || []).map((r: any) => ({ ...r, cantidad_salida: toNum(r.cantidad_salida), fuente: 'corrugado' as SourceTag }))
      const salidasEmp: SalidaRow[] = (rSalEmp.rows || []).map((r: any) => ({ ...r, cantidad_salida: toNum(r.cantidad_salida), fuente: 'empaque'   as SourceTag }))
      const todasSalidas = [...salidasCor, ...salidasEmp]
        .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime())
      setSalidas(todasSalidas)

      const rowsCor: ProdRow[] = (rCor.rows || []).map((r: any) => {
        const cant  = Math.round(toNum(r.cant_bodega))
        const merma = getMermaCorrugado(cant)
        return {
          cod_interno:      r.cod_interno,
          descripcion:      r.descripcion,
          u_m:              r.u_m || 'UNIDAD',
          cant_bodega:      cant,
          merma,
          total_disponible: cant - merma,
          fuente:           'corrugado',
        }
      })

      const rowsEmp: ProdRow[] = (rEmp.rows || []).map((r: any) => {
        const cant  = toNum(r.cant_bodega)
        const merma = getMermaEmpaque(r.cod_interno, cant)
        return {
          cod_interno:      r.cod_interno,
          descripcion:      r.descripcion,
          u_m:              r.cod_interno === COD_CINTA ? 'ROLLO' : (r.u_m || 'UNIDAD'),
          cant_bodega:      cant,
          merma,
          total_disponible: cant - merma,
          fuente:           'empaque',
        }
      })

      setCorrugados(rowsCor)
      setEmpaques(rowsEmp)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { cargar() }, [cargar])

  // ── Datos combinados ─────────────────────────────────────────
  const todos: ProdRow[] = [...corrugados, ...empaques]
  const filtrados = todos
    .filter(r => filtro === 'todos' || r.fuente === filtro)
    .filter(r => {
      if (!busqueda.trim()) return true
      const q = busqueda.toLowerCase()
      return r.cod_interno.toLowerCase().includes(q) || r.descripcion.toLowerCase().includes(q)
    })

  // ── KPIs ─────────────────────────────────────────────────────
  const totalCorrugados   = corrugados.reduce((s, r) => s + r.total_disponible, 0)
  const totalEmpaques     = empaques.reduce((s, r) => s + r.total_disponible, 0)
  const totalGeneral      = totalCorrugados + totalEmpaques
  const totalProductos    = todos.length
  const totalSalidaProd   = salidas.reduce((s, r) => s + r.cantidad_salida, 0)

  const SOURCE_BADGE: Record<SourceTag, { label: string; cls: string }> = {
    corrugado: { label: 'CAJA',    cls: 'bg-orange-100 text-orange-700' },
    empaque:   { label: 'EMPAQUE', cls: 'bg-blue-100 text-blue-700'     },
  }

  return (
    <div className="p-6 space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-widest">Operaciones · Logística</p>
          <h1 className="text-2xl font-bold text-gray-800">Inventario Productos Terminados</h1>
          <p className="text-xs text-gray-400 mt-0.5">Vista consolidada: Corrugados + Materiales de Empaques</p>
        </div>
        <button onClick={cargar}
          className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 shadow-sm">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''}/>
          Actualizar
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
          <AlertCircle size={16}/>{error}
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Corrugados Disp.',    value: loading ? '...' : fmtN(totalCorrugados),     sub: 'unidades disponibles',       icon: <Box size={18}/>,           color: 'border-l-orange-400'  },
          { label: 'Empaques Disp.',      value: loading ? '...' : fmtN(totalEmpaques),       sub: 'unidades disponibles',       icon: <Package size={18}/>,       color: 'border-l-blue-500'    },
          { label: 'Total Disponible',    value: loading ? '...' : fmtN(totalGeneral),        sub: 'unidades neto (−merma)',      icon: <Layers size={18}/>,        color: 'border-l-emerald-500' },
          { label: 'Salidas Producción',  value: loading ? '...' : fmtN(totalSalidaProd),     sub: `${salidas.length} registros`,icon: <ArrowDownRight size={18}/>, color: 'border-l-red-400'     },
        ].map((k, i) => (
          <div key={i} className={`bg-white rounded-xl border border-gray-100 shadow-sm p-5 border-l-4 ${k.color}`}>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">{k.label}</p>
              <span className="text-gray-300">{k.icon}</span>
            </div>
            <p className="text-2xl font-bold text-gray-800">{k.value}</p>
            <p className="text-xs text-gray-400 mt-1">{k.sub}</p>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Tabs fuente */}
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
          {([
            { key: 'todos',     label: `Todos (${todos.length})`,           icon: <Layers size={13}/>  },
            { key: 'corrugado', label: `Corrugados (${corrugados.length})`, icon: <Box size={13}/>     },
            { key: 'empaque',   label: `Empaques (${empaques.length})`,     icon: <Package size={13}/> },
          ] as const).map(t => (
            <button key={t.key}
              onClick={() => setFiltro(t.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                filtro === t.key ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500 hover:text-gray-700'
              }`}>
              {t.icon}{t.label}
            </button>
          ))}
        </div>

        {/* Búsqueda */}
        <input
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          placeholder="Buscar por COD o descripción..."
          className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-amber-400 w-64"
        />
        {busqueda && (
          <button onClick={() => setBusqueda('')}
            className="text-xs text-gray-400 hover:text-gray-600 underline">
            Limpiar
          </button>
        )}
      </div>

      {/* Tabla consolidada */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-semibold text-gray-700">Stock Consolidado</h3>
          <span className="text-xs text-gray-400">{filtrados.length} productos</span>
        </div>

        {loading ? (
          <div className="h-48 flex items-center justify-center text-gray-300 text-sm">Cargando...</div>
        ) : filtrados.length === 0 ? (
          <div className="h-48 flex items-center justify-center text-gray-400 text-sm">Sin resultados</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-400 uppercase tracking-widest bg-gray-50 border-b border-gray-100">
                  <th className="text-left px-5 py-3">Tipo</th>
                  <th className="text-left px-4 py-3">COD_INTERNO</th>
                  <th className="text-left px-4 py-3">Descripción</th>
                  <th className="text-center px-4 py-3">U/M</th>
                  <th className="text-right px-4 py-3">Cant. Bodega</th>
                  <th className="text-right px-4 py-3">Merma</th>
                  <th className="text-right px-5 py-3">Total Disponible</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((r, i) => {
                  const badge   = SOURCE_BADGE[r.fuente]
                  const mermaPct = r.fuente === 'corrugado'
                    ? 1
                    : r.cod_interno === COD_TAPA ? 1.25 : 2.5
                  return (
                    <tr key={i} className="border-b border-gray-50 hover:bg-amber-50/40 transition-colors">
                      <td className="px-5 py-3">
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${badge.cls}`}>
                          {badge.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs font-semibold text-amber-700">
                          {r.cod_interno}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-700 max-w-[280px] truncate">{r.descripcion}</td>
                      <td className="px-4 py-3 text-center text-gray-500 text-xs">{r.u_m}</td>
                      <td className="px-4 py-3 text-right font-medium text-gray-800">
                        {fmtN(r.cant_bodega)}
                      </td>
                      <td className="px-4 py-3 text-right text-xs">
                        <span className="text-red-400">-{fmtN(r.merma)}</span>
                        <span className="text-gray-300 ml-1">({mermaPct}%)</span>
                      </td>
                      <td className="px-5 py-3 text-right font-bold text-emerald-700">
                        {fmtN(r.total_disponible)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Salidas a Producción */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ArrowDownRight size={16} className="text-amber-500" />
            <h3 className="font-semibold text-gray-700">Salidas a Producción</h3>
          </div>
          <span className="text-xs text-gray-400">{salidas.length} registros</span>
        </div>

        {loading ? (
          <div className="h-32 flex items-center justify-center text-gray-300 text-sm">Cargando...</div>
        ) : salidas.length === 0 ? (
          <div className="h-32 flex items-center justify-center text-gray-400 text-sm">Sin salidas registradas</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-400 uppercase tracking-widest bg-gray-50 border-b border-gray-100">
                  <th className="text-left px-5 py-3">Fecha</th>
                  <th className="text-left px-4 py-3">Tipo</th>
                  <th className="text-left px-4 py-3">COD_INTERNO</th>
                  <th className="text-left px-4 py-3">Descripción</th>
                  <th className="text-center px-4 py-3">U/M</th>
                  <th className="text-right px-4 py-3">Cant. Salida</th>
                  <th className="text-left px-5 py-3">Referencia</th>
                </tr>
              </thead>
              <tbody>
                {salidas.map((s, i) => {
                  const badge = SOURCE_BADGE[s.fuente]
                  return (
                    <tr key={i} className="border-b border-gray-50 hover:bg-amber-50/40 transition-colors">
                      <td className="px-5 py-3 text-gray-500 text-xs whitespace-nowrap">{fmtFecha(s.fecha)}</td>
                      <td className="px-4 py-3">
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${badge.cls}`}>
                          {badge.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs font-semibold text-amber-700">{s.cod_interno}</span>
                      </td>
                      <td className="px-4 py-3 text-gray-700 max-w-[240px] truncate">{s.descripcion}</td>
                      <td className="px-4 py-3 text-center text-gray-500 text-xs">{s.u_m}</td>
                      <td className="px-4 py-3 text-right font-bold text-red-600">
                        -{fmtN(s.cantidad_salida)}
                      </td>
                      <td className="px-5 py-3 text-xs text-gray-400">
                        {s.ref_orden || s.observacion || (s.referencia_pedido ? `Pedido #${s.referencia_pedido}` : '—')}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Resumen por fuente */}
      {!loading && todos.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[
            {
              titulo: 'Corrugados',
              rows: corrugados,
              color: '#c8873a',
              bg: 'bg-orange-50',
              border: 'border-orange-100',
              icon: <Box size={14}/>,
            },
            {
              titulo: 'Materiales de Empaque',
              rows: empaques,
              color: '#3a6fa8',
              bg: 'bg-blue-50',
              border: 'border-blue-100',
              icon: <Package size={14}/>,
            },
          ].map((grupo, gi) => (
            <div key={gi} className={`rounded-xl border p-5 ${grupo.bg} ${grupo.border}`}>
              <div className="flex items-center gap-2 mb-3" style={{ color: grupo.color }}>
                {grupo.icon}
                <span className="text-xs font-semibold uppercase tracking-widest">{grupo.titulo}</span>
                <span className="ml-auto text-xs font-bold">{grupo.rows.length} SKUs</span>
              </div>
              <div className="space-y-2">
                {grupo.rows.map((r, i) => {
                  const total = grupo.rows.reduce((s, x) => s + x.total_disponible, 0)
                  const pct   = total > 0 ? (r.total_disponible / total * 100) : 0
                  return (
                    <div key={i}>
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-xs text-gray-600 truncate max-w-[60%]">{r.descripcion}</span>
                        <span className="text-xs font-bold text-gray-800 flex-shrink-0 ml-2">
                          {fmtN(r.total_disponible)}
                          <span className="text-gray-400 font-normal ml-1">{r.u_m}</span>
                        </span>
                      </div>
                      <div className="w-full h-1.5 bg-white/60 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{ width: pct + '%', background: grupo.color }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
