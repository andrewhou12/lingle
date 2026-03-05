import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/api-helpers'

export const POST = withAuth(async () => {
  const apiKey = process.env.SONIOX_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'Soniox API key not configured' }, { status: 500 })
  }

  // Return the API key for the browser SDK to use.
  // In production, this should generate a temporary/scoped key via Soniox's API.
  return NextResponse.json({ api_key: apiKey })
})
