import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { enviarAlerta } from '@/lib/alertas/enviarAlerta'

export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const { id } = await req.json()
    if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })

    const { data: alerta, error } = await supabase
      .from('config_alertas')
      .select('*')
      .eq('id', id)
      .single()

    if (error || !alerta) return NextResponse.json({ error: 'Alerta no encontrada' }, { status: 404 })

    const dests = (alerta.destinatarios as any[]) ?? []
    if (dests.length === 0) return NextResponse.json({ error: 'Sin destinatarios' }, { status: 400 })

    const result = await enviarAlerta({
      destinatarios: dests,
      nombre:  alerta.nombre,
      tipo:    alerta.tipo,
      mensaje: 'Este es un email de prueba del sistema de alertas.',
      detalle: `Tipo: ${alerta.tipo}\nCondición: ${JSON.stringify(alerta.condicion, null, 2)}`,
      isPrueba: true,
    })

    if (!result.ok) return NextResponse.json({ error: result.errors.join(', ') }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
