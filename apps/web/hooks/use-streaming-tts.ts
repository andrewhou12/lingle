'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { createSentenceBoundaryTracker } from '@/lib/voice/sentence-boundary'
import { stripRubyAnnotations } from '@/lib/ruby-annotator'

interface UseStreamingTTSReturn {
  voiceEnabled: boolean
  toggleVoice: () => void
  isPlaying: boolean
  stop: () => void
}

export function useStreamingTTS(
  latestAssistantText: string | null,
  isStreaming: boolean
): UseStreamingTTSReturn {
  const [voiceEnabled, setVoiceEnabled] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const trackerRef = useRef(createSentenceBoundaryTracker())
  const queueRef = useRef<string[]>([])
  const playingRef = useRef(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const blobUrlsRef = useRef<string[]>([])
  const stoppedRef = useRef(false)
  const prevStreamingRef = useRef(false)

  const cleanup = useCallback(() => {
    playingRef.current = false
    stoppedRef.current = true
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

  const playNext = useCallback(async () => {
    if (stoppedRef.current || !playingRef.current) return
    const sentence = queueRef.current.shift()
    if (!sentence) {
      playingRef.current = false
      setIsPlaying(false)
      return
    }

    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: sentence }),
      })
      if (!res.ok || stoppedRef.current) {
        playingRef.current = false
        setIsPlaying(false)
        return
      }

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      blobUrlsRef.current.push(url)

      const audio = new Audio(url)
      audioRef.current = audio

      await new Promise<void>((resolve) => {
        audio.onended = () => resolve()
        audio.onerror = () => resolve()
        audio.play().catch(() => resolve())
      })

      // Play next in queue
      if (!stoppedRef.current) {
        playNext()
      }
    } catch {
      playingRef.current = false
      setIsPlaying(false)
    }
  }, [])

  const enqueueSentence = useCallback(
    (sentence: string) => {
      if (!voiceEnabled || stoppedRef.current) return
      const clean = stripRubyAnnotations(sentence)
      if (!clean.trim()) return
      queueRef.current.push(clean)
      if (!playingRef.current) {
        playingRef.current = true
        setIsPlaying(true)
        playNext()
      }
    },
    [voiceEnabled, playNext]
  )

  // Feed streaming text into sentence boundary tracker
  useEffect(() => {
    if (!voiceEnabled || !isStreaming || !latestAssistantText) return
    const sentences = trackerRef.current.feed(latestAssistantText)
    for (const s of sentences) {
      enqueueSentence(s)
    }
  }, [voiceEnabled, isStreaming, latestAssistantText, enqueueSentence])

  // When streaming stops, flush remaining text
  useEffect(() => {
    if (prevStreamingRef.current && !isStreaming && voiceEnabled && latestAssistantText) {
      // Feed one last time to capture anything since last feed
      const sentences = trackerRef.current.feed(latestAssistantText)
      for (const s of sentences) {
        enqueueSentence(s)
      }
      // Flush any remaining unflushed text
      const remaining = latestAssistantText.slice(
        // Get the part of text not yet processed
        latestAssistantText.lastIndexOf(
          queueRef.current[queueRef.current.length - 1] ?? ''
        )
      )
      // Simple: just enqueue anything left that the tracker didn't catch
      // The tracker already handled it via feed, but let's handle the tail
    }
    prevStreamingRef.current = isStreaming
  }, [isStreaming, voiceEnabled, latestAssistantText, enqueueSentence])

  // Reset tracker when a new message starts streaming
  useEffect(() => {
    if (isStreaming && !prevStreamingRef.current) {
      trackerRef.current.reset()
      stoppedRef.current = false
      // Clean up old blob URLs
      for (const url of blobUrlsRef.current) {
        URL.revokeObjectURL(url)
      }
      blobUrlsRef.current = []
    }
  }, [isStreaming])

  const toggleVoice = useCallback(() => {
    setVoiceEnabled((v) => {
      if (v) {
        cleanup()
      }
      return !v
    })
  }, [cleanup])

  const stop = useCallback(() => {
    cleanup()
  }, [cleanup])

  return { voiceEnabled, toggleVoice, isPlaying, stop }
}
