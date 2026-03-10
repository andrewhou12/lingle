import { NextResponse } from 'next/server'
import { fetchAccessToken } from 'hume'
import { withAuth } from '@/lib/api-helpers'

export const POST = withAuth(async () => {
  const apiKey = process.env.HUME_API_KEY
  const secretKey = process.env.HUME_SECRET_KEY
  const configId = process.env.HUME_CONFIG_ID

  if (!apiKey || !secretKey) {
    return NextResponse.json(
      { error: 'Hume API credentials not configured' },
      { status: 500 },
    )
  }

  const accessToken = await fetchAccessToken({
    apiKey,
    secretKey,
  })

  if (!accessToken) {
    return NextResponse.json(
      { error: 'Failed to generate Hume access token' },
      { status: 500 },
    )
  }

  return NextResponse.json({ accessToken, configId: configId || null })
})
