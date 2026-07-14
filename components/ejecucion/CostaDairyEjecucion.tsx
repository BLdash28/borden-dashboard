'use client'
import { useEffect, useState } from 'react'
import { RefreshCw, AlertTriangle } from 'lucide-react'
import {
  LineChart, Line, BarChart, Bar, ComposedChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Cell,
} from 'recharts'

const SECTIONS = [
  { key: 'resumen',     label: 'Resumen'         },
  { key: 'canales',     label: 'Por Canal'       },
  { key: 'clientes',    label: 'Top Clientes'    },
  { key: 'skus',        label: 'SKUs'            },
  { key: 'vendedores',  label: 'Vendedores'      },
  { key: 'inventario',  label: 'Inventario'      },
]

const fmtCRC = (v: number) => {
  if (!isFinite(v)) return '₡0'
  if (Math.abs(v) >= 1e9) return '₡' + (v/1e9).toFixed(2) + 'B'
  if (Math.abs(v) >= 1e6) return '₡' + (v/1e6).toFixed(1) + 'M'
  if (Math.abs(v) >= 1e3) return '₡' + (v/1e3).toFixed(0) + 'K'
  return '₡' + Math.round(v).toLocaleString('en-US')
}
const fmtCRCFull = (v: number) => '₡' + Math.round(v).toLocaleString('en-US')
const fmtUSD = (v: number) => '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtNum = (v: number) => Math.round(v).toLocaleString('en-US')

const CANAL_COLOR: Record<string, string> = {
  'SUPERMERCADO':  '#0d9488',
  'PULPERIA':      '#c8873a',
  'MINISUPER':     '#3b82f6',
  'OTROS':         '#94a3b8',
  'Tienda Tradicionales': '#a855f7',
  'CLIENTES NO ENRUTADOS': '#94a3b8',
}

type Kpi = {
  total_crc: number; total_usd: number; total_uds: number; total_bultos: number;
  n_clientes: number; n_canales: number; n_skus: number;
  ultima_fecha: string | null; primera_fecha: string | null;
  notas_credito: number;
}
type Canal    = { canal: string; crc: number; usd: number; uds: number; n_clientes: number }
type Subcanal = { canal: string; subcanal: string; crc: number; uds: number; n_clientes: number }
type Cliente  = { cod_cliente: string; nom_cliente: string; canal: string; zona: string; crc: number; uds: number; dias_compra: number }
type Vend     = { codvendedor: string; vendedor: string; crc: number; uds: number; n_clientes: number }
type Zona     = { zona: string; crc: number; uds: number; n_clientes: number }
type Monthly  = { mes: number; mes_nombre: string; crc: number; usd: number; uds: number }
type Sku      = {
  cod_articulo: string; des_articulo: string; sku: string | null; codigo_barras: string | null;
  categoria: string | null; subcategoria: string | null;
  uds: number; crc: number; usd: number; bultos: number; n_clientes: number; notas_credito: number;
  share_pct: number; cum_share: number;
}

export default function CostaDairyEjecucion() {
  const [section, setSection] = useState<typeof SECTIONS[number]['key']>('resumen')
  const [ano, setAno] = useState(2026)
  const [canalFilter, setCanalFilter] = useState('')

  const [kpi, setKpi]                 = useState<Kpi | null>(null)
  const [canales, setCanales]         = useState<Canal[]>([])
  const [subcanales, setSubcanales]   = useState<Subcanal[]>([])
  const [monthly, setMonthly]         = useState<Monthly[]>([])
  const [topClientes, setTopClientes] = useState<Cliente[]>([])
  const [vendedores, setVendedores]   = useState<Vend[]>([])
  const [zonas, setZonas]             = useState<Zona[]>([])
  const [skus, setSkus]               = useState<Sku[]>([])
  const [loading, setLoading]         = useState(false)

  const load = () => {
    setLoading(true)
    const p = new URLSearchParams({ ano: String(ano) })
    if (canalFilter) p.set('canal', canalFilter)
    Promise.all([
      fetch(`/api/comercial/ejecucion/cr/costa-dairy/kpis?${p}`).then(r => r.json()),
      fetch(`/api/comercial/ejecucion/cr/costa-dairy/skus?${p}`).then(r => r.json()),
    ]).then(([k, s]) => {
      setKpi(k.kpi); setCanales(k.por_canal ?? []); setSubcanales(k.por_subcanal ?? [])
      setMonthly(k.monthly ?? []); setTopClientes(k.top_clientes ?? [])
      setVendedores(k.por_vendedor ?? []); setZonas(k.por_zona ?? [])
      setSkus(s.skus ?? [])
    }).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [ano, canalFilter]) // eslint-disable-line

  const canalNombres = canales.map(c => c.canal).filter(Boolean)
  const enrichmentPending = skus.length > 0 && skus.every(s => !s.sku)

  return (
    <div className="flex flex-col min-h-full">
      {/* Header */}
      <div className="px-6 pt-6 pb-0 flex items-start justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-widest">Ejecución Costa Dairy</p>
          <h1 className="text-2xl font-bold text-gray-800">🇨🇷 Costa Dairy · Borden</h1>
          <p className="text-sm text-gray-400 mt-0.5">Distribuidor · Reventa a canales</p>
        </div>
        <button onClick={load}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 shadow-sm">
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''}/> Actualizar
        </button>
      </div>

      {/* Banner enrichment pending */}
      {enrichmentPending && (
        <div className="mx-6 mt-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 flex items-start gap-2">
          <AlertTriangle size={14} className="text-amber-700 mt-0.5 flex-shrink-0" />
          <div className="text-xs text-amber-800">
            <strong>Enrich pendiente:</strong> los SKUs aparecen con código interno Costa Dairy (GF...). Cuando llegue el catálogo oficial los mapeamos a SKU/categoría/subcategoría Borden.
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className="px-6 pt-4">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <div className="flex items-start gap-x-4 gap-y-3 flex-wrap text-xs">
            <div className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-widest text-gray-400">Año</span>
              <select value={ano} onChange={e => setAno(parseInt(e.target.value))}
                className="border border-gray-200 rounded-lg px-3 py-1.5 bg-white text-gray-700 h-[30px]">
                <option value={2026}>2026</option>
                <option value={2025}>2025</option>
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-widest text-gray-400">Canal</span>
              <div className="flex rounded-lg border border-gray-200 overflow-hidden flex-wrap">
                <button onClick={() => setCanalFilter('')}
                  className={`px-3 py-1.5 font-medium transition-colors ${canalFilter === '' ? 'bg-amber-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                  Todos
                </button>
                {canalNombres.map(c => (
                  <button key={c} onClick={() => setCanalFilter(c)}
                    className={`px-3 py-1.5 font-medium transition-colors ${canalFilter === c ? 'bg-amber-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                    {c}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Section nav */}
      <div className="px-6 pt-4">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="flex overflow-x-auto">
            {SECTIONS.map(s => (
              <button key={s.key} onClick={() => setSection(s.key)}
                className={`px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors flex-shrink-0
                  ${section === s.key
                    ? 'border-amber-500 text-amber-600 bg-amber-50/40'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}>
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Contenido */}
      <div className="px-6 py-6 flex-1">
        {loading || !kpi ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {Array(4).fill(0).map((_,i) => (
              <div key={i} className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 animate-pulse">
                <div className="h-3 bg-gray-100 rounded w-2/3 mb-3" />
                <div className="h-7 bg-gray-100 rounded w-1/2" />
              </div>
            ))}
          </div>
        ) : (
          <>
            {section === 'resumen' && <Resumen kpi={kpi} canales={canales} monthly={monthly} zonas={zonas} />}
            {section === 'canales' && <Canales canales={canales} subcanales={subcanales} totalCrc={kpi.total_crc} />}
            {section === 'clientes' && <Clientes clientes={topClientes} />}
            {section === 'skus' && <SkusTabla skus={skus} totalCrc={kpi.total_crc} />}
            {section === 'vendedores' && <Vendedores vendedores={vendedores} />}
            {section === 'inventario' && <InventarioPlaceholder />}
          </>
        )}
      </div>
    </div>
  )
}

function KpiCard({ label, value, sub, highlight }: { label: string; value: React.ReactNode; sub?: string; highlight?: boolean }) {
  return (
    <div className={`rounded-xl border shadow-sm p-4 ${highlight ? 'bg-amber-50 border-amber-200' : 'bg-white border-gray-100'}`}>
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest leading-tight mb-1">{label}</p>
      <p className={`text-xl font-bold ${highlight ? 'text-amber-700' : 'text-gray-800'}`}>{value}</p>
      {sub && <p className="text-[10px] text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}

function Resumen({ kpi, canales, monthly, zonas }: { kpi: Kpi; canales: Canal[]; monthly: Monthly[]; zonas: Zona[] }) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="Ventas CRC" value={fmtCRC(kpi.total_crc)} sub={fmtCRCFull(kpi.total_crc)} />
        <KpiCard label="Ventas USD" value={fmtUSD(kpi.total_usd)} sub="Estimado @ 510 CRC/USD" />
        <KpiCard label="Unidades" value={fmtNum(kpi.total_uds)} sub={`${fmtNum(kpi.total_bultos)} bultos`} />
        <KpiCard label="Clientes activos" value={String(kpi.n_clientes)} sub={`${kpi.n_canales} canales · ${kpi.n_skus} SKUs`} highlight />
      </div>

      {kpi.notas_credito > 0 && (
        <div className="bg-orange-50 border border-orange-200 rounded-xl px-4 py-2.5 text-xs text-orange-800">
          ⚠️ <strong>{kpi.notas_credito} notas de crédito</strong> (devoluciones) impactando el período.
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-[#1b3b5f] rounded-xl p-5 text-white">
          <p className="text-[10px] font-semibold text-blue-200 uppercase tracking-widest mb-2">📅 Período</p>
          <p className="text-lg font-bold">{kpi.primera_fecha} → {kpi.ultima_fecha}</p>
          <p className="text-xs text-blue-300 mt-1">Última carga del archivo de Costa Dairy</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Por Canal · Top 4</h3>
          <div className="space-y-2">
            {canales.slice(0, 4).map(c => {
              const pct = kpi.total_crc > 0 ? (c.crc / kpi.total_crc) * 100 : 0
              return (
                <div key={c.canal}>
                  <div className="flex justify-between text-xs mb-0.5">
                    <span className="font-semibold text-gray-700">{c.canal}</span>
                    <span className="text-gray-500">{fmtCRC(c.crc)} · {pct.toFixed(1)}%</span>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full" style={{ width: pct + '%', background: CANAL_COLOR[c.canal] ?? '#6b7280' }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {monthly.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <h3 className="text-sm font-semibold text-gray-700">Evolución Mensual {kpi.primera_fecha?.slice(0,4)}</h3>
            <div className="flex items-center gap-3 text-[11px]">
              <span className="flex items-center gap-1.5"><span className="w-3 h-2 rounded-sm bg-amber-500"/> Ventas CRC</span>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-blue-500 border border-blue-700"/> Unidades</span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={monthly} margin={{ top: 10, right: 12, left: 0, bottom: 0 }} barCategoryGap="20%">
              <defs>
                <linearGradient id="gradCDCRC" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#c8873a" stopOpacity={1}/>
                  <stop offset="100%" stopColor="#f59e0b" stopOpacity={0.85}/>
                </linearGradient>
                <linearGradient id="gradCDUds" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor="#2563eb" stopOpacity={0.35}/>
                  <stop offset="100%" stopColor="#2563eb" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="mes_nombre" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
              <YAxis yAxisId="crc" tickFormatter={fmtCRC}
                tick={{ fontSize: 10, fill: '#94a3b8' }} width={60} axisLine={false} tickLine={false} />
              <YAxis yAxisId="uds" orientation="right"
                tickFormatter={(v: any) => Number(v) >= 1000 ? (Number(v)/1000).toFixed(0)+'K' : String(Math.round(Number(v)))}
                tick={{ fontSize: 10, fill: '#2563eb' }} width={55} axisLine={false} tickLine={false} />
              <Tooltip
                formatter={(v: any, name: string) => name === 'Unidades' ? [fmtNum(v), name] : [fmtCRCFull(v), name]}
                cursor={{ fill: 'rgba(148,163,184,0.08)' }}
                contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
              />
              <Bar yAxisId="crc" dataKey="crc" name="Ventas CRC" fill="url(#gradCDCRC)" radius={[6,6,0,0]} maxBarSize={32} />
              <Area yAxisId="uds" type="monotone" dataKey="uds" name="Unidades"
                stroke="#2563eb" strokeWidth={2.5} fill="url(#gradCDUds)" dot={false}
                activeDot={{ r: 5, strokeWidth: 2, fill: '#fff', stroke: '#2563eb' }} connectNulls />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      {zonas.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Top {Math.min(zonas.length, 15)} Zonas</h3>
          <ResponsiveContainer width="100%" height={Math.max(zonas.length * 28, 200)}>
            <BarChart data={zonas} layout="vertical" margin={{ left: 8, right: 24 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f0f0f0" />
              <XAxis type="number" tickFormatter={fmtCRC} tick={{ fontSize: 10 }} />
              <YAxis type="category" dataKey="zona" tick={{ fontSize: 10 }} width={120} />
              <Tooltip formatter={(v: any) => fmtCRCFull(v)} />
              <Bar dataKey="crc" fill="#c8873a" radius={[0,3,3,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}

function Canales({ canales, subcanales, totalCrc }: { canales: Canal[]; subcanales: Subcanal[]; totalCrc: number }) {
  return (
    <div className="space-y-5">
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-50">
          <h3 className="text-sm font-semibold text-gray-700">Por Canal</h3>
        </div>
        <table className="w-full text-xs">
          <thead className="bg-gray-50 text-gray-500 uppercase text-[10px] tracking-wider">
            <tr>
              <th className="px-4 py-2 text-left">Canal</th>
              <th className="px-4 py-2 text-right">Ventas CRC</th>
              <th className="px-4 py-2 text-right">USD</th>
              <th className="px-4 py-2 text-right">Unidades</th>
              <th className="px-4 py-2 text-right">Share</th>
              <th className="px-4 py-2 text-right">Clientes</th>
            </tr>
          </thead>
          <tbody>
            {canales.map(c => {
              const pct = totalCrc > 0 ? (c.crc / totalCrc) * 100 : 0
              return (
                <tr key={c.canal} className="border-b border-gray-50">
                  <td className="px-4 py-2.5">
                    <span className="inline-flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full" style={{ background: CANAL_COLOR[c.canal] ?? '#6b7280' }} />
                      <span className="font-semibold text-gray-800">{c.canal}</span>
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right font-semibold text-gray-800 tabular-nums">{fmtCRCFull(c.crc)}</td>
                  <td className="px-4 py-2.5 text-right text-gray-600 tabular-nums">{fmtUSD(c.usd)}</td>
                  <td className="px-4 py-2.5 text-right text-gray-700 tabular-nums">{fmtNum(c.uds)}</td>
                  <td className="px-4 py-2.5 text-right text-gray-500">{pct.toFixed(1)}%</td>
                  <td className="px-4 py-2.5 text-right text-gray-600">{c.n_clientes}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-50">
          <h3 className="text-sm font-semibold text-gray-700">Por Subcanal</h3>
        </div>
        <table className="w-full text-xs">
          <thead className="bg-gray-50 text-gray-500 uppercase text-[10px] tracking-wider">
            <tr>
              <th className="px-4 py-2 text-left">Canal</th>
              <th className="px-4 py-2 text-left">Subcanal</th>
              <th className="px-4 py-2 text-right">Ventas CRC</th>
              <th className="px-4 py-2 text-right">Unidades</th>
              <th className="px-4 py-2 text-right">Clientes</th>
            </tr>
          </thead>
          <tbody>
            {subcanales.map((s, i) => (
              <tr key={i} className="border-b border-gray-50">
                <td className="px-4 py-2.5">
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold text-white"
                        style={{ background: CANAL_COLOR[s.canal] ?? '#6b7280' }}>{s.canal}</span>
                </td>
                <td className="px-4 py-2.5 text-gray-800">{s.subcanal}</td>
                <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-gray-800">{fmtCRCFull(s.crc)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-gray-700">{fmtNum(s.uds)}</td>
                <td className="px-4 py-2.5 text-right text-gray-600">{s.n_clientes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Clientes({ clientes }: { clientes: Cliente[] }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-50">
        <h3 className="text-sm font-semibold text-gray-700">Top 20 Clientes</h3>
        <p className="text-xs text-gray-400">Ordenados por venta CRC</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 text-gray-500 uppercase text-[10px] tracking-wider">
            <tr>
              <th className="px-3 py-2 text-left">#</th>
              <th className="px-3 py-2 text-left">Cliente</th>
              <th className="px-3 py-2 text-left">Canal</th>
              <th className="px-3 py-2 text-left">Zona</th>
              <th className="px-3 py-2 text-right">Ventas CRC</th>
              <th className="px-3 py-2 text-right">Unidades</th>
              <th className="px-3 py-2 text-right">Días compra</th>
            </tr>
          </thead>
          <tbody>
            {clientes.map((c, i) => (
              <tr key={c.cod_cliente} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                <td className="px-3 py-2 text-gray-400">{i + 1}</td>
                <td className="px-3 py-2 text-gray-800">
                  <span className="font-mono text-[10px] text-gray-400 mr-2">{c.cod_cliente}</span>
                  {c.nom_cliente}
                </td>
                <td className="px-3 py-2 text-gray-600">
                  {c.canal && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold text-white"
                          style={{ background: CANAL_COLOR[c.canal] ?? '#6b7280' }}>{c.canal}</span>
                  )}
                </td>
                <td className="px-3 py-2 text-gray-600 text-[11px]">{c.zona}</td>
                <td className="px-3 py-2 text-right tabular-nums font-semibold text-gray-800">{fmtCRCFull(c.crc)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-gray-700">{fmtNum(c.uds)}</td>
                <td className="px-3 py-2 text-right text-gray-500">{c.dias_compra}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function SkusTabla({ skus, totalCrc }: { skus: Sku[]; totalCrc: number }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-50">
        <h3 className="text-sm font-semibold text-gray-700">SKUs vendidos</h3>
        <p className="text-xs text-gray-400">Total: {fmtCRCFull(totalCrc)}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 text-gray-500 uppercase text-[10px] tracking-wider">
            <tr>
              <th className="px-3 py-2 text-left">Cód. CD</th>
              <th className="px-3 py-2 text-left">SKU Borden</th>
              <th className="px-3 py-2 text-left">Descripción</th>
              <th className="px-3 py-2 text-left">Categoría</th>
              <th className="px-3 py-2 text-right">Ventas CRC</th>
              <th className="px-3 py-2 text-right">Unidades</th>
              <th className="px-3 py-2 text-right">Bultos</th>
              <th className="px-3 py-2 text-right">Share</th>
              <th className="px-3 py-2 text-right">Acum.</th>
              <th className="px-3 py-2 text-right">N/C</th>
            </tr>
          </thead>
          <tbody>
            {skus.map((s, i) => (
              <tr key={s.cod_articulo} className={`${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'} ${s.crc < 0 ? 'opacity-60' : ''}`}>
                <td className="px-3 py-2 font-mono text-[11px] text-gray-700">{s.cod_articulo}</td>
                <td className="px-3 py-2 font-mono text-[11px] text-amber-700">{s.sku ?? <span className="text-gray-300">—</span>}</td>
                <td className="px-3 py-2 text-gray-800 max-w-[280px] truncate">{s.des_articulo}</td>
                <td className="px-3 py-2 text-gray-600 text-[11px]">{s.categoria ?? <span className="text-gray-300">—</span>}</td>
                <td className={`px-3 py-2 text-right tabular-nums font-semibold ${s.crc < 0 ? 'text-red-600' : 'text-gray-800'}`}>{fmtCRCFull(s.crc)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-gray-700">{fmtNum(s.uds)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-gray-600">{fmtNum(s.bultos)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-gray-500">{s.share_pct.toFixed(1)}%</td>
                <td className="px-3 py-2 text-right tabular-nums text-gray-400">{s.cum_share.toFixed(1)}%</td>
                <td className="px-3 py-2 text-right text-orange-600">{s.notas_credito > 0 ? s.notas_credito : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Vendedores({ vendedores }: { vendedores: Vend[] }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-50">
        <h3 className="text-sm font-semibold text-gray-700">Ventas por Vendedor</h3>
      </div>
      <table className="w-full text-xs">
        <thead className="bg-gray-50 text-gray-500 uppercase text-[10px] tracking-wider">
          <tr>
            <th className="px-4 py-2 text-left">Código</th>
            <th className="px-4 py-2 text-left">Vendedor</th>
            <th className="px-4 py-2 text-right">Ventas CRC</th>
            <th className="px-4 py-2 text-right">Unidades</th>
            <th className="px-4 py-2 text-right">Clientes atendidos</th>
          </tr>
        </thead>
        <tbody>
          {vendedores.map(v => (
            <tr key={v.codvendedor} className="border-b border-gray-50">
              <td className="px-4 py-2.5 font-mono text-[11px] text-gray-500">{v.codvendedor}</td>
              <td className="px-4 py-2.5 text-gray-800">{v.vendedor}</td>
              <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-gray-800">{fmtCRCFull(v.crc)}</td>
              <td className="px-4 py-2.5 text-right tabular-nums text-gray-700">{fmtNum(v.uds)}</td>
              <td className="px-4 py-2.5 text-right text-gray-600">{v.n_clientes}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function InventarioPlaceholder() {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-10 text-center">
      <p className="text-4xl mb-3">📦</p>
      <p className="text-base font-semibold text-gray-700 mb-1">Inventario con vencimientos</p>
      <p className="text-sm text-gray-400 max-w-md mx-auto">
        Sección lista para recibir el archivo semanal de inventario con fechas de vencimiento por lote.
        Cuando llegue, la tabla <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded">inventario_costa_dairy</code>
        {' '}empieza a poblarse y este panel mostrará stock × SKU, días para vencer y DOH.
      </p>
      <div className="mt-4 inline-flex items-center gap-2 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-full text-xs text-amber-700 font-medium">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" /> Esperando archivo de inventario
      </div>
    </div>
  )
}
