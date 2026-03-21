'use client'

import { useState, useCallback, useMemo, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { LiveKitBridge } from './livekit-bridge'
import { AIOrb, voiceStateToOrbState, toAgentState } from './ai-orb'
import { SessionHeader } from './session-header'
import { PillControlBar, useMicLevel } from './pill-control-bar'
import { NotesPanel } from './notes-panel'
import { SettingsPanel } from './settings-panel'
import { SessionWhiteboard } from './session-whiteboard'
import { SessionToast } from './session-toast'
import { VoiceLiveSubtitles } from './voice-live-subtitles'
import { LingleChatTranscript, type LingleTranscriptEntry } from './lingle-chat-transcript'
import type { useLiveKitVoice } from '@/hooks/use-livekit-voice'

interface VoiceSessionLayoutProps {
  voice: ReturnType<typeof useLiveKitVoice>
  onEnd: () => void
  isConnected: boolean
  sessionTitle?: string
  headerLeft?: ReactNode
  showDevTools?: boolean
  devToolsSlot?: ReactNode
}

export function VoiceSessionLayout({
  voice,
  onEnd,
  isConnected,
  sessionTitle = 'Conversation',
  devToolsSlot,
}: VoiceSessionLayoutProps) {
  const [viewMode, setViewMode] = useState<'call' | 'lesson'>('call')
  const [showTranscript, setShowTranscript] = useState(false)
  const [showNotes, setShowNotes] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [notes, setNotes] = useState('')
  const [isCamOff, setIsCamOff] = useState(false)
  const [transitioning, setTransitioning] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  const inLesson = viewMode === 'lesson'
  const orbState = voiceStateToOrbState(voice.voiceState)
  const micLevel = useMicLevel(voice.connectedRoom)

  // Toggle lesson mode with transition
  const toggleLesson = useCallback(() => {
    setTransitioning(true)
    setTimeout(() => {
      setViewMode((m) => (m === 'call' ? 'lesson' : 'call'))
      setTransitioning(false)
    }, 180)
  }, [])

  const showToast = useCallback((msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 1800)
  }, [])

  const handleEnd = useCallback(() => {
    showToast('Session ended')
    onEnd()
  }, [onEnd, showToast])

  // Transcript entries for chat panel
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
    <div className="fixed inset-0 bg-bg-pure font-sans overflow-hidden flex flex-col">
      {/* Transition flash */}
      <div
        className="fixed inset-0 z-[9998] bg-bg-pure pointer-events-none transition-opacity duration-[180ms]"
        style={{ opacity: transitioning ? 0.7 : 0 }}
      />

      {/* LiveKit bridge */}
      {voice.connectedRoom && (
        <LiveKitBridge
          room={voice.connectedRoom}
          onAgentState={voice.handleAgentStateChange}
          onAgentIdentity={voice.handleAgentIdentity}
        />
      )}

      {/* DevTools slot */}
      {devToolsSlot}

      {/* Header */}
      <SessionHeader
        isLessonMode={inLesson}
        lessonTitle={sessionTitle}
        elapsed={voice.duration}
      />

      {/* Main area */}
      <main className="flex-1 mt-12 relative min-h-0">
        {/* Call mode */}
        <div
          className="absolute inset-0 flex flex-col items-center justify-center transition-opacity duration-[350ms]"
          style={{
            opacity: inLesson ? 0 : 1,
            pointerEvents: inLesson ? 'none' : 'all',
          }}
        >
          <AIOrb state={orbState} size={260} />

          {showTranscript && (
            <div
              className="mt-7 max-w-[440px] w-[88%] text-center"
              style={{ animation: 'session-fade-up 0.25s ease both' }}
            >
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
          )}

          {/* Chat transcript panel */}
          <AnimatePresence>
            {showTranscript && transcriptEntries.length > 0 && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 240, opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.25, ease: 'easeOut' }}
                className="w-full max-w-lg mx-auto px-4 overflow-hidden shrink-0 mt-4"
              >
                <div className="h-[240px] rounded-xl border border-border bg-bg-pure overflow-hidden">
                  <LingleChatTranscript
                    agentState={toAgentState(voice.voiceState)}
                    entries={transcriptEntries}
                    className="h-full"
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Lesson / whiteboard mode */}
        <div
          className="absolute inset-0 flex transition-opacity duration-[400ms]"
          style={{
            opacity: inLesson ? 1 : 0,
            pointerEvents: inLesson ? 'all' : 'none',
          }}
        >
          <SessionWhiteboard agentContent={voice.whiteboard.content} />
        </div>

        {/* Mini orb — lesson mode, bottom-right */}
        <div
          className="fixed bottom-[84px] z-[600] flex flex-col items-center gap-1.5 transition-all duration-[400ms]"
          style={{
            right: showNotes ? 344 : 24,
            opacity: inLesson ? 1 : 0,
            pointerEvents: inLesson ? 'all' : 'none',
            transform: inLesson ? 'scale(1) translateY(0)' : 'scale(0.8) translateY(8px)',
          }}
        >
          {showTranscript && lastAiLine && (
            <div
              className="max-w-[220px] px-3.5 py-2.5 bg-bg-pure border border-border rounded-[10px_10px_2px_10px] text-[13px] leading-[1.65] text-text-secondary shadow-sm"
              style={{ animation: 'session-slide-right 0.2s ease both' }}
            >
              <p className="m-0 mb-0.5 text-[10px] font-mono text-text-muted uppercase tracking-wider">
                Tutor
              </p>
              {lastAiLine.text.length > 80 ? lastAiLine.text.slice(0, 80) + '…' : lastAiLine.text}
            </div>
          )}
          <AIOrb state={orbState} size={56} mini />
          <span className="text-[10px] font-mono text-text-muted tracking-wider">Tutor</span>
        </div>
      </main>

      {/* Notes panel */}
      <NotesPanel
        isOpen={showNotes}
        onClose={() => setShowNotes(false)}
        notes={notes}
        onChange={setNotes}
        sessionTitle={sessionTitle}
      />

      {/* Settings panel */}
      <SettingsPanel
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        showTranscript={showTranscript}
        onTranscriptChange={setShowTranscript}
      />

      {/* Error display */}
      {voice.error && (
        <div className="fixed bottom-[76px] left-1/2 -translate-x-1/2 z-[500] text-[13px] text-red">
          {voice.error}
        </div>
      )}

      {/* Control bar */}
      <PillControlBar
        isMuted={voice.isMuted}
        onToggleMute={voice.toggleMute}
        micLevel={micLevel}
        isCamOff={isCamOff}
        onToggleCam={() => setIsCamOff((v) => !v)}
        isLessonMode={inLesson}
        onToggleLesson={toggleLesson}
        isTranscriptVisible={showTranscript}
        onToggleTranscript={() => setShowTranscript((v) => !v)}
        isNotesOpen={showNotes}
        onToggleNotes={() => setShowNotes((v) => !v)}
        isSettingsOpen={showSettings}
        onToggleSettings={() => setShowSettings((v) => !v)}
        onEnd={handleEnd}
        isConnected={isConnected}
      />

      {/* Toast */}
      <SessionToast message={toast} />
    </div>
  )
}
