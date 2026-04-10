import { createClient } from '@/lib/supabase/server'
import { AppError } from './errors'

/**
 * Asserts that a valid Supabase session exists for the current request.
 * Throws AppError(401) if the user is not authenticated.
 * Use at the top of every protected API route handler.
 */
export async function requireAuth() {
  try {
    const supabase = createClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) {
      throw new AppError(401, 'Not authenticated', 'Authentication required')
    }
    return user
  } catch (err) {
    if (err instanceof AppError) throw err
    console.error('[requireAuth error]', err)
    throw new AppError(401, 'Auth check failed', 'Authentication required')
  }
}
