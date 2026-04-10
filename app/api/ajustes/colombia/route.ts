import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { global: { fetch: (url, opts) => fetch(url, { ...opts, cache: 'no-store' }) } }
)

export async function GET() {
  const { data, error } = await supabase
    .from('ajustes_colombia')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json(data || [])
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { modulo, clave, descripcion, campo, valor_anterior, valor_nuevo, usuario } = body

  if (!modulo || !clave || !campo || valor_nuevo === undefined) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('ajustes_colombia')
    .insert({
      modulo,
      clave,
      descripcion: descripcion || clave,
      campo,
      valor_anterior: valor_anterior ?? null,
      valor_nuevo: Number(valor_nuevo),
      usuario: usuario || null,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json(data)
}
