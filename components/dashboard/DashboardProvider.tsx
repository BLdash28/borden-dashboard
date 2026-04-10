'use client'
import { DashboardFiltersProvider } from '@/lib/context/DashboardFilters'
import ReactQueryProvider from '@/lib/providers/ReactQueryProvider'
import { ToastProvider } from '@/components/ui/Toast'

export default function DashboardProvider({ children }: { children: React.ReactNode }) {
  return (
    <ReactQueryProvider>
      <DashboardFiltersProvider>
        <ToastProvider>
          {children}
        </ToastProvider>
      </DashboardFiltersProvider>
    </ReactQueryProvider>
  )
}
