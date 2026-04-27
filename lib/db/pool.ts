import { Pool } from 'pg'

declare global {
  // eslint-disable-next-line no-var
  var _pgPool: Pool | undefined
}

/**
 * Singleton pg.Pool — shared across all API routes.
 * The globalThis guard prevents duplicate pool instances
 * during Next.js hot-reloads in development.
 *
 * Supabase direct connection (port 5432).
 * Connection string from: Project Settings → Database → URI
 */
// Eliminar sslmode del URL para que pg use solo la opción ssl del Pool
// (pg v8 no combina bien sslmode=require con ssl:{rejectUnauthorized:false})
const connStr = (process.env.DATABASE_URL ?? '')
  .replace(/([?&])sslmode=[^&]*/g, '$1')
  .replace(/[?&]$/, '')

export const pool =
  global._pgPool ??
  (global._pgPool = new Pool({
    connectionString: connStr,
    ssl: { rejectUnauthorized: false },
    max: 15,
    idleTimeoutMillis: 20_000,
    connectionTimeoutMillis: 8_000,
    statement_timeout: 30_000,
  }))
