'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { createSentenceBoundaryTracker } from '@/lib/voice/sentence-boundary'
import { stripRubyAnnotations } from '@/lib/ruby-annotator'

export interface UseVoiceTTSReturn {
  /** Feed streaming LLM text — extracts complete sentences and queues them for TTS */
  feedText: (fullText: string) => void
  /** Flush any remaining text when LLM stream ends */
  flushText: (fullText: string) => void
  /** Stop all audio immediately (interrupt) */
  interrupt: () => void
  /** Whether TTS is currently playing */
  isPlaying: boolean
  /** Whether all queued audio has been played and LLM is done */
  isDone: boolean
  /** Reset for a new turn */
  reset: () => void
  /** Set playback speed (0.25 - 4.0) */
  setSpeed: (speed: number) => void
  /** Current playback speed */
  speed: number
}

interface QueueItem {
  sentence: string
  audioPromise: Promise<Blob | null>
}

export function useVoiceTTS(
  onPlaybackStart?: () => void,
  onPlaybackEnd?: () => void,
): UseVoiceTTSReturn {
  const [isPlaying, setIsPlaying] = useState(false)
  const [isDone, setIsDone] = useState(true)
  const [speed, setSpeedState] = useState(1.0)

  const trackerRef = useRef(createSentenceBoundaryTracker())
  const queueRef = useRef<QueueItem[]>([])
  const playingRef = useRef(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const blobUrlsRef = useRef<string[]>([])
  const stoppedRef = useRef(false)
  const speedRef = useRef(1.0)
  const generationRef = useRef(0)
  const onPlaybackStartRef = useRef(onPlaybackStart)
  const onPlaybackEndRef = useRef(onPlaybackEnd)
  onPlaybackStartRef.current = onPlaybackStart
  onPlaybackEndRef.current = onPlaybackEnd

  const fetchAudio = useCallback((sentence: string, speed: number): Promise<Blob | null> => {
    return fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: sentence, speed }),
    })
      .then((res) => (res.ok ? res.blob() : null))
      .catch(() => null)
  }, [])

  const cleanup = useCallback(() => {
    generationRef.current += 1
    stoppedRef.current = true
    playingRef.current = false
    setIsPlaying(false)
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }
    for (const url of blobUrlsRef.current) {
      URL.revokeObjectURL(url)
    }
    blobUrlsRef.current = []
    queueRef.current = []
  }, [])

  // Cleanup on unmount
  useEffect(() => cleanup, [cleanup])

  const playNext = useCallback(async () => {
    const gen = generationRef.current

    if (stoppedRef.current || !playingRef.current) {
      playingRef.current = false
      setIsPlaying(false)
      setIsDone(true)
      onPlaybackEndRef.current?.()
      return
    }

    const item = queueRef.current.shift()
    if (!item) {
      playingRef.current = false
      setIsPlaying(false)
      setIsDone(true)
      onPlaybackEndRef.current?.()
      return
    }

    try {
      // Audio was prefetched when the sentence was enqueued — just await the result
      const blob = await item.audioPromise

      if (gen !== generationRef.current) return
      if (!blob) {
        // Skip failed fetches, try next
        playNext()
        return
      }

      const url = URL.createObjectURL(blob)
      blobUrlsRef.current.push(url)

      const audio = new Audio(url)
      audioRef.current = audio

      await new Promise<void>((resolve) => {
        audio.onended = () => resolve()
        audio.onerror = () => resolve()
        audio.play().catch(() => resolve())
      })

      if (gen === generationRef.current) {
        playNext()
      }
    } catch {
      if (gen === generationRef.current) {
        playingRef.current = false
        setIsPlaying(false)
        setIsDone(true)
        onPlaybackEndRef.current?.()
      }
    }
  }, [])

  const enqueueSentence = useCallback(
    (sentence: string) => {
      if (stoppedRef.current) return
      const clean = stripRubyAnnotations(sentence)
      if (!clean.trim()) return

      // Start fetching audio immediately — don't wait for previous playback to finish
      const audioPromise = fetchAudio(clean, speedRef.current)
      queueRef.current.push({ sentence: clean, audioPromise })

      if (!playingRef.current) {
        playingRef.current = true
        setIsPlaying(true)
        setIsDone(false)
        onPlaybackStartRef.current?.()
        playNext()
      }
    },
    [playNext, fetchAudio],
  )

  const feedText = useCallback(
    (fullText: string) => {
      const sentences = trackerRef.current.feed(fullText)
      for (const s of sentences) {
        enqueueSentence(s)
      }
    },
    [enqueueSentence],
  )

  const flushText = useCallback(
    (fullText: string) => {
      const sentences = trackerRef.current.feed(fullText)
      for (const s of sentences) {
        enqueueSentence(s)
      }
      const remaining = trackerRef.current.flush(fullText)
      if (remaining) {
        enqueueSentence(remaining)
      }
    },
    [enqueueSentence],
  )

  const interrupt = useCallback(() => {
    cleanup()
  }, [cleanup])

  const reset = useCallback(() => {
    cleanup()
    trackerRef.current = createSentenceBoundaryTracker()
    stoppedRef.current = false
    setIsDone(true)
  }, [cleanup])

  const setSpeed = useCallback((s: number) => {
    const clamped = Math.max(0.25, Math.min(4.0, s))
    speedRef.current = clamped
    setSpeedState(clamped)
  }, [])

  return {
    feedText,
    flushText,
    interrupt,
    isPlaying,
    isDone,
    reset,
    setSpeed,
    speed,
  }
}
