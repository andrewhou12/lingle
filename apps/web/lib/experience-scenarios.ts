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

export const MODE_PLACEHOLDERS: Record<ScenarioMode, string> = {
  conversation: "Describe a situation — e.g. \"I'm ordering ramen at a busy shop in Tokyo\"",
  tutor: "What do you want to work on? — e.g. \"Help me with て-form\" or \"I keep mixing up は and が\"",
  immersion: "What kind of content? — e.g. \"A conversation between coworkers\" or \"JLPT N3 reading practice\"",
  reference: "Ask anything — e.g. \"What's the difference between は and が?\" or \"When do I use keigo?\"",
}

export function getAllModes(): ScenarioMode[] {
  return ['conversation', 'tutor', 'immersion', 'reference']
}
