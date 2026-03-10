import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/api-helpers'
import { parseMessage } from '@/lib/message-parser'
import { getRimeWs } from '@/lib/rime-ws'
import { parseCartesiaSSE } from '@/lib/cartesia-sse'

const RUBY_REGEX = /\{([^}|]+)\|[^}]+\}/g
const PAUSE_MARKER_REGEX = /<\d+>/g
const TTS_PROVIDER_DEFAULT = process.env.TTS_PROVIDER || 'cartesia'

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || 'urE3OJfJRxJuk9kAMN0Y'

const CARTESIA_API_KEY = process.env.CARTESIA_API_KEY

function getCartesiaVoice(langCode: string): string | undefined {
  return process.env[`CARTESIA_VOICE_${langCode.toUpperCase()}`]
}

export const POST = withAuth(async (request) => {
  const t0 = performance.now()
  const body = await request.json()
  const { text, speed, ttsProvider: ttsProviderParam, targetLanguage } = body
  const langCode = targetLanguage ? (targetLanguage === 'Mandarin Chinese' ? 'zh' : targetLanguage.toLowerCase().slice(0, 2)) : 'ja'
  const ttsProvider = ttsProviderParam === 'rime' || ttsProviderParam === 'elevenlabs' || ttsProviderParam === 'cartesia' ? ttsProviderParam : TTS_PROVIDER_DEFAULT
  if (!text || typeof text !== 'string') {
    return NextResponse.json({ error: 'text is required' }, { status: 400 })
  }

  // Extract only conversational text, skip cards and metadata
  const segments = parseMessage(text)
  const spoken = segments
    .filter((s) => s.type === 'text')
    .map((s) => s.content.trim())
    .filter(Boolean)
    .join(' ')
    .replace(RUBY_REGEX, '$1')
    .replace(PAUSE_MARKER_REGEX, '')

  if (!spoken) {
    return NextResponse.json({ error: 'no speakable text' }, { status: 400 })
  }

  try {
    if (ttsProvider === 'rime') {
      const rime = getRimeWs()
      const { readable } = rime.synthesizeStream(spoken, speed)

      return new Response(readable, {
        headers: {
          'Content-Type': 'audio/pcm',
          'X-Sample-Rate': '24000',
          'Cache-Control': 'no-cache',
        },
      })
    }

    if (ttsProvider === 'cartesia') {
      if (!CARTESIA_API_KEY) {
        return NextResponse.json({ error: 'CARTESIA_API_KEY not configured' }, { status: 500 })
      }
      const voiceId = getCartesiaVoice(langCode) || getCartesiaVoice('ja')
      if (!voiceId) {
        return NextResponse.json({ error: `No Cartesia voice configured for ${langCode}` }, { status: 500 })
      }

      const tFetch = performance.now()
      const response = await fetch('https://api.cartesia.ai/tts/sse', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cartesia-Version': '2024-06-10',
          'X-API-Key': CARTESIA_API_KEY,
        },
        body: JSON.stringify({
          model_id: 'sonic-multilingual',
          transcript: spoken,
          voice: { mode: 'id', id: voiceId },
          language: langCode,
          output_format: {
            container: 'raw',
            encoding: 'pcm_s16le',
            sample_rate: 24000,
          },
        }),
      })
      const ttfa = performance.now() - tFetch
      console.log(`[tts:timing] cartesia TTFA:${ttfa.toFixed(0)}ms total-from-request:${(performance.now() - t0).toFixed(0)}ms text:"${spoken.slice(0, 40)}"`)

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error')
        console.error('Cartesia TTS error:', response.status, errorText)
        return NextResponse.json({ error: 'TTS generation failed' }, { status: response.status })
      }

      const pcmStream = parseCartesiaSSE(response)

      return new Response(pcmStream, {
        headers: {
          'Content-Type': 'audio/pcm',
          'X-Sample-Rate': '24000',
          'Cache-Control': 'no-cache',
        },
      })
    }

    // ElevenLabs streaming — request PCM 24kHz so client PCMStreamPlayer works as-is
    if (!ELEVENLABS_API_KEY) {
      return NextResponse.json({ error: 'ELEVENLABS_API_KEY not configured' }, { status: 500 })
    }

    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}/stream?output_format=pcm_24000`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': ELEVENLABS_API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: spoken,
          model_id: 'eleven_v3',
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
            style: 0.0,
            use_speaker_boost: true,
          },
        }),
      },
    )

    if (!response.ok || !response.body) {
      const errorText = await response.text().catch(() => 'Unknown error')
      console.error('ElevenLabs streaming TTS error:', response.status, errorText)
      return NextResponse.json({ error: 'TTS generation failed' }, { status: response.status })
    }

    return new Response(response.body, {
      headers: {
        'Content-Type': 'audio/pcm',
        'X-Sample-Rate': '24000',
        'Cache-Control': 'no-cache',
      },
    })
  } catch (err) {
    console.error('Streaming TTS error:', err)
    return NextResponse.json(
      { error: 'Streaming TTS failed' },
      { status: 500 },
    )
  }
})
