'use client'

import { useMemo, useCallback, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { useLiveKitVoice } from '@/hooks/use-livekit-voice'
import { LiveKitBridge } from './livekit-bridge'
import { VoiceAuraOrb } from './voice-aura-orb'
import { toAgentState } from './voice-aura-orb'
import { LingleControlBar } from './lingle-control-bar'
import { LingleChatTranscript, type LingleTranscriptEntry } from './lingle-chat-transcript'
import { VoiceLiveSubtitles } from './voice-live-subtitles'
import { Whiteboard } from './whiteboard'
import { DevToolsPanel } from './dev-tools-panel'
import { cn } from '@/lib/utils'

const TEST_PROMPTS: Record<string, string> = {
  Japanese:
    'You are a friendly Japanese conversation partner. Have a casual chat in Japanese. ' +
    'Keep your responses short and natural. Use simple Japanese appropriate for an intermediate learner. ' +
    'Start by greeting the user in Japanese.',
  English:
    'You are a friendly English conversation partner. Have a casual chat in English. ' +
    'Keep your responses short and natural. Start by greeting the user.',
}

const STATE_LABELS: Record<string, string> = {
  IDLE: 'Ready',
  LISTENING: 'Listening...',
  THINKING: 'Thinking...',
  SPEAKING: 'Speaking...',
}

export function VoiceTestView() {
  const [lang, setLang] = useState<'Japanese' | 'English'>('Japanese')
  const [isChatOpen, setIsChatOpen] = useState(false)
  const [joined, setJoined] = useState(false)

  const voice = useLiveKitVoice({})

  const handleJoin = useCallback(async () => {
    try { new AudioContext().resume() } catch {}
    new Audio().play().catch(() => {})
    setJoined(true)
    await voice.startDirect({
      sessionMode: 'conversation',
      basePrompt: TEST_PROMPTS[lang],
      targetLanguage: lang,
    })
  }, [voice, lang])

  const switchLanguage = useCallback(async (newLang: 'Japanese' | 'English') => {
    setLang(newLang)
    await voice.endSession()
    await new Promise((r) => setTimeout(r, 1000))
    await voice.startDirect({
      sessionMode: 'conversation',
      basePrompt: TEST_PROMPTS[newLang],
      targetLanguage: newLang,
    })
  }, [voice])

  const handleEnd = useCallback(async () => {
    await voice.endSession()
    setJoined(false)
  }, [voice])

  // Map transcript for the chat panel
  const transcriptEntries: LingleTranscriptEntry[] = useMemo(() => {
    return voice.transcript.map((line) => ({
      ...line,
      formattedTime: new Date(line.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    }))
  }, [voice.transcript])

  // Latest lines for subtitles
  const lastUserLine = useMemo(() => {
    for (let i = voice.transcript.length - 1; i >= 0; i--) {
      if (voice.transcript[i].role === 'user' && voice.transcript[i].isFinal) return voice.transcript[i]
    }
    return null
  }, [voice.transcript])

  const lastAiLine = useMemo(() => {
    for (let i = voice.transcript.length - 1; i >= 0; i--) {
      if (voice.transcript[i].role === 'assistant') return voice.transcript[i]
    }
    return null
  }, [voice.transcript])

  return (
    <div className="fixed inset-0 bg-bg flex flex-col items-center justify-between z-50">
      <DevToolsPanel
        sessionId={voice.sessionId}
        voiceState={voice.voiceState}
        duration={voice.duration}
        isActive={voice.isActive}
        transcript={voice.transcript}
      />
      <Whiteboard
        isOpen={voice.whiteboard.isOpen}
        onClose={() => voice.whiteboard.setIsOpen(false)}
        content={voice.whiteboard.content}
      />
      {voice.connectedRoom && (
        <LiveKitBridge
          room={voice.connectedRoom}
          onAgentState={voice.handleAgentStateChange}
          onAgentIdentity={voice.handleAgentIdentity}
        />
      )}
      {/* Top bar */}
      <div className="w-full flex items-center justify-between px-6 py-4">
        <div className="text-[13px] text-text-secondary font-medium">
          Voice Test
        </div>
        <div className="flex items-center gap-3">
          {/* Language toggle */}
          <div className="flex items-center rounded-full border border-border bg-bg-pure p-0.5">
            {(['Japanese', 'English'] as const).map((l) => (
              <button
                key={l}
                onClick={() => lang !== l && switchLanguage(l)}
                className={cn(
                  'px-3 py-1 rounded-full text-[12px] font-medium transition-colors cursor-pointer',
                  lang === l
                    ? 'bg-accent-brand text-white'
                    : 'text-text-muted hover:text-text-primary',
                )}
              >
                {l === 'Japanese' ? 'JP' : 'EN'}
              </button>
            ))}
          </div>
          <span className="text-[12px] text-text-muted tabular-nums">
            {formatDuration(voice.duration)}
          </span>
        </div>
      </div>

      {/* Center: Orb + state + subtitles */}
      <div className="flex-1 flex flex-col items-center justify-center gap-6">
        <div className="w-[200px] h-[200px]">
          <VoiceAuraOrb voiceState={voice.voiceState} room={voice.room} className="w-[200px] h-[200px]" />
        </div>

        <div className="text-[14px] text-text-secondary h-5">
          {STATE_LABELS[voice.voiceState] || ''}
        </div>

        {/* Live subtitles under the orb (always visible) */}
        <VoiceLiveSubtitles
          partialText={voice.partialText}
          userLine={lastUserLine}
          aiLine={lastAiLine}
          correction={null}
          visible
          voiceState={voice.voiceState}
          isTalking={voice.isTalking}
        />
      </div>

      {/* Transcript panel — slides up from bottom when chat is open */}
      <AnimatePresence>
        {isChatOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 280, opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="w-full max-w-lg mx-auto px-4 overflow-hidden shrink-0"
          >
            <div className="h-[280px] rounded-xl border border-border bg-bg-pure overflow-hidden">
              <LingleChatTranscript
                agentState={toAgentState(voice.voiceState)}
                entries={transcriptEntries}
                className="h-full"
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bottom: agents-ui control bar */}
      <div className="flex flex-col items-center gap-3 px-6 pb-8 pt-3 w-full max-w-md shrink-0">
        {voice.error && (
          <div className="text-[13px] text-red-500">{voice.error}</div>
        )}

        <LingleControlBar
          variant="livekit"
          voiceState={voice.voiceState}
          isMuted={voice.isMuted}
          onToggleMute={voice.toggleMute}
          onJoin={!joined ? handleJoin : undefined}
          onEnd={handleEnd}
          isConnected={joined && voice.isActive}
          isChatOpen={isChatOpen}
          onToggleChat={() => setIsChatOpen((v) => !v)}
          onSendText={voice.sendTextMessage}
          inputMode={voice.inputMode}
        />
      </div>
    </div>
  )
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}
