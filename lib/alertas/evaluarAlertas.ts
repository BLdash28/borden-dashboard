import { createClient } from '@supabase/supabase-js'
import { pool } from '@/lib/db/pool'
import { enviarAlerta } from './enviarAlerta'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function evaluarUmbralMetrica(condicion: any): Promise<{ disparar: boolean; mensaje: string; detalle: string }> {
  const { metrica, operador, valor, filtros = {} } = condicion
  const conds: string[] = ['venta_neta > 0']
  const params: unknown[] = []
  let idx = 1

  if (filtros.pais)      { conds.push(`pais = $${idx++}`);            params.push(filtros.pais) }
  if (filtros.cliente)   { conds.push(`cliente_nombre = $${idx++}`);  params.push(filtros.cliente) }
  if (filtros.categoria) { conds.push(`categoria = $${idx++}`);       params.push(filtros.categoria) }

  const where = 'WHERE ' + conds.join(' AND ')
  const mes   = new Date().getMonth() + 1
  const ano   = new Date().getFullYear()

  conds.push(`ano = $${idx++}`, `mes = $${idx++}`)
  params.push(ano, mes)

  let col = 'SUM(venta_neta)'
  if (metrica === 'proyectado') {
    // suma de proyecciones del periodo
    const pR = await pool.query(
      `SELECT COALESCE(SUM(valor_proyectado), 0) AS v FROM proyecciones_ventas WHERE ${conds.join(' AND ')}`,
      params
    ).catch(() => ({ rows: [{ v: 0 }] }))
    const v = parseFloat(pR.rows[0]?.v ?? 0)
    const disparar = evalOp(v, operador, valor)
    return {
      disparar,
      mensaje:  `Proyectado ${formatUSD(v)} ${operador} ${formatUSD(valor)}`,
      detalle: `Métrica: ${metrica} | Valor actual: ${formatUSD(v)} | Umbral: ${formatUSD(valor)}`,
    }
  }

  const r = await pool.query(
    `SELECT COALESCE(${col}, 0) AS v FROM fact_sales_sellin WHERE ${conds.join(' AND ')}`,
    params
  ).catch(() => ({ rows: [{ v: 0 }] }))

  const v = parseFloat(r.rows[0]?.v ?? 0)
  const disparar = evalOp(v, operador, valor)
  return {
    disparar,
    mensaje: `Venta neta ${formatUSD(v)} ${operador} umbral ${formatUSD(valor)}`,
    detalle: `Métrica: ${metrica} | Valor actual: ${formatUSD(v)} | Umbral: ${formatUSD(valor)}\nFiltros: ${JSON.stringify(filtros)}`,
  }
}

async function evaluarVariacionAnormal(condicion: any): Promise<{ disparar: boolean; mensaje: string; detalle: string }> {
  const { metrica, variacion_porcentaje, direccion, periodo_comparacion } = condicion
  const hoy   = new Date()
  const mes   = hoy.getMonth() + 1
  const ano   = hoy.getFullYear()

  let mesPrev = mes, anoPrev = ano
  if (periodo_comparacion === 'vs_mes_anterior') {
    mesPrev = mes === 1 ? 12 : mes - 1
    anoPrev = mes === 1 ? ano - 1 : ano
  } else {
    anoPrev = ano - 1
  }

  const q = `SELECT COALESCE(SUM(venta_neta), 0) AS v FROM fact_sales_sellin WHERE ano = $1 AND mes = $2`
  const [rAct, rPrev] = await Promise.all([
    pool.query(q, [ano, mes]),
    pool.query(q, [anoPrev, mesPrev]),
  ])

  const vAct  = parseFloat(rAct.rows[0]?.v  ?? 0)
  const vPrev = parseFloat(rPrev.rows[0]?.v ?? 0)
  const pct   = vPrev > 0 ? ((vAct - vPrev) / vPrev) * 100 : 0

  const disparar =
    direccion === 'ambas'  ? Math.abs(pct) >= variacion_porcentaje :
    direccion === 'caida'  ? pct <= -variacion_porcentaje :
                             pct >= variacion_porcentaje

  return {
    disparar,
    mensaje: `Variación ${pct.toFixed(1)}% ${pct >= 0 ? '▲' : '▼'} vs período anterior (umbral: ${variacion_porcentaje}%)`,
    detalle: `Actual: ${formatUSD(vAct)} | Anterior: ${formatUSD(vPrev)} | Variación: ${pct.toFixed(2)}%`,
  }
}

async function evaluarBotSinSincronizar(condicion: any): Promise<{ disparar: boolean; mensaje: string; detalle: string }> {
  const { bot_id, horas_sin_sincronizar } = condicion
  const { data: bot } = await supabase
    .from('config_bots')
    .select('nombre, ultima_ejecucion, ultimo_status')
    .eq('id', bot_id)
    .single()

  if (!bot) return { disparar: false, mensaje: 'Bot no encontrado', detalle: '' }

  const ultima = bot.ultima_ejecucion ? new Date(bot.ultima_ejecucion) : null
  const horasTranscurridas = ultima
    ? (Date.now() - ultima.getTime()) / (1000 * 60 * 60)
    : Infinity

  const disparar = horasTranscurridas >= horas_sin_sincronizar
  return {
    disparar,
    mensaje:  `Bot "${bot.nombre}" sin sincronizar por ${horasTranscurridas === Infinity ? '∞' : horasTranscurridas.toFixed(1)} hrs (límite: ${horas_sin_sincronizar} hrs)`,
    detalle: `Última ejecución: ${ultima?.toLocaleString('es-GT') ?? 'Nunca'} | Status: ${bot.ultimo_status ?? '—'}`,
  }
}

async function evaluarRegistroSanitario(condicion: any): Promise<{ disparar: boolean; mensaje: string; detalle: string }> {
  const { dias_antes_vencimiento } = condicion
  const { data: registros } = await supabase
    .from('registros_sanitarios')
    .select('nombre_producto, pais, empresa, numero_registro, fecha_vencimiento')
    .lte('fecha_vencimiento', new Date(Date.now() + dias_antes_vencimiento * 86400000).toISOString().slice(0, 10))
    .order('fecha_vencimiento', { ascending: true })

  const items = registros ?? []
  if (items.length === 0) return { disparar: false, mensaje: '', detalle: '' }

  const filas = items.map(r => {
    const dias = Math.ceil((new Date(r.fecha_vencimiento).getTime() - Date.now()) / 86400000)
    return `• [${r.pais}] ${r.nombre_producto} (${r.numero_registro}) — ${dias < 0 ? `venció hace ${Math.abs(dias)} días` : `vence en ${dias} días`} (${r.fecha_vencimiento})`
  }).join('\n')

  return {
    disparar: true,
    mensaje:  `${items.length} registro(s) sanitario(s) vencen en ≤${dias_antes_vencimiento} días`,
    detalle:  filas,
  }
}

function evalOp(v: number, op: string, umbral: number): boolean {
  if (op === '<')  return v < umbral
  if (op === '>')  return v > umbral
  if (op === '<=') return v <= umbral
  if (op === '>=') return v >= umbral
  return false
}

function formatUSD(v: number): string {
  return '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export async function evaluarAlertas(): Promise<{ procesadas: number; disparadas: number; errores: string[] }> {
  const { data: alertas, error } = await supabase
    .from('config_alertas')
    .select('*')
    .eq('activo', true)

  if (error) return { procesadas: 0, disparadas: 0, errores: [error.message] }

  let disparadas = 0
  const errores: string[] = []

  for (const alerta of alertas ?? []) {
    try {
      let resultado: { disparar: boolean; mensaje: string; detalle: string }

      switch (alerta.tipo) {
        case 'umbral_metrica':      resultado = await evaluarUmbralMetrica(alerta.condicion);      break
        case 'variacion_anormal':   resultado = await evaluarVariacionAnormal(alerta.condicion);   break
        case 'bot_sin_sincronizar': resultado = await evaluarBotSinSincronizar(alerta.condicion);  break
        case 'registro_sanitario':  resultado = await evaluarRegistroSanitario(alerta.condicion);  break
        default: continue
      }

      if (resultado.disparar) {
        const dests = (alerta.destinatarios as any[]) ?? []
        await enviarAlerta({
          destinatarios: dests,
          nombre:  alerta.nombre,
          tipo:    alerta.tipo,
          mensaje: resultado.mensaje,
          detalle: resultado.detalle,
        })
        disparadas++
      }

      await supabase.from('config_alertas').update({
        ultima_ejecucion: new Date().toISOString(),
        ultimo_status:    resultado.disparar ? 'disparada' : 'ok',
        ultimo_mensaje:   resultado.mensaje || 'Sin alertas',
        updated_at:       new Date().toISOString(),
      }).eq('id', alerta.id)
    } catch (e: any) {
      errores.push(`Alerta ${alerta.id} (${alerta.nombre}): ${e.message}`)
      await supabase.from('config_alertas').update({
        ultima_ejecucion: new Date().toISOString(),
        ultimo_status:    'error',
        ultimo_mensaje:   e.message,
        updated_at:       new Date().toISOString(),
      }).eq('id', alerta.id)
    }
  }

  return { procesadas: (alertas ?? []).length, disparadas, errores }
}
