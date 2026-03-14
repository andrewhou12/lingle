'use client'

import { useState, useCallback, useRef } from 'react'
import { getTtsProvider } from '@/lib/voice/voice-provider-config'
import { useLanguage } from './use-language'

export function useTTS() {
  const { targetLanguage } = useLanguage()
  const [playingId, setPlayingId] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const blobUrlRef = useRef<string | null>(null)

  const cleanup = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current)
      blobUrlRef.current = null
    }
    setPlayingId(null)
  }, [])

  const play = useCallback(async (id: string, text: string) => {
    cleanup()
    setPlayingId(id)

    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, ttsProvider: getTtsProvider(), targetLanguage }),
      })

      if (!res.ok) {
        console.error('TTS request failed:', res.status)
        setPlayingId(null)
        return
      }

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      blobUrlRef.current = url

      const audio = new Audio(url)
      audioRef.current = audio
      audio.onended = cleanup
      audio.onerror = () => {
        console.error('Audio playback error')
        cleanup()
      }

      await audio.play()
    } catch (err) {
      console.error('TTS error:', err)
      cleanup()
    }
  }, [cleanup, targetLanguage])

  const stop = useCallback(() => {
    cleanup()
  }, [cleanup])

  return { play, stop, playingId }
}
