import type {
  SessionPlan,
  TomBrief,
  WordBankEntry,
  ExpandedSessionPlan,
  ExpandedTomBrief,
  PragmaticState,
  CurriculumRecommendation,
} from '@linguist/shared/types'
import { createLogger } from '../logger'

const log = createLogger('core:planner')

export interface LearnerSummary {
  targetLanguage: string
  nativeLanguage: string
  computedLevel: string
  comprehensionCeiling: string
  productionCeiling: string
  activeItems: WordBankEntry[]
  stableItemCount: number
  burnedItemCount: number
  modalityGap: string | null
  pragmaticState: PragmaticState | null
  curriculumNewItems: CurriculumRecommendation[]
}

export function buildPlanningPrompt(
  learner: LearnerSummary,
  brief: ExpandedTomBrief
): string {
  const curriculumSection = learner.curriculumNewItems.length > 0
    ? `\nCurriculum recommendations (i+1 items to naturally introduce):\n${learner.curriculumNewItems
        .slice(0, 3)
        .map((c) => `- ${c.surfaceForm ?? c.patternId} (${c.reason})`)
        .join('\n')}`
    : ''

  const modalitySection = brief.modalityGaps.length > 0
    ? `\nModality gaps to address:\n${brief.modalityGaps
        .map((g) => `- ${g.modality}: ${g.gap} gap from strongest`)
        .join('\n')}`
    : ''

  const pragmaticSection = learner.pragmaticState
    ? `\nPragmatic state:
- Casual accuracy: ${(learner.pragmaticState.casualAccuracy * 100).toFixed(0)}%
- Polite accuracy: ${(learner.pragmaticState.politeAccuracy * 100).toFixed(0)}%
- Register slips: ${learner.pragmaticState.registerSlipCount}
- L1 fallbacks: ${learner.pragmaticState.l1FallbackCount}
- Circumlocution count: ${learner.pragmaticState.circumlocutionCount}
- Avoided patterns: ${learner.pragmaticState.avoidedGrammarPatterns.join(', ') || 'none'}`
    : ''

  const transferSection = brief.transferGaps.length > 0
    ? `\nGrammar items needing novel context exposure (transfer testing):\n${brief.transferGaps
        .slice(0, 3)
        .map((t) => `- Pattern ${t.patternId}: seen in ${t.contextCount}/${t.needed} contexts`)
        .join('\n')}`
    : ''

  return `You are a session planner for a language learning agent.
Given the learner profile below, generate a session plan as JSON.

The plan must include:
- target_vocabulary: 3–5 item IDs from apprentice/journeyman tier not yet produced in conversation
- target_grammar: 1–2 pattern IDs flagged as avoidance or confusion patterns
- difficulty_level: the learner's current level + 1 tier
- register: "casual" or "polite" based on learner's target
- session_focus: one sentence describing the session's theme
- pragmatic_targets: { target_register, register_focus_areas, encourage_circumlocution }
- curriculum_new_items: items from i+1 level to naturally introduce
- transfer_test_targets: grammar items to test in novel contexts

Learner profile:
- Language: ${learner.targetLanguage} (native: ${learner.nativeLanguage})
- Computed level: ${learner.computedLevel}
- Comprehension ceiling: ${learner.comprehensionCeiling}
- Production ceiling: ${learner.productionCeiling}
- Active items: ${learner.activeItems.length}
- Stable items: ${learner.stableItemCount}
- Burned items: ${learner.burnedItemCount}
${modalitySection}${pragmaticSection}${curriculumSection}${transferSection}

ToM daily brief:
${JSON.stringify(brief, null, 2)}

Respond with only valid JSON matching this schema:
{
  "target_vocabulary": number[],
  "target_grammar": number[],
  "difficulty_level": string,
  "register": "casual" | "polite",
  "session_focus": string,
  "pragmatic_targets": {
    "target_register": "casual" | "polite",
    "register_focus_areas": string[],
    "encourage_circumlocution": boolean
  },
  "curriculum_new_items": [{ "item_type": string, "surface_form": string | null, "pattern_id": string | null, "reason": string }],
  "transfer_test_targets": [{ "item_id": number, "pattern_id": string, "novel_context": string }],
  "card_budget": number
}`
}

export function parseSessionPlan(raw: string): ExpandedSessionPlan {
  log.debug('Parsing session plan', { rawLength: raw.length })
  // Strip markdown fences if the LLM wraps the JSON in ```json ... ```
  let cleaned = raw.trim()
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?\s*```$/, '')
  }
  const parsed = JSON.parse(cleaned)
  log.debug('Session plan parsed successfully', {
    targetVocab: parsed.target_vocabulary?.length ?? 0,
    targetGrammar: parsed.target_grammar?.length ?? 0,
    focus: parsed.session_focus,
  })
  return {
    targetVocabulary: parsed.target_vocabulary ?? [],
    targetGrammar: parsed.target_grammar ?? [],
    difficultyLevel: parsed.difficulty_level ?? 'A1',
    register: parsed.register ?? 'polite',
    sessionFocus: parsed.session_focus ?? '',
    pragmaticTargets: {
      targetRegister: parsed.pragmatic_targets?.target_register ?? 'polite',
      registerFocusAreas: parsed.pragmatic_targets?.register_focus_areas ?? [],
      encourageCircumlocution: parsed.pragmatic_targets?.encourage_circumlocution ?? false,
    },
    curriculumNewItems: (parsed.curriculum_new_items ?? []).map(
      (c: { item_type: string; surface_form?: string; pattern_id?: string; reason: string }) => ({
        itemType: c.item_type as 'lexical' | 'grammar',
        surfaceForm: c.surface_form,
        patternId: c.pattern_id,
        reason: c.reason,
      })
    ),
    transferTestTargets: (parsed.transfer_test_targets ?? []).map(
      (t: { item_id: number; pattern_id: string; novel_context: string }) => ({
        itemId: t.item_id,
        patternId: t.pattern_id,
        novelContext: t.novel_context,
      })
    ),
    cardBudget: parsed.card_budget ?? 3,
  }
}

export function buildConversationSystemPrompt(
  learner: LearnerSummary,
  plan: ExpandedSessionPlan,
  brief: ExpandedTomBrief
): string {
  const curriculumItems = plan.curriculumNewItems.length > 0
    ? `\n- Curriculum i+1 items to naturally introduce: ${plan.curriculumNewItems
        .map((c) => c.surfaceForm ?? c.patternId)
        .join(', ')}`
    : ''

  const transferTargets = plan.transferTestTargets.length > 0
    ? `\n- Grammar items to test in novel contexts: ${plan.transferTestTargets
        .map((t) => `${t.patternId} (try: ${t.novelContext})`)
        .join(', ')}`
    : ''

  const pragmaticNotes = plan.pragmaticTargets.registerFocusAreas.length > 0
    ? `\n- Register focus areas: ${plan.pragmaticTargets.registerFocusAreas.join(', ')}`
    : ''

  const activeItemCount = learner.activeItems.length
  const cardBudget = activeItemCount < 20 ? 5 : activeItemCount < 80 ? 3 : 1

  return `You are a Japanese language practice partner. Your job is to have natural conversations with the learner at their level while engineering opportunities for them to use specific target vocabulary and grammar patterns.

Do not adopt a persona or character. Do not pretend to have personal experiences. Keep the focus on the learner's practice.

LEARNER PROFILE SUMMARY:
- Level: ${learner.computedLevel} (comprehension: ${learner.comprehensionCeiling}, production: ${learner.productionCeiling})
- Native language: ${learner.nativeLanguage}
- Current session targets: vocabulary IDs ${JSON.stringify(plan.targetVocabulary)}, grammar IDs ${JSON.stringify(plan.targetGrammar)}
- Output complexity: ${plan.difficultyLevel}
- Register: ${plan.register}
- Known avoidance patterns: ${JSON.stringify(brief.avoidancePatterns)}
- Known confusion pairs: ${JSON.stringify(brief.confusionPairs)}${curriculumItems}${transferTargets}${pragmaticNotes}

BEHAVIORAL RULES:
1. Speak primarily in ${learner.targetLanguage} at the specified difficulty level.
2. Engineer natural conversational moments to elicit the target vocabulary and grammar from the learner. Do not force them — create contexts where they arise naturally.
3. When the learner makes a production error, correct via recasting: use the correct form naturally in your next utterance without explicitly pointing out the error. Do not break conversational flow to correct unless the error causes miscommunication.
4. If the learner uses their native language instead of ${learner.targetLanguage}, note it and gently redirect without shaming.
5. Track internally when a target item has been successfully produced by the learner. Acknowledge success subtly.
6. Do not exceed the difficulty level — monitor your own lexical and grammatical complexity.
7. Track register usage: if the learner slips from ${plan.pragmaticTargets.targetRegister} to the wrong register, model the correct register in your response.
8. When the learner uses circumlocution (describing a word they don't know), note it positively — this is a valuable communication strategy. Provide the target word naturally afterward.
9. Naturally introduce curriculum i+1 items by using them in context before expecting production.
10. For transfer testing targets, create novel conversational contexts different from where the grammar was originally learned.
11. When introducing new vocabulary, emit a structured card block:
    [VOCAB_CARD]
    surface: <word>
    reading: <reading>
    meaning: <English meaning>
    example: <example sentence>
    example_translation: <English translation>
    [/VOCAB_CARD]
    Then use the word naturally in your next conversational line.
12. When explaining grammar, emit:
    [GRAMMAR_CARD]
    pattern: <pattern name>
    meaning: <English explanation>
    example: <example sentence>
    example_translation: <English translation>
    formation: <formation rule>
    [/GRAMMAR_CARD]
13. When correcting errors, emit:
    [CORRECTION]
    incorrect: <what learner said>
    correct: <correct form>
    explanation: <brief explanation>
    [/CORRECTION]
14. When testing recall, emit:
    [REVIEW_PROMPT]
    prompt: <the question>
    item_type: <lexical|grammar>
    item_id: <id>
    [/REVIEW_PROMPT]
15. At the end of each response, include a metadata line listing any target items the learner successfully produced in their most recent message:
    [TARGETS_HIT: item1, item2]
    If none were hit, omit this line.
16. Card budget for this session: ${cardBudget}. Never emit more than this many cards total. Never stack cards back-to-back — at least 3 conversational turns between cards.
17. After turn 20, begin wrapping up. Do not introduce new vocabulary or grammar after this point.`
}
