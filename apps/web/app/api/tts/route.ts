import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/api-helpers'
import { parseMessage } from '@/lib/message-parser'
import { getRimeWs } from '@/lib/rime-ws'

const RUBY_REGEX = /\{([^}|]+)\|[^}]+\}/g
const PAUSE_MARKER_REGEX = /<\d+>/g

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || 'urE3OJfJRxJuk9kAMN0Y'
const CARTESIA_API_KEY = process.env.CARTESIA_API_KEY
const TTS_PROVIDER_DEFAULT = process.env.TTS_PROVIDER || 'cartesia'

function getCartesiaVoice(langCode: string): string | undefined {
  return process.env[`CARTESIA_VOICE_${langCode.toUpperCase()}`]
}

export const POST = withAuth(async (request) => {
  const body = await request.json()
  const { text, voice: voiceParam, speed, ttsProvider: ttsProviderParam, targetLanguage } = body
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

  if (ttsProvider === 'rime') {
    return synthesizeWithRime(spoken, speed)
  }
  if (ttsProvider === 'cartesia') {
    return synthesizeWithCartesia(spoken, langCode)
  }
  return synthesizeWithElevenLabs(spoken, voiceParam)
})

async function synthesizeWithRime(text: string, speed?: number): Promise<Response> {
  const rime = getRimeWs()

  // Convert user speed (1.5x = faster) to Rime's speedAlpha (lower = faster)
  if (speed && speed !== 1.0) {
    rime.updateSpeed(1.0 / speed)
  }

  try {
    const audioBuffer = await rime.synthesize(text)
    const bytes = new Uint8Array(audioBuffer)
    return new Response(bytes, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': bytes.byteLength.toString(),
      },
    })
  } catch (err) {
    console.error('Rime TTS error:', err)
    return NextResponse.json(
      { error: 'TTS generation failed' },
      { status: 500 },
    )
  }
}

async function synthesizeWithCartesia(text: string, langCode: string): Promise<Response> {
  if (!CARTESIA_API_KEY) {
    return NextResponse.json({ error: 'CARTESIA_API_KEY not configured' }, { status: 500 })
  }
  const voiceId = getCartesiaVoice(langCode) || getCartesiaVoice('ja')
  if (!voiceId) {
    return NextResponse.json({ error: `No Cartesia voice configured for ${langCode}` }, { status: 500 })
  }

  const response = await fetch('https://api.cartesia.ai/tts/bytes', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cartesia-Version': '2024-06-10',
      'X-API-Key': CARTESIA_API_KEY,
    },
    body: JSON.stringify({
      model_id: 'sonic-multilingual',
      transcript: text,
      voice: {
        mode: 'id',
        id: voiceId,
        __experimental_controls: { speed: -0.1 },
      },
      language: langCode,
      output_format: {
        container: 'wav',
        encoding: 'pcm_s16le',
        sample_rate: 24000,
      },
    }),
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error')
    console.error('Cartesia TTS error:', response.status, errorText)
    return NextResponse.json({ error: 'TTS generation failed' }, { status: response.status })
  }

  return new Response(response.body, {
    headers: {
      'Content-Type': 'audio/wav',
    },
  })
}

async function synthesizeWithElevenLabs(text: string, voiceParam?: string): Promise<Response> {
  if (!ELEVENLABS_API_KEY) {
    return NextResponse.json({ error: 'ELEVENLABS_API_KEY not configured' }, { status: 500 })
  }

  const voiceId = voiceParam || ELEVENLABS_VOICE_ID

  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`,
    {
      method: 'POST',
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_v3',
        output_format: 'mp3_44100_128',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          style: 0.0,
          use_speaker_boost: true,
        },
      }),
    },
  )

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error')
    console.error('ElevenLabs TTS error:', response.status, errorText)
    return NextResponse.json(
      { error: 'TTS generation failed' },
      { status: response.status },
    )
  }

  return new Response(response.body, {
    headers: {
      'Content-Type': 'audio/mpeg',
      'Transfer-Encoding': 'chunked',
    },
  })
}
