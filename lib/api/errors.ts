import { NextResponse } from 'next/server'

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    /** Safe message sent to the client — never include DB/internal details */
    public readonly userMessage = 'Request failed',
  ) {
    super(message)
    this.name = 'AppError'
  }
}

/**
 * Converts any thrown error into a safe JSON response.
 * Internal error details are logged server-side only and never exposed to the client.
 */
export function handleApiError(err: unknown): NextResponse {
  if (err instanceof AppError) {
    return NextResponse.json({ error: err.userMessage }, { status: err.statusCode })
  }
  console.error('[API Error]', err)
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
}
