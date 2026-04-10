'use client'
import { DollarSign, Package, Users, Globe2, ShoppingBag, X } from 'lucide-react'
import GlobalFilterBar from '@/components/dashboard/GlobalFilterBar'
import KpiCard from '@/components/analytics/KpiCard'
import DonutGrid from '@/components/analytics/DonutGrid'
import ProductsTable from '@/components/analytics/ProductsTable'
import MonthlyChart from '@/components/analytics/MonthlyChart'
import { useAnalyticsFilters } from '@/hooks/useAnalyticsFilters'
import { useKpis, useDonutData, useProducts, useMonthly } from '@/hooks/useAnalyticsQueries'
import { useAnalyticsStore } from '@/lib/store/filterStore'

function fmt(n: number) {
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(2) + 'M'
  if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K'
  return '$' + n.toFixed(0)
}

function fmtUnits(n: number) {
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M'
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K'
  return String(Math.round(n))
}

const FILTER_LABELS: Record<string, string> = {
  categoria:    'Categoría',
  pais:         'País',
  subcategoria: 'Subcategoría',
  cliente:      'Cliente',
}

export default function AnalyticsPage() {
  const params = useAnalyticsFilters()
  const { data: kpis,     isLoading: loadKpis    } = useKpis(params)
  const { data: donuts,   isLoading: loadDonuts  } = useDonutData(params)
  const { data: products, isLoading: loadProducts } = useProducts(params)
  const { data: monthly,  isLoading: loadMonthly  } = useMonthly(params)

  const { activeSegments, clearSegment, clearAll } = useAnalyticsStore()

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-auto">
      <GlobalFilterBar />

      <div className="flex-1 p-4 md:p-6 space-y-6">

        {/* Cross-filter chips */}
        {activeSegments.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] uppercase tracking-widest font-semibold"
              style={{ color: 'var(--t3)' }}>
              Filtros activos:
            </span>
            {activeSegments.map(seg => (
              <button
                key={seg.type}
                onClick={() => clearSegment(seg.type)}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold transition-colors"
                style={{ background: 'var(--acc)20', color: 'var(--acc)', border: '1px solid var(--acc)40' }}
              >
                <span style={{ color: 'var(--t3)', opacity: 0.7, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  {FILTER_LABELS[seg.type]}
                </span>
                <span>{seg.value}</span>
                <X size={10} />
              </button>
            ))}
            <button
              onClick={clearAll}
              className="text-[11px] transition-colors px-2 py-1 rounded-full"
              style={{ color: 'var(--t3)', opacity: 0.6 }}
            >
              Limpiar todo
            </button>
          </div>
        )}

        {/* KPI row */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          <KpiCard
            title="Ventas USD"
            value={kpis ? fmt(kpis.total_valor) : '—'}
            delta={kpis?.vs_prior?.total_valor_pct ?? null}
            icon={DollarSign}
            accent="#c8873a"
            loading={loadKpis}
          />
          <KpiCard
            title="Unidades"
            value={kpis ? fmtUnits(kpis.total_unidades) : '—'}
            delta={kpis?.vs_prior?.total_unidades_pct ?? null}
            icon={Package}
            accent="#3a6fa8"
            loading={loadKpis}
          />
          <KpiCard
            title="Ticket Promedio"
            value={kpis ? fmt(kpis.avg_ticket) : '—'}
            icon={ShoppingBag}
            accent="#2a7a58"
            loading={loadKpis}
          />
          <KpiCard
            title="Países"
            value={kpis ? String(kpis.n_paises) : '—'}
            icon={Globe2}
            accent="#6b4fa8"
            loading={loadKpis}
          />
          <KpiCard
            title="SKUs Activos"
            value={kpis ? String(kpis.n_skus) : '—'}
            sub={kpis ? `${kpis.dias_con_ventas} días con ventas` : undefined}
            icon={Package}
            accent="#c0402f"
            loading={loadKpis}
          />
          <KpiCard
            title="Clientes"
            value={kpis ? String(kpis.n_clientes) : '—'}
            icon={Users}
            accent="#2a8a8a"
            loading={loadKpis}
          />
        </div>

        {/* Donut grid (cross-filter) */}
        <DonutGrid data={donuts} loading={loadDonuts} />

        {/* Monthly chart + Products table */}
        <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
          <div className="xl:col-span-3">
            <MonthlyChart
              data={monthly?.monthly ?? []}
              loading={loadMonthly}
            />
          </div>
          <div className="xl:col-span-2">
            <ProductsTable
              products={products?.products ?? []}
              loading={loadProducts}
            />
          </div>
        </div>

      </div>
    </div>
  )
}
