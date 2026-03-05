export interface SessionPlan {
  focus: string
  goals: string[]
  approach: string
  milestones: Array<{
    description: string
    completed: boolean
  }>
  targetVocabulary?: string[]
  targetGrammar?: string[]
  scenario?: {
    setting: string
    aiRole: string
    learnerGoal: string
    register: string
  }
}

export function formatPlanForPrompt(plan: SessionPlan): string {
  const lines: string[] = []

  lines.push(`Focus: ${plan.focus}`)
  lines.push('')

  lines.push('Goals:')
  for (const goal of plan.goals) {
    lines.push(`  - ${goal}`)
  }
  lines.push('')

  lines.push(`Approach: ${plan.approach}`)
  lines.push('')

  lines.push('Milestones:')
  for (let i = 0; i < plan.milestones.length; i++) {
    const m = plan.milestones[i]
    lines.push(`  ${m.completed ? '[x]' : '[ ]'} ${i + 1}. ${m.description}`)
  }

  if (plan.targetVocabulary?.length) {
    lines.push('')
    lines.push(`Target vocabulary: ${plan.targetVocabulary.join(', ')}`)
  }

  if (plan.targetGrammar?.length) {
    lines.push('')
    lines.push(`Target grammar: ${plan.targetGrammar.join(', ')}`)
  }

  if (plan.scenario) {
    lines.push('')
    lines.push('Scenario:')
    lines.push(`  Setting: ${plan.scenario.setting}`)
    lines.push(`  Your role: ${plan.scenario.aiRole}`)
    lines.push(`  Learner goal: ${plan.scenario.learnerGoal}`)
    lines.push(`  Register: ${plan.scenario.register}`)
  }

  return lines.join('\n')
}
