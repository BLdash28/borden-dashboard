import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file     = formData.get('file') as File
    const path     = formData.get('path') as string

    if (!file || !path) return NextResponse.json({ error: 'Archivo y ruta requeridos' }, { status: 400 })

    const buffer = Buffer.from(await file.arrayBuffer())
    const { error } = await supabaseAdmin.storage
      .from('registros-sanitarios')
      .upload(path, buffer, { contentType: 'application/pdf', upsert: true })

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    const { data: urlData } = supabaseAdmin.storage
      .from('registros-sanitarios')
      .getPublicUrl(path)

    return NextResponse.json({ url: urlData.publicUrl })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
