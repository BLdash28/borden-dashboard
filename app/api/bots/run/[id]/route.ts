import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'

export const dynamic = 'force-dynamic'

const GITHUB_OWNER    = 'BLdash28'
const GITHUB_REPO     = 'BotBorden'
const WORKFLOW_MAP: Record<string, string> = {
  retaillik:          'inventario_diario.yml',
  retaillik_sellout:  'sellout_semanal.yml',
}

export async function POST(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { rows } = await pool.query('SELECT * FROM config_bots WHERE id = $1', [params.id])
    if (!rows.length) return NextResponse.json({ error: 'Bot no encontrado' }, { status: 404 })
    const bot = rows[0]
    if (!bot.activo) return NextResponse.json({ error: 'Bot inactivo' }, { status: 400 })

    const result = bot.tipo === 'retaillik' || bot.tipo === 'retaillik_sellout'
      ? await dispararGitHubWorkflow(bot)
      : await ejecutarApiRest(bot)

    await pool.query(`
      UPDATE config_bots
      SET ultima_ejecucion = NOW(), ultimo_status = $1, ultimo_mensaje = $2, updated_at = NOW()
      WHERE id = $3
    `, [result.ok ? 'running' : 'error', result.mensaje, params.id])

    return NextResponse.json({ ok: result.ok, mensaje: result.mensaje })
  } catch (err: any) {
    await pool.query(`
      UPDATE config_bots
      SET ultima_ejecucion = NOW(), ultimo_status = 'error', ultimo_mensaje = $1, updated_at = NOW()
      WHERE id = $2
    `, [err.message, params.id])
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

async function dispararGitHubWorkflow(bot: any): Promise<{ ok: boolean; mensaje: string }> {
  const token    = process.env.GITHUB_BOT_TOKEN
  if (!token)    return { ok: false, mensaje: 'GITHUB_BOT_TOKEN no configurado en Vercel' }

  const workflow = WORKFLOW_MAP[bot.tipo]
  if (!workflow) return { ok: false, mensaje: `Sin workflow para tipo: ${bot.tipo}` }

  // Construir inputs del workflow según el tipo de bot
  const inputs: Record<string, string> = {}
  if (bot.job_id) {
    inputs.job_id_dvtas = bot.job_id
  }

  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/workflows/${workflow}/dispatches`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept':        'application/vnd.github+json',
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({ ref: 'main', inputs }),
  })

  if (!res.ok) {
    const txt = await res.text()
    return { ok: false, mensaje: `GitHub API error ${res.status}: ${txt}` }
  }

  return { ok: true, mensaje: `Workflow ${workflow} disparado — revisa GitHub Actions para el progreso` }
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
