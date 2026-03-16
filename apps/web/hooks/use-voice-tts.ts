'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { createSentenceBoundaryTracker } from '@/lib/voice/sentence-boundary'
import { stripRubyAnnotations } from '@/lib/ruby-annotator'
import { PCMStreamPlayer } from '@/lib/voice/pcm-stream-player'
import { getTtsProvider } from '@/lib/voice/voice-provider-config'

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
  /** Sentences that have been fully spoken */
  spokenSentences: string[]
  /** The sentence currently being played (null if idle) */
  currentSentence: string | null
  /** Progress (0-1) within the currently-playing sentence */
  currentProgress: number
  /** Pre-create AudioContext (call on session start to avoid first-play delay) */
  warmup: () => void
}

interface QueueItem {
  sentence: string
  streamPromise?: Promise<ReadableStream<Uint8Array> | null>
}

const SAMPLE_RATE = 24000

export function useVoiceTTS(
  onPlaybackStart?: () => void,
  onPlaybackEnd?: () => void,
): UseVoiceTTSReturn {
  const [isPlaying, setIsPlaying] = useState(false)
  const [isDone, setIsDone] = useState(true)
  const [speed, setSpeedState] = useState(1.0)
  const [spokenSentences, setSpokenSentences] = useState<string[]>([])
  const [currentSentence, setCurrentSentence] = useState<string | null>(null)
  const [currentProgress, setCurrentProgress] = useState(0)

  const trackerRef = useRef(createSentenceBoundaryTracker())
  const queueRef = useRef<QueueItem[]>([])
  const playingRef = useRef(false)
  const playerRef = useRef<PCMStreamPlayer | null>(null)
  const stoppedRef = useRef(false)
  const speedRef = useRef(1.0)
  const generationRef = useRef(0)
  const onPlaybackStartRef = useRef(onPlaybackStart)
  const onPlaybackEndRef = useRef(onPlaybackEnd)
  onPlaybackStartRef.current = onPlaybackStart
  onPlaybackEndRef.current = onPlaybackEnd
  const spokenSentencesRef = useRef<string[]>([])
  const progressAnimRef = useRef<number>(0)
  const abortRef = useRef<AbortController>(new AbortController())

  const getPlayer = useCallback((): PCMStreamPlayer => {
    if (!playerRef.current) {
      playerRef.current = new PCMStreamPlayer(SAMPLE_RATE)
    }
    return playerRef.current
  }, [])

  // Pre-create AudioContext on first user interaction to avoid 15-45ms delay on first play
  const warmedUpRef = useRef(false)
  const warmup = useCallback(() => {
    if (warmedUpRef.current) {
      console.log('[tts:opt] warmup already done')
      return
    }
    warmedUpRef.current = true
    console.log('[tts:opt] warming up AudioContext...')
    getPlayer().warmup()
  }, [getPlayer])

  const fetchStreamingAudio = useCallback(
    (sentence: string): Promise<ReadableStream<Uint8Array> | null> => {
      const t = performance.now()
      return fetch('/api/tts/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: sentence, speed: speedRef.current, ttsProvider: getTtsProvider() }),
        signal: abortRef.current.signal,
      })
        .then((res) => {
          console.log(`[tts:timing] fetch responded ${(performance.now() - t).toFixed(0)}ms ok:${res.ok} "${sentence.slice(0, 30)}"`)
          return res.ok && res.body ? res.body : null
        })
        .catch(() => null)
    },
    [],
  )

  const progressIntervalRef = useRef<ReturnType<typeof setInterval>>(0 as unknown as ReturnType<typeof setInterval>)

  const stopProgressTracking = useCallback(() => {
    if (progressAnimRef.current) {
      cancelAnimationFrame(progressAnimRef.current)
      progressAnimRef.current = 0
    }
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current)
      progressIntervalRef.current = 0 as unknown as ReturnType<typeof setInterval>
    }
  }, [])
  const startProgressTracking = useCallback(() => {
    stopProgressTracking()
    // 10Hz is plenty smooth for a progress bar — avoids 60Hz React re-renders
    progressIntervalRef.current = setInterval(() => {
      const player = playerRef.current
      if (player && player.isPlaying) {
        setCurrentProgress(player.progress)
      }
    }, 100)
  }, [stopProgressTracking])

  const cleanup = useCallback(() => {
    generationRef.current += 1
    stoppedRef.current = true
    playingRef.current = false
    setIsPlaying(false)
    stopProgressTracking()

    // Abort in-flight fetches
    abortRef.current.abort()

    // Interrupt PCM player
    if (playerRef.current) {
      playerRef.current.interrupt()
    }

    queueRef.current = []
  }, [stopProgressTracking])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup()
      playerRef.current?.dispose()
    }
  }, [cleanup])

  // Pre-fetch the next queued sentence that doesn't have a streamPromise yet
  const prefetchNext = useCallback(() => {
    const next = queueRef.current.find((item) => !item.streamPromise)
    if (next) {
      next.streamPromise = fetchStreamingAudio(next.sentence)
    }
  }, [fetchStreamingAudio])

  const playNext = useCallback(async () => {
    const gen = generationRef.current

    if (stoppedRef.current || !playingRef.current) {
      playingRef.current = false
      setIsPlaying(false)
      setIsDone(true)
      setCurrentSentence(null)
      stopProgressTracking()
      onPlaybackEndRef.current?.()
      return
    }

    const item = queueRef.current.shift()
    if (!item) {
      playingRef.current = false
      setIsPlaying(false)
      setIsDone(true)
      setCurrentSentence(null)
      stopProgressTracking()
      onPlaybackEndRef.current?.()
      return
    }

    try {
      const tPlay = performance.now()
      // Fetch this sentence's stream (use pre-fetched if available, otherwise fetch now)
      const stream = item.streamPromise
        ? await item.streamPromise
        : await fetchStreamingAudio(item.sentence)

      console.log(`[tts:timing] stream ready ${(performance.now() - tPlay).toFixed(0)}ms "${item.sentence.slice(0, 30)}"`)

      if (gen !== generationRef.current) return
      if (!stream) {
        // Skip failed fetches — still mark sentence as spoken
        console.log(`[tts:timing] SKIP (no stream) "${item.sentence.slice(0, 30)}"`)
        spokenSentencesRef.current = [...spokenSentencesRef.current, item.sentence]
        setSpokenSentences(spokenSentencesRef.current)
        playNext()
        return
      }

      // Pre-fetch the next sentence while this one plays (max 1 in-flight)
      prefetchNext()

      const player = getPlayer()
      player.playbackRate = speedRef.current

      // Track current sentence
      setCurrentSentence(item.sentence)
      setCurrentProgress(0)
      startProgressTracking()

      console.log(`[tts:timing] PLAY START +${(performance.now() - tPlay).toFixed(0)}ms "${item.sentence.slice(0, 30)}"`)
      // Play streams PCM chunks progressively — resolves when all audio finishes
      await player.play(stream)

      if (gen === generationRef.current) {
        console.log(`[tts:timing] PLAY END ${(performance.now() - tPlay).toFixed(0)}ms "${item.sentence.slice(0, 30)}"`)
        stopProgressTracking()
        // Mark sentence as fully spoken
        spokenSentencesRef.current = [...spokenSentencesRef.current, item.sentence]
        setSpokenSentences(spokenSentencesRef.current)
        setCurrentProgress(1)
        setCurrentSentence(null)
        playNext()
      }
    } catch {
      if (gen === generationRef.current) {
        playingRef.current = false
        setIsPlaying(false)
        setIsDone(true)
        setCurrentSentence(null)
        stopProgressTracking()
        onPlaybackEndRef.current?.()
      }
    }
  }, [getPlayer, fetchStreamingAudio, prefetchNext, startProgressTracking, stopProgressTracking])

  const enqueueSentence = useCallback(
    (sentence: string) => {
      if (stoppedRef.current) return
      const clean = stripRubyAnnotations(sentence)
      if (!clean.trim() || /^[。！？.!?\s…─—、,]+$/.test(clean.trim())) return

      const isFirst = !playingRef.current
      console.log(`[tts:timing] enqueue sentence isFirst:${isFirst} queue:${queueRef.current.length} "${clean.slice(0, 30)}"`)
      // Only pre-fetch if this is the first sentence (need lowest latency) or nothing is playing
      queueRef.current.push({
        sentence: clean,
        streamPromise: isFirst ? fetchStreamingAudio(clean) : undefined,
      })

      if (isFirst) {
        playingRef.current = true
        setIsPlaying(true)
        setIsDone(false)
        onPlaybackStartRef.current?.()
        playNext()
      }
    },
    [playNext, fetchStreamingAudio],
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
    // Fire-and-forget: cancel any in-flight server-side synthesis
    fetch('/api/tts/interrupt', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ttsProvider: getTtsProvider() }) }).catch(() => {})
    cleanup()
  }, [cleanup])

  const reset = useCallback(() => {
    cleanup()
    trackerRef.current = createSentenceBoundaryTracker()
    // Enable eager clause-level flushing for first sentence of each turn
    trackerRef.current.setEagerMode(true)
    stoppedRef.current = false
    abortRef.current = new AbortController()
    spokenSentencesRef.current = []
    setSpokenSentences([])
    setCurrentSentence(null)
    setCurrentProgress(0)
    setIsDone(true)
  }, [cleanup])

  const setSpeed = useCallback((s: number) => {
    const clamped = Math.max(0.25, Math.min(4.0, s))
    speedRef.current = clamped
    setSpeedState(clamped)
    // Apply to currently playing audio immediately
    if (playerRef.current) {
      playerRef.current.playbackRate = clamped
    }
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
    spokenSentences,
    currentSentence,
    currentProgress,
    warmup,
  }
}
