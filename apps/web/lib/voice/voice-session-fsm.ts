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
  naturalnessFeedback: Array<{
    original: string
    suggestion: string
    explanation: string
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
    immediateFlush: () => EnrichedUtterance | null
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
  private _utteranceTime = 0
  private _firstTokenLogged = false
  private _firstMessageReceived = false
  private _sendInFlight = false

  constructor(deps: FSMDeps) {
    this._deps = deps
  }

  get state() { return this._state }
  get isActive() { return this._isActive }
  get isMuted() { return this._isMuted }
  get autoEndpoint() { return this._autoEndpoint }
  get sonioxStarted() { return this._sonioxStarted }
  get firstMessageReceived() { return this._firstMessageReceived }

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
        if (this._state === 'THINKING' || this._state === 'IDLE') this.transition('SPEAKING')
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

    // Guard: prevent duplicate sends
    if (this._state === 'THINKING' || this._state === 'SPEAKING' || this._sendInFlight) {
      console.log(`[voice] handleUtterance: ignoring duplicate (state=${this._state} sendInFlight=${this._sendInFlight}) text:"${text.slice(0, 40)}"`)
      return
    }
    this._sendInFlight = true

    this._utteranceTime = performance.now()
    this._firstTokenLogged = false
    console.log(`[voice:timing] utterance received: "${text.slice(0, 50)}"`)

    const { signals, annotation } = this._deps.computeSignals(utterance)
    void signals // signals stored elsewhere if needed

    this._deps.onTranscriptUpdate((prev) => [...prev, { role: 'user', text, isFinal: true, timestamp: Date.now() }])
    this.dispatch('ENDPOINT_FIRED')

    this._deps.tts.interrupt()

    const llmText = annotation ? `${text}\n\n${annotation}` : text
    this._deps.tts.reset()
    this._deps.sendMessage(llmText)
    console.log(`[voice:timing] LLM request sent +${(performance.now() - this._utteranceTime).toFixed(0)}ms`)
    this.dispatch('LLM_STREAMING')
    this._deps.soniox.pause()
  }

  // Called when LLM streaming starts (text arrives)
  onStreamingText(text: string) {
    if (this._firstTokenLogged === false && text.length > 0) {
      this._firstTokenLogged = true
      console.log(`[voice:timing] LLM first token +${(performance.now() - this._utteranceTime).toFixed(0)}ms`)
    }
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
    this._sendInFlight = false
    if (!this._firstMessageReceived) {
      this._firstMessageReceived = true
    }
    if (assistantText) {
      this._deps.tts.flushText(assistantText)
      this._deps.onTranscriptUpdate((prev) => {
        const last = prev[prev.length - 1]
        if (last && last.role === 'assistant') {
          return [...prev.slice(0, -1), { ...last, text: assistantText, isFinal: true }]
        }
        return prev
      })

      // Fire Track 2 analysis (skip turn 0 — that's the AI's greeting before the user has spoken)
      const turnIdx = this._turnCounter++
      const sessionId = this._deps.getSessionId()
      if (userText && sessionId && turnIdx > 0) {
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
              // Always store — even empty results — so we can show "Good" grade
              console.log('[voice] analysis result for turn', turnIdx, result)
              this._deps.onAnalysisResult(turnIdx, {
                corrections: result.corrections || [],
                vocabularyCards: result.vocabularyCards || [],
                grammarNotes: result.grammarNotes || [],
                naturalnessFeedback: result.naturalnessFeedback || [],
              })
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
    if (!this._isActive || !this._firstMessageReceived) return

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

  // Push-to-talk: stop recording and dispatch immediately
  stopTalking() {
    const t = performance.now()
    this._deps.onTalkingChange(false)

    // Grab accumulated tokens immediately — no finalize round-trip needed
    const utterance = this._deps.soniox.immediateFlush()
    this._deps.soniox.pause()

    if (utterance) {
      console.log(`[voice:timing] PTT release → immediateFlush ${(performance.now() - t).toFixed(0)}ms text:"${utterance.text.slice(0, 40)}"`)
      this.handleUtterance(utterance)
    } else {
      console.log(`[voice:timing] PTT release → immediateFlush EMPTY, falling back to finalize`)
      // Fallback: if immediateFlush got nothing (e.g. trailing audio not yet final),
      // finalize so the 'finalized' event fires and flushes remaining tokens
      this._deps.soniox.resume()
      setTimeout(() => {
        this._deps.soniox.finalize()
      }, 50)
    }
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
    this._firstMessageReceived = false
    this._deps.tts.reset()

    if (autoEndpoint) {
      await this._deps.soniox.start()
      this._sonioxStarted = true
    }
    this.dispatch('LLM_STREAMING')
  }

  async endSession() {
    this._isActive = false
    this._sendInFlight = false
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

  resetToIdle() {
    this._sendInFlight = false
    this.dispatch('RESET')
  }

  dispose() {
    // no-op for now
  }
}
