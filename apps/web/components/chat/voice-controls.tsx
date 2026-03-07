'use client'

import { useCallback } from 'react'
import { MicrophoneIcon, ArrowPathIcon } from '@heroicons/react/24/outline'
import { useVoice } from '@/hooks/use-voice'
import { useLanguage } from '@/hooks/use-language'
import { getSttCode } from '@/lib/languages'
import { cn } from '@/lib/utils'

interface VoiceControlsProps {
  onTranscript: (text: string) => void
  disabled?: boolean
}

export function VoiceControls({ onTranscript, disabled }: VoiceControlsProps) {
  const { targetLanguage } = useLanguage()
  const voice = useVoice({ languageCode: getSttCode(targetLanguage) })

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
        <ArrowPathIcon className="w-[13px] h-[13px] animate-spin" />
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
      <MicrophoneIcon className="w-[13px] h-[13px]" />
    </button>
  )
}
