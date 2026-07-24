/**
 * Instrumentación de queries para detectar cuellos de botella.
 *
 * Reemplazo funcional de p6spy (Java/JDBC) para node-pg:
 *   - Monkey-patch de pool.query para loguear duración + rows
 *   - Ring buffer en memoria con las últimas N queries lentas
 *   - Endpoint `/api/admin/slow-queries` expone el buffer para inspección
 *
 * Config por env:
 *   SQL_SPY=0                  → deshabilita todo (default: on)
 *   SQL_SPY_THRESHOLD_MS=200   → sólo loguea queries que tarden ≥ este umbral
 *   SQL_SPY_ALL=1              → loguea TODA query (útil en dev, no en prod)
 *   SQL_SPY_BUFFER=200         → tamaño del ring buffer (default 200)
 */
import type { Pool, QueryResult, QueryResultRow } from 'pg'

export type SlowQuery = {
  ts:       number      // Date.now()
  ms:       number
  rows:     number
  sql:      string      // truncada
  errored:  boolean
  err?:     string
}

const THRESHOLD    = parseInt(process.env.SQL_SPY_THRESHOLD_MS ?? '200')
const BUFFER_SIZE  = parseInt(process.env.SQL_SPY_BUFFER ?? '200')
const LOG_ALL      = process.env.SQL_SPY_ALL === '1'
const DISABLED     = process.env.SQL_SPY === '0'
const TRUNCATE_LEN = 400

// Buffer global — evita duplicación cuando Next dev bundle recarga el módulo
// desde múltiples routes (cada import crearía un buffer distinto y el endpoint
// admin veía sólo uno de ellos).
declare global {
  // eslint-disable-next-line no-var
  var _sqlSpyBuffer: SlowQuery[] | undefined
}
const buffer: SlowQuery[] = global._sqlSpyBuffer ?? (global._sqlSpyBuffer = [])

function pushSlow(entry: SlowQuery) {
  buffer.push(entry)
  if (buffer.length > BUFFER_SIZE) buffer.shift()
}

/** Devuelve una copia inmutable ordenada por más lentas primero. */
export function getSlowQueries(): SlowQuery[] {
  return [...buffer].sort((a, b) => b.ms - a.ms)
}

export function clearSlowQueries(): void {
  buffer.length = 0
}

function normalizeSql(raw: unknown): string {
  const s = typeof raw === 'string' ? raw : String(raw ?? '')
  // Colapsa whitespace para que quepa en una línea de log
  const oneLine = s.replace(/\s+/g, ' ').trim()
  return oneLine.length > TRUNCATE_LEN ? oneLine.slice(0, TRUNCATE_LEN) + '…' : oneLine
}

/**
 * Instala el spy sobre el pool. Idempotente — llamarlo varias veces no
 * duplica el patch (usa una flag en el pool).
 */
export function installQuerySpy(pool: Pool): void {
  if (DISABLED) return
  const p = pool as Pool & { __spyInstalled?: boolean; __originalQuery?: Pool['query'] }
  if (p.__spyInstalled) return
  p.__spyInstalled = true
  const original = pool.query.bind(pool) as Pool['query']
  p.__originalQuery = original

  // Firma tipada de pool.query es una unión de overloads. Envolvemos con any
  // internamente para no reimplementar todos los overloads uno por uno.
  const wrapped = function query(...args: unknown[]) {
    const t0  = Date.now()
    const sql = normalizeSql((args[0] as any)?.text ?? args[0])
    const p2  = (original as any).apply(pool, args) as Promise<QueryResult<QueryResultRow>>

    // Sólo instrumentamos la forma Promise. Callback form (raro en este repo) pasa como venía.
    if (!p2 || typeof (p2 as any).then !== 'function') return p2

    return p2.then(
      (res: QueryResult<QueryResultRow>) => {
        const ms = Date.now() - t0
        const rows = res?.rowCount ?? (Array.isArray(res?.rows) ? res.rows.length : 0)
        if (LOG_ALL || ms >= THRESHOLD) {
          // eslint-disable-next-line no-console
          console.log(`[sql] ms=${ms} rows=${rows} sql="${sql}"`)
        }
        if (ms >= THRESHOLD) {
          pushSlow({ ts: Date.now(), ms, rows, sql, errored: false })
        }
        return res
      },
      (err: unknown) => {
        const ms = Date.now() - t0
        const msg = err instanceof Error ? err.message : String(err)
        // eslint-disable-next-line no-console
        console.error(`[sql] ms=${ms} ERROR sql="${sql}" msg="${msg}"`)
        pushSlow({ ts: Date.now(), ms, rows: 0, sql, errored: true, err: msg })
        throw err
      },
    )
  }
  ;(pool as any).query = wrapped
}
