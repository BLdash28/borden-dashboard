import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'

export const dynamic = 'force-dynamic'

export async function POST(_: NextRequest, { params }: { params: { id: string } }) {
  const start = Date.now()
  try {
    const { rows } = await pool.query('SELECT * FROM config_bots WHERE id = $1', [params.id])
    if (!rows.length) return NextResponse.json({ error: 'Bot no encontrado' }, { status: 404 })
    const bot = rows[0]

    if (!bot.activo) return NextResponse.json({ error: 'Bot inactivo' }, { status: 400 })

    const result = await ejecutarBot(bot)

    await pool.query(`
      UPDATE config_bots
      SET ultima_ejecucion = NOW(), ultimo_status = $1, ultimo_mensaje = $2, updated_at = NOW()
      WHERE id = $3
    `, [result.ok ? 'success' : 'error', result.mensaje, params.id])

    return NextResponse.json({ ok: result.ok, mensaje: result.mensaje, ms: Date.now() - start })
  } catch (err: any) {
    await pool.query(`
      UPDATE config_bots
      SET ultima_ejecucion = NOW(), ultimo_status = 'error', ultimo_mensaje = $1, updated_at = NOW()
      WHERE id = $2
    `, [err.message, params.id])
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

async function ejecutarBot(bot: any): Promise<{ ok: boolean; mensaje: string }> {
  if (bot.tipo === 'retaillik') {
    return ejecutarRetailLink(bot)
  }
  return ejecutarApiRest(bot)
}

async function ejecutarApiRest(bot: any): Promise<{ ok: boolean; mensaje: string }> {
  if (!bot.endpoint_url) return { ok: false, mensaje: 'endpoint_url no configurado' }

  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(bot.headers ?? {}) }
  if (bot.api_key) headers['Authorization'] = `Bearer ${bot.api_key}`

  const opts: RequestInit = { method: bot.metodo ?? 'GET', headers }
  if (bot.metodo === 'POST' && bot.body_template)
    opts.body = JSON.stringify(bot.body_template)

  const res = await fetch(bot.endpoint_url, opts)
  if (!res.ok) return { ok: false, mensaje: `HTTP ${res.status}: ${await res.text()}` }

  const data = await res.json()

  if (bot.tabla_destino && bot.mapeo_columnas) {
    const rows: any[] = Array.isArray(data) ? data : (data.data ?? data.rows ?? [data])
    const mapeo: Record<string, string> = bot.mapeo_columnas ?? {}
    const cols = Object.values(mapeo) as string[]
    const keys = Object.keys(mapeo)

    for (const row of rows.slice(0, 5000)) {
      const values = keys.map(k => row[k] ?? null)
      const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ')
      await pool.query(
        `INSERT INTO ${bot.tabla_destino} (${cols.join(', ')}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`,
        values
      )
    }
    return { ok: true, mensaje: `${rows.length} registros procesados en ${bot.tabla_destino}` }
  }

  return { ok: true, mensaje: 'Ejecutado sin tabla destino configurada' }
}

async function ejecutarRetailLink(bot: any): Promise<{ ok: boolean; mensaje: string }> {
  // RetailLink (Walmart) integration placeholder
  // Requires: RETAILLINK_USER, RETAILLINK_PASS env vars + endpoint config
  const user = process.env.RETAILLINK_USER
  const pass = process.env.RETAILLINK_PASS
  if (!user || !pass) return { ok: false, mensaje: 'RETAILLINK_USER / RETAILLINK_PASS no configurados' }
  if (!bot.endpoint_url)  return { ok: false, mensaje: 'endpoint_url de RetailLink no configurado' }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-RL-User': user,
    'X-RL-Key': bot.api_key ?? pass,
    ...(bot.headers ?? {}),
  }
  const res = await fetch(bot.endpoint_url, { method: bot.metodo ?? 'GET', headers })
  if (!res.ok) return { ok: false, mensaje: `RetailLink HTTP ${res.status}: ${await res.text()}` }

  return { ok: true, mensaje: 'RetailLink ejecutado correctamente' }
}
