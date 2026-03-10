export type ScenarioMode = 'conversation' | 'tutor' | 'immersion' | 'reference'

export const MODE_LABELS: Record<ScenarioMode, string> = {
  conversation: 'Conversation',
  tutor: 'Tutor',
  immersion: 'Immersion',
  reference: 'Reference',
}

export const MODE_DESCRIPTIONS: Record<ScenarioMode, string> = {
  conversation: 'Practice real conversations',
  tutor: 'Learn with a private tutor',
  immersion: 'Read & analyze native content',
  reference: 'Quick answers about language',
}

const LANGUAGE_PLACEHOLDERS: Record<string, Record<ScenarioMode, string>> = {
  Japanese: {
    conversation: "Describe a situation \u2014 e.g. \"I'm ordering ramen at a busy shop in Tokyo\"",
    tutor: "What do you want to work on? \u2014 e.g. \"Help me with \u3066-form\" or \"I keep mixing up \u306F and \u304C\"",
    immersion: "What kind of content? \u2014 e.g. \"A conversation between coworkers\" or \"JLPT N3 reading practice\"",
    reference: "Ask anything \u2014 e.g. \"What's the difference between \u306F and \u304C?\" or \"When do I use keigo?\"",
  },
  Korean: {
    conversation: "Describe a situation \u2014 e.g. \"I'm ordering food at a Korean BBQ restaurant\"",
    tutor: "What do you want to work on? \u2014 e.g. \"Help me with \uC874\uB313\uB9D0\" or \"I keep mixing up \uC740/\uB294 and \uC774/\uAC00\"",
    immersion: "What kind of content? \u2014 e.g. \"A K-drama dialogue\" or \"TOPIK reading practice\"",
    reference: "Ask anything \u2014 e.g. \"What's the difference between \uC740/\uB294 and \uC774/\uAC00?\"",
  },
  'Mandarin Chinese': {
    conversation: "Describe a situation \u2014 e.g. \"I'm bargaining at a market in Beijing\"",
    tutor: "What do you want to work on? \u2014 e.g. \"Help me with \u628A structure\" or \"Tones practice\"",
    immersion: "What kind of content? \u2014 e.g. \"A conversation between friends\" or \"HSK 4 reading practice\"",
    reference: "Ask anything \u2014 e.g. \"What's the difference between \u4E86 and \u8FC7?\"",
  },
  Spanish: {
    conversation: "Describe a situation \u2014 e.g. \"I'm ordering tapas at a bar in Madrid\"",
    tutor: "What do you want to work on? \u2014 e.g. \"ser vs estar\" or \"subjunctive mood\"",
    immersion: "What kind of content? \u2014 e.g. \"A conversation at a caf\u00e9\" or \"DELE B2 reading practice\"",
    reference: "Ask anything \u2014 e.g. \"When do I use por vs para?\"",
  },
  French: {
    conversation: "Describe a situation \u2014 e.g. \"I'm ordering at a caf\u00e9 in Paris\"",
    tutor: "What do you want to work on? \u2014 e.g. \"pass\u00e9 compos\u00e9 vs imparfait\" or \"subjunctive\"",
    immersion: "What kind of content? \u2014 e.g. \"A conversation between neighbors\" or \"DELF B1 practice\"",
    reference: "Ask anything \u2014 e.g. \"When do I use tu vs vous?\"",
  },
  German: {
    conversation: "Describe a situation \u2014 e.g. \"I'm asking for directions at a Bahnhof\"",
    tutor: "What do you want to work on? \u2014 e.g. \"Dative vs accusative\" or \"Konjunktiv II\"",
    immersion: "What kind of content? \u2014 e.g. \"A news article\" or \"Goethe B1 reading practice\"",
    reference: "Ask anything \u2014 e.g. \"How do German cases work?\"",
  },
  Italian: {
    conversation: "Describe a situation \u2014 e.g. \"I'm ordering gelato in Rome\"",
    tutor: "What do you want to work on? \u2014 e.g. \"Passato prossimo\" or \"Congiuntivo\"",
    immersion: "What kind of content? \u2014 e.g. \"A dialogue at a trattoria\" or \"CILS B1 practice\"",
    reference: "Ask anything \u2014 e.g. \"When do I use the congiuntivo?\"",
  },
  Portuguese: {
    conversation: "Describe a situation \u2014 e.g. \"I'm chatting at a praia in Rio\"",
    tutor: "What do you want to work on? \u2014 e.g. \"ser vs estar\" or \"personal infinitive\"",
    immersion: "What kind of content? \u2014 e.g. \"A conversation between friends\" or \"CELPE-Bras practice\"",
    reference: "Ask anything \u2014 e.g. \"What's the personal infinitive?\"",
  },
}

const DEFAULT_PLACEHOLDERS: Record<ScenarioMode, string> = {
  conversation: "Describe a situation you want to practice",
  tutor: "What do you want to work on?",
  immersion: "What kind of content would you like?",
  reference: "Ask anything about the language",
}

export function getModePlaceholders(targetLanguage: string): Record<ScenarioMode, string> {
  return LANGUAGE_PLACEHOLDERS[targetLanguage] ?? DEFAULT_PLACEHOLDERS
}

/** @deprecated Use getModePlaceholders(targetLanguage) instead */
export const MODE_PLACEHOLDERS: Record<ScenarioMode, string> = DEFAULT_PLACEHOLDERS

export function getAllModes(): ScenarioMode[] {
  return ['conversation', 'tutor', 'immersion', 'reference']
}
