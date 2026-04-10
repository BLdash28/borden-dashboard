import React from 'react'
import { createClient } from '@/lib/supabase/server'
import Sidebar from '@/components/layout/Sidebar'
import Topbar from '@/components/layout/Topbar'
import DashboardProvider from '@/components/dashboard/DashboardProvider'
import MfaBanner from '@/components/auth/MfaBanner'

export const dynamic = 'force-dynamic'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: profile } = user
    ? await supabase.from('profiles').select('*').eq('id', user.id).single()
    : { data: null }

  return (
    <div className="min-h-screen flex" style={{ background: 'var(--bg)' }}>
      <Sidebar profile={profile} />
      <div className="flex-1 lg:ml-[260px] flex flex-col min-h-screen min-w-0">
        <Topbar profile={profile} />
        <MfaBanner />
        <DashboardProvider>
          <main className="flex-1 p-4 md:p-6">
            {children}
          </main>
        </DashboardProvider>
      </div>
    </div>
  )
}
