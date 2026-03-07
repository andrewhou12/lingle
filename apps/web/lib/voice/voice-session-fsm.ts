// Voice Session FSM — standalone state machine with zero React dependency

import type { EnrichedToken } from '@/lib/voice/turn-signals'

export type VoiceState = 'IDLE' | 'LISTENING' | 'THINKING' | 'SPEAKING' | 'INTERRUPTED'

export interface TranscriptLine {
  role: 'user' | 'assistant'
  text: string
  isFinal: boolean
  timestamp: number
}

export interface VoiceAnalysisResult {
  corrections: Array<{
    original: string
    corrected: string
    explanation: string
    grammarPoint?: string
  }>
  vocabularyCards: Array<{
    word: string
    reading?: string
    meaning: string
    partOfSpeech?: string
    exampleSentence?: string
    notes?: string
  }>
  grammarNotes: Array<{
    pattern: string
    meaning: string
    formation: string
    examples: Array<{ japanese: string; english: string }>
    level?: string
  }>
}

export interface EnrichedUtterance {
  text: string
  tokens: EnrichedToken[]
}

export interface FSMDeps {
  soniox: {
    start: () => Promise<void>
    stop: () => Promise<void>
    pause: () => void
    resume: () => void
    finalize: () => void
  }
  tts: {
    reset: () => void
    feedText: (text: string) => void
    flushText: (text: string) => void
    interrupt: () => void
    isDone: boolean
  }
  sendMessage: (text: string) => void
  onStateChange: (state: VoiceState) => void
  onTranscriptUpdate: (fn: (prev: TranscriptLine[]) => TranscriptLine[]) => void
  onAnalysisResult: (turnIdx: number, result: VoiceAnalysisResult) => void
  onTalkingChange: (talking: boolean) => void
  getSessionId: () => string | null
  getRecentHistory: () => Array<{ role: string; content: string }>
  computeSignals: (utterance: EnrichedUtterance) => { signals: unknown; annotation: string | null }
}

export class VoiceSessionFSM {
  private _state: VoiceState = 'IDLE'
  private _isActive = false
  private _isMuted = false
  private _autoEndpoint = false
  private _sonioxStarted = false
  private _turnCounter = 0
  private _deps: FSMDeps

  constructor(deps: FSMDeps) {
    this._deps = deps
  }

  get state() { return this._state }
  get isActive() { return this._isActive }
  get isMuted() { return this._isMuted }
  get autoEndpoint() { return this._autoEndpoint }
  get sonioxStarted() { return this._sonioxStarted }

  updateDeps(deps: Partial<FSMDeps>) {
    Object.assign(this._deps, deps)
  }

  private transition(newState: VoiceState) {
    if (this._state === newState) return
    this._state = newState
    this._deps.onStateChange(newState)
  }

  private dispatch(action: string) {
    switch (action) {
      case 'SPEECH_DETECTED':
        if (this._state === 'IDLE') this.transition('LISTENING')
        else if (this._state === 'SPEAKING') this.transition('INTERRUPTED')
        break
      case 'ENDPOINT_FIRED':
        if (this._state === 'LISTENING' || this._state === 'INTERRUPTED') this.transition('THINKING')
        break
      case 'LLM_STREAMING':
        if (this._state === 'THINKING') this.transition('SPEAKING')
        break
      case 'TTS_STARTED':
        if (this._state === 'THINKING') this.transition('SPEAKING')
        break
      case 'TTS_ENDED':
        if (this._state === 'SPEAKING' || this._state === 'THINKING' || this._state === 'INTERRUPTED') this.transition('IDLE')
        break
      case 'INTERRUPTED':
        if (this._state === 'SPEAKING' || this._state === 'THINKING') this.transition('INTERRUPTED')
        break
      case 'RESET':
        this.transition('IDLE')
        break
    }
  }

  // Called when TTS playback starts
  onTTSStarted() {
    this.dispatch('TTS_STARTED')
  }

  // Called when TTS playback ends
  onTTSEnded() {
    this.dispatch('TTS_ENDED')
    if (this._autoEndpoint && this._isActive && !this._isMuted) {
      this._deps.soniox.resume()
    }
  }

  // Called when Soniox detects speech start
  onSpeechDetected() {
    if (this._state === 'IDLE') {
      this.dispatch('SPEECH_DETECTED')
    }
    if (this._state === 'SPEAKING') {
      this.dispatch('INTERRUPTED')
      this._deps.tts.interrupt()
    }
  }

  // Called when Soniox produces a final utterance
  handleUtterance(utterance: EnrichedUtterance) {
    const text = utterance.text.trim()
    if (!text) return

    const { signals, annotation } = this._deps.computeSignals(utterance)
    void signals // signals stored elsewhere if needed

    this._deps.onTranscriptUpdate((prev) => [...prev, { role: 'user', text, isFinal: true, timestamp: Date.now() }])
    this.dispatch('ENDPOINT_FIRED')

    if (this._state === 'INTERRUPTED' || this._state === 'SPEAKING') {
      this._deps.tts.interrupt()
    }

    const llmText = annotation ? `${text}\n\n${annotation}` : text
    this._deps.tts.reset()
    this._deps.sendMessage(llmText)
    this.dispatch('LLM_STREAMING')
    this._deps.soniox.pause()
  }

  // Called when LLM streaming starts (text arrives)
  onStreamingText(text: string) {
    this._deps.tts.feedText(text)
    this._deps.onTranscriptUpdate((prev) => {
      const last = prev[prev.length - 1]
      if (last && last.role === 'assistant' && !last.isFinal) {
        if (last.text === text) return prev
        return [...prev.slice(0, -1), { ...last, text }]
      }
      return [...prev, { role: 'assistant', text, isFinal: false, timestamp: Date.now() }]
    })
  }

  // Called when LLM streaming ends
  onStreamingEnd(assistantText: string | null, userText: string | null) {
    if (assistantText) {
      this._deps.tts.flushText(assistantText)
      this._deps.onTranscriptUpdate((prev) => {
        const last = prev[prev.length - 1]
        if (last && last.role === 'assistant') {
          return [...prev.slice(0, -1), { ...last, text: assistantText, isFinal: true }]
        }
        return prev
      })

      // Fire Track 2 analysis
      const turnIdx = this._turnCounter++
      const sessionId = this._deps.getSessionId()
      if (userText && sessionId) {
        console.log('[voice] firing Track 2 analysis for turn', turnIdx)
        fetch('/api/conversation/voice-analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId,
            userMessage: userText,
            assistantMessage: assistantText,
            recentHistory: this._deps.getRecentHistory(),
          }),
        })
          .then((res) => res.ok ? res.json() : null)
          .then((result) => {
            if (result) {
              const hasContent = result.corrections?.length || result.vocabularyCards?.length || result.grammarNotes?.length
              if (hasContent) {
                console.log('[voice] analysis result for turn', turnIdx, result)
                this._deps.onAnalysisResult(turnIdx, result)
              }
            }
          })
          .catch((err) => console.error('[voice] Track 2 analysis failed:', err))
      }
    } else {
      this.dispatch('TTS_ENDED')
    }

    if (this._deps.tts.isDone) {
      this.dispatch('TTS_ENDED')
    } else {
      this._deps.soniox.pause()
    }
  }

  // Push-to-talk: start recording
  async startTalking() {
    if (!this._isActive) return

    // Interrupt if AI is speaking
    if (this._state === 'SPEAKING' || this._state === 'THINKING') {
      this._deps.tts.interrupt()
      this.dispatch('INTERRUPTED')
    }

    this._deps.onTalkingChange(true)

    if (!this._sonioxStarted) {
      this._sonioxStarted = true
      await this._deps.soniox.start()
    } else {
      this._deps.soniox.resume()
    }
    this.dispatch('SPEECH_DETECTED')
  }

  // Push-to-talk: stop recording and finalize immediately
  stopTalking() {
    this._deps.onTalkingChange(false)
    this._deps.soniox.pause()
    this._deps.soniox.resume()
    setTimeout(() => {
      this._deps.soniox.finalize()
    }, 50)
  }

  // Cancel current recording
  cancelTalking() {
    this._deps.onTalkingChange(false)
    this._deps.soniox.pause()
    this.dispatch('RESET')
  }

  // Session lifecycle
  async startSession(autoEndpoint: boolean) {
    this._isActive = true
    this._autoEndpoint = autoEndpoint
    this._sonioxStarted = false
    this._turnCounter = 0
    this._deps.tts.reset()

    if (autoEndpoint) {
      await this._deps.soniox.start()
      this._sonioxStarted = true
    }
    this.dispatch('LLM_STREAMING')
  }

  async endSession() {
    this._isActive = false
    try { this._deps.tts.interrupt() } catch {}
    try { await this._deps.soniox.stop() } catch {}
    this._sonioxStarted = false
    this.dispatch('RESET')
  }

  toggleMute(): boolean {
    this._isMuted = !this._isMuted
    if (this._isMuted) {
      this._deps.soniox.pause()
    } else {
      this._deps.soniox.resume()
    }
    return this._isMuted
  }

  sendTextMessage(text: string) {
    if (!text.trim() || !this._deps.getSessionId()) return
    this._deps.onTranscriptUpdate((prev) => [
      ...prev,
      { role: 'user', text: text.trim(), isFinal: true, timestamp: Date.now() },
    ])
    this._deps.tts.reset()
    this._deps.sendMessage(text.trim())
    this.dispatch('LLM_STREAMING')
  }

  dispose() {
    // no-op for now
  }
}
