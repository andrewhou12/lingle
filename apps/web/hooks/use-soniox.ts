'use client'

import { useCallback, useRef, useState, useEffect } from 'react'
import type { EnrichedToken } from '@/lib/voice/turn-signals'

// Inline type declarations to avoid bundler resolving @soniox/client at build time.
// The actual module is dynamically imported in start().
interface Recording {
  state: string
  on: (event: string, handler: (...args: any[]) => void) => void
  stop: () => Promise<void>
  cancel: () => void
  pause: () => void
  resume: () => void
  finalize: () => void
}

type RecordingState = 'recording' | 'paused' | 'stopped' | 'error' | 'canceled'

interface RealtimeResult {
  tokens: { text: string; is_final: boolean; confidence?: number; start_ms?: number; end_ms?: number; language?: string }[]
}

export interface EnrichedUtterance {
  text: string
  tokens: EnrichedToken[]
}

/** @deprecated Use EnrichedUtterance instead */
export type RealtimeUtterance = EnrichedUtterance

export interface SonioxContext {
  general?: { key: string; value: string }[]
  terms?: string[]
  text?: string
}

export interface UseSonioxOptions {
  /** Enable endpoint detection for automatic turn-taking */
  endpointDetection?: boolean
  /** Max endpoint delay in ms (default: 1500) */
  maxEndpointDelayMs?: number
  /** ISO 639-1 language code for STT (default: 'ja') */
  languageCode?: string
  /** ISO 639-1 native language code — enables bilingual detection when set */
  nativeLanguageCode?: string
  /** Domain/vocabulary context to bias recognition */
  context?: SonioxContext
}

export interface UseSonioxReturn {
  /** Start the recording session */
  start: () => Promise<void>
  /** Stop the recording session gracefully */
  stop: () => Promise<void>
  /** Pause recording (e.g., during TTS playback) */
  pause: () => void
  /** Resume recording after pause */
  resume: () => void
  /** Force finalize current speech (for push-to-talk) */
  finalize: () => void
  /** Current partial (non-final) transcript text */
  partialText: string
  /** Whether Soniox is currently recording */
  isRecording: boolean
  /** Recording state */
  state: RecordingState | 'idle'
  /** Error if any */
  error: string | null
}

export function useSoniox(
  options: UseSonioxOptions,
  onUtterance: (utterance: EnrichedUtterance) => void,
  onEndpoint?: () => void,
): UseSonioxReturn {
  const {
    endpointDetection = false,
    maxEndpointDelayMs = 1500,
    languageCode = 'ja',
    nativeLanguageCode,
    context,
  } = options

  const [partialText, setPartialText] = useState('')
  const [isRecording, setIsRecording] = useState(false)
  const [state, setState] = useState<RecordingState | 'idle'>('idle')
  const [error, setError] = useState<string | null>(null)

  // Use `any` for client/recording refs since we dynamically import the classes
  const clientRef = useRef<any>(null)
  const recordingRef = useRef<Recording | null>(null)
  const utteranceBufferRef = useRef<any>(null)
  const tokenAccRef = useRef<EnrichedToken[]>([])
  const onUtteranceRef = useRef(onUtterance)
  const onEndpointRef = useRef(onEndpoint)
  onUtteranceRef.current = onUtterance
  onEndpointRef.current = onEndpoint

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      recordingRef.current?.cancel()
      recordingRef.current = null
      clientRef.current = null
    }
  }, [])

  const start = useCallback(async () => {
    setError(null)

    try {
      // Dynamic import to avoid SSR issues with browser-only APIs
      const {
        SonioxClient,
        BrowserPermissionResolver,
        MicrophoneSource,
        RealtimeUtteranceBuffer,
      } = await import('@soniox/client')

      // Create client if needed
      if (!clientRef.current) {
        clientRef.current = new SonioxClient({
          api_key: async () => {
            const res = await fetch('/api/voice/soniox-key', { method: 'POST' })
            if (!res.ok) {
              const body = await res.json().catch(() => ({}))
              throw new Error(body.error || `Failed to fetch Soniox API key (${res.status})`)
            }
            const data = await res.json()
            return data.api_key
          },
          permissions: new BrowserPermissionResolver(),
        })
      }

      // Create utterance buffer for accumulating tokens into utterances
      utteranceBufferRef.current = new RealtimeUtteranceBuffer()
      tokenAccRef.current = []

      // Bilingual mode: detect both target and native language
      const isBilingual = !!nativeLanguageCode && nativeLanguageCode !== languageCode
      const languageHints = isBilingual ? [languageCode, nativeLanguageCode] : [languageCode]

      const recordingConfig: Record<string, unknown> = {
        model: 'stt-rt-v4',
        language_hints: languageHints,
        language_hints_strict: !isBilingual,
        enable_endpoint_detection: endpointDetection,
        ...(endpointDetection ? { max_endpoint_delay_ms: maxEndpointDelayMs } : {}),
        ...(isBilingual ? { enable_language_identification: true } : {}),
        ...(context ? { context } : {}),
        source: new MicrophoneSource({
          constraints: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            channelCount: 1,
          },
        }),
      }

      console.log('[soniox] recording config:', {
        languageHints,
        strict: !isBilingual,
        bilingual: isBilingual,
        hasContext: !!context,
        contextTerms: context?.terms?.length ?? 0,
      })

      const recording = clientRef.current.realtime.record(recordingConfig)

      recordingRef.current = recording

      recording.on('state_change', ({ new_state }: { new_state: RecordingState }) => {
        setState(new_state)
        if (new_state === 'recording') {
          setIsRecording(true)
        } else if (new_state === 'stopped' || new_state === 'error' || new_state === 'canceled') {
          setIsRecording(false)
        }
      })

      recording.on('result', (result: RealtimeResult) => {
        const buf = utteranceBufferRef.current
        if (!buf) return

        // Feed result to utterance buffer
        buf.addResult(result)

        // Accumulate enriched tokens
        for (const token of result.tokens) {
          tokenAccRef.current.push({
            text: token.text,
            is_final: token.is_final,
            confidence: token.confidence ?? 1,
            start_ms: token.start_ms,
            end_ms: token.end_ms,
            language: token.language,
          })
        }

        // Update partial text from non-final tokens
        const nonFinal = result.tokens
          .filter((t) => !t.is_final)
          .map((t) => t.text)
          .join('')
        setPartialText(nonFinal)
      })

      const flushUtterance = () => {
        const buf = utteranceBufferRef.current
        if (!buf) return

        const utterance = buf.markEndpoint()
        if (utterance && utterance.text.trim()) {
          // Emit enriched utterance with accumulated tokens
          const enriched: EnrichedUtterance = {
            text: utterance.text,
            tokens: tokenAccRef.current,
          }
          console.log('[soniox] enriched utterance:', enriched.text, 'tokens:', enriched.tokens.length)
          setPartialText('')
          onUtteranceRef.current(enriched)
        }
        // Reset token accumulator for next utterance
        tokenAccRef.current = []
      }

      recording.on('endpoint', () => {
        flushUtterance()
        onEndpointRef.current?.()
      })

      recording.on('finalized', () => {
        flushUtterance()
      })

      recording.on('error', (err: Error) => {
        console.error('[soniox] recording error:', err)
        setError(err.message)
        setIsRecording(false)
      })
    } catch (err) {
      console.error('[soniox] start error:', err)
      setError(err instanceof Error ? err.message : 'Failed to start recording')
    }
  }, [endpointDetection, maxEndpointDelayMs, languageCode, nativeLanguageCode, context])

  const stop = useCallback(async () => {
    const recording = recordingRef.current
    if (!recording) return
    try {
      await recording.stop()
    } catch {
      // Ignore errors on stop
    }
    recordingRef.current = null
    utteranceBufferRef.current = null
    tokenAccRef.current = []
    setIsRecording(false)
    setPartialText('')
    setState('idle')
  }, [])

  const pause = useCallback(() => {
    const recording = recordingRef.current
    if (recording && recording.state === 'recording') {
      recording.pause()
    }
  }, [])

  const resume = useCallback(() => {
    const recording = recordingRef.current
    if (recording && recording.state === 'paused') {
      recording.resume()
    }
  }, [])

  const finalize = useCallback(() => {
    recordingRef.current?.finalize()
  }, [])

  return {
    start,
    stop,
    pause,
    resume,
    finalize,
    partialText,
    isRecording,
    state,
    error,
  }
}
