export interface TestScenario {
  name: string
  description: string
  type: 'voice-stream' | 'tts-only'
  mode: 'conversation' | 'tutor'
  planPrompt?: string
  /** For voice-stream: messages to send. For warm scenarios, warmup messages are prepended automatically. */
  messages: Array<{ role: string; content: string }>
  /** Extra warmup turns to run before the measured turn (for cache warming) */
  warmupTurns?: Array<{ role: string; content: string }>[]
  /** Text to synthesize (tts-only scenarios) */
  ttsText?: string
  iterations: number
}

export const SCENARIOS: TestScenario[] = [
  // --- Voice stream: cold start ---
  {
    name: 'cold-short',
    description: 'New session, short message',
    type: 'voice-stream',
    mode: 'conversation',
    planPrompt: 'Free conversation practice',
    messages: [{ role: 'user', content: 'はい、よろしくお願いします。' }],
    iterations: 3,
  },
  {
    name: 'cold-medium',
    description: 'New session, medium message',
    type: 'voice-stream',
    mode: 'conversation',
    planPrompt: 'Ordering food at a restaurant',
    messages: [{ role: 'user', content: '今日は何がおすすめですか？初めて来たので、人気のメニューを教えてください。' }],
    iterations: 3,
  },

  // --- Voice stream: warm turns ---
  {
    name: 'warm-turn-2',
    description: '2nd turn, prompt cache warm',
    type: 'voice-stream',
    mode: 'conversation',
    planPrompt: 'Talking about weekend plans',
    warmupTurns: [
      [{ role: 'user', content: '週末は何をしますか？' }],
    ],
    messages: [{ role: 'user', content: 'いいですね！私も映画を見たいです。' }],
    iterations: 3,
  },
  {
    name: 'warm-turn-5',
    description: '5th turn, longer context',
    type: 'voice-stream',
    mode: 'conversation',
    planPrompt: 'Discussing favorite music',
    warmupTurns: [
      [{ role: 'user', content: '音楽は好きですか？' }],
      [{ role: 'user', content: 'へえ、面白いですね。' }],
      [{ role: 'user', content: '日本の音楽と外国の音楽、どっちが好きですか？' }],
      [{ role: 'user', content: 'なるほど。おすすめの曲はありますか？' }],
    ],
    messages: [{ role: 'user', content: '今度聞いてみます！最近はどんな曲を聞いていますか？' }],
    iterations: 3,
  },

  // --- Voice stream: tutor mode ---
  {
    name: 'tutor-cold',
    description: 'Tutor mode cold start',
    type: 'voice-stream',
    mode: 'tutor',
    planPrompt: 'Teach me about て-form',
    messages: [{ role: 'user', content: 'て形を教えてください。' }],
    iterations: 3,
  },

  // --- TTS only ---
  {
    name: 'tts-short',
    description: 'Isolated TTS: short sentence',
    type: 'tts-only',
    mode: 'conversation',
    ttsText: 'いいですね！今度一緒に行きましょう。',
    messages: [],
    iterations: 5,
  },
  {
    name: 'tts-long',
    description: 'Isolated TTS: paragraph',
    type: 'tts-only',
    mode: 'conversation',
    ttsText: '日本の食文化はとても豊かです。寿司やラーメンだけでなく、各地方に独特の料理があります。例えば、大阪のたこ焼きや、広島のお好み焼き、北海道のジンギスカンなどが有名です。季節によっても食べ物が変わります。',
    messages: [],
    iterations: 5,
  },
]
