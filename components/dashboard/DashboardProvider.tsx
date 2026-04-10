'use client'
import { DashboardFiltersProvider } from '@/lib/context/DashboardFilters'
import ReactQueryProvider from '@/lib/providers/ReactQueryProvider'

export default function DashboardProvider({ children }: { children: React.ReactNode }) {
  return (
    <ReactQueryProvider>
      <DashboardFiltersProvider>{children}</DashboardFiltersProvider>
    </ReactQueryProvider>
  )
}
