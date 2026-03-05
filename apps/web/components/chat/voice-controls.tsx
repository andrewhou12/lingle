'use client'

import { useCallback } from 'react'
import { Mic, Loader2 } from 'lucide-react'
import { useVoice } from '@/hooks/use-voice'
import { cn } from '@/lib/utils'

interface VoiceControlsProps {
  onTranscript: (text: string) => void
  disabled?: boolean
}

export function VoiceControls({ onTranscript, disabled }: VoiceControlsProps) {
  const voice = useVoice()

  const handleClick = useCallback(async () => {
    if (disabled) return

    if (voice.isRecording) {
      const transcript = await voice.stopRecording()
      if (transcript) {
        onTranscript(transcript)
      }
    } else {
      await voice.startRecording()
    }
  }, [disabled, voice, onTranscript])

  if (voice.isTranscribing) {
    return (
      <button
        className="w-7 h-7 rounded-full border border-border bg-bg-pure flex items-center justify-center text-text-muted transition-colors"
        disabled
        title="Transcribing..."
      >
        <Loader2 size={13} className="animate-spin" />
      </button>
    )
  }

  return (
    <button
      className={cn(
        'w-7 h-7 rounded-full border flex items-center justify-center transition-colors',
        voice.isRecording
          ? 'border-red-500/30 bg-red-500/10 text-red-500 animate-pulse'
          : 'border-border bg-bg-pure text-text-muted hover:bg-bg-hover'
      )}
      onClick={handleClick}
      disabled={disabled}
      title={voice.isRecording ? 'Stop recording' : 'Start voice input'}
    >
      <Mic size={13} />
    </button>
  )
}
