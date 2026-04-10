// app/dashboard/operaciones/logistica/empaque/page.tsx
import { getUserRestrictions } from '@/lib/auth/restrictions'
import InvEmpaqueClient from './_client'

export default async function EmpaquePage() {
  const r = await getUserRestrictions()
  const isAdmin = r?.role === 'superadmin' || r?.role === 'admin'
  return <InvEmpaqueClient isAdmin={isAdmin} />
}
