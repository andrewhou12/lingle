'use client'

import { useState, useCallback, useRef } from 'react'

interface UseVoiceReturn {
  isRecording: boolean
  isTranscribing: boolean
  error: string | null
  startRecording: () => Promise<void>
  stopRecording: () => Promise<string | null>
}

export function useVoice(): UseVoiceReturn {
  const [isRecording, setIsRecording] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const resolveRef = useRef<((transcript: string | null) => void) | null>(null)

  const startRecording = useCallback(async () => {
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : 'audio/webm',
      })
      mediaRecorderRef.current = mediaRecorder
      chunksRef.current = []

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data)
        }
      }

      mediaRecorder.onstop = async () => {
        // Stop all tracks to release mic
        stream.getTracks().forEach((t) => t.stop())

        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        chunksRef.current = []

        if (blob.size === 0) {
          resolveRef.current?.(null)
          return
        }

        setIsTranscribing(true)
        try {
          const formData = new FormData()
          formData.append('audio', blob)
          const res = await fetch('/api/voice/stt', { method: 'POST', body: formData })
          if (!res.ok) {
            setError('Transcription failed')
            resolveRef.current?.(null)
            return
          }
          const { text } = await res.json()
          resolveRef.current?.(text || null)
        } catch (err) {
          console.error('STT error:', err)
          setError('Transcription failed')
          resolveRef.current?.(null)
        } finally {
          setIsTranscribing(false)
        }
      }

      mediaRecorder.start(250) // collect in 250ms chunks
      setIsRecording(true)
    } catch (err) {
      console.error('Mic access error:', err)
      setError('Microphone access denied')
    }
  }, [])

  const stopRecording = useCallback((): Promise<string | null> => {
    return new Promise((resolve) => {
      resolveRef.current = resolve
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        setIsRecording(false)
        mediaRecorderRef.current.stop()
      } else {
        resolve(null)
      }
    })
  }, [])

  return { isRecording, isTranscribing, error, startRecording, stopRecording }
}
