import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

export async function GET() {
  const sidebarPath = path.join(process.cwd(), 'components', 'dashboard', 'Sidebar.tsx')
  let content = fs.readFileSync(sidebarPath, 'utf-8')
  
  const oldBlock = `  operaciones: [
    {
      section: 'Registros Sanitarios',
      items: [{ href: '/registros-sanitarios', icon: FileCheck, label: 'Registros Sanitarios' }],
    },
    {
      section: 'Logistica',
      items: [
        { href: '/logistica/corrugados', icon: Package,     label: 'Corrugados' },
        { href: '/logistica/empaque',    icon: ShoppingBag, label: 'Empaque'    },
      ],
    },
  ],`

  const hasLogistica = content.includes('Logistica')
  const hasOldOnly = content.includes("section: 'Registros Sanitarios'") && !hasLogistica

  if (hasOldOnly) {
    content = content.replace(
      `  operaciones: [
    {
      section: 'Registros Sanitarios',
      items: [{ href: '/registros-sanitarios', icon: FileCheck, label: 'Registros Sanitarios' }],
    },
  ],`,
      oldBlock
    )
    fs.writeFileSync(sidebarPath, content, 'utf-8')
    return NextResponse.json({ status: 'UPDATED', hasLogistica: true })
  }

  // Forzar recompilacion tocando el archivo
  const stat = fs.statSync(sidebarPath)
  fs.utimesSync(sidebarPath, new Date(), new Date())
  
  return NextResponse.json({ 
    status: hasLogistica ? 'ALREADY_HAS_LOGISTICA_TOUCHED' : 'NO_LOGISTICA',
    hasLogistica,
    size: stat.size
  })
}
