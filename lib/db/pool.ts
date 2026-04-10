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
export const pool =
  global._pgPool ??
  (global._pgPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 15_000,
  }))
