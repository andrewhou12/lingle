import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/api-helpers'
import { prisma } from '@lingle/db'
import type { Prisma } from '@prisma/client'

export const maxDuration = 30

/**
 * Generate an onboarding session plan.
 * This is a special session with 4 phases:
 * 1. Goal audit — understand why the learner is studying
 * 2. Level calibration — assess current ability via conversation
 * 3. Preference capture — correction style, session length, etc.
 * 4. Track assignment — summarize the learning contract
 */
export const POST = withAuth(async (request, { userId }) => {
  let targetLanguage = 'ja'
  let nativeLanguage = 'en'
  try {
    const body = await request.json()
    if (body.targetLanguage) targetLanguage = body.targetLanguage
    if (body.nativeLanguage) nativeLanguage = body.nativeLanguage
  } catch {
    // Use defaults
  }

  // Ensure user has basic profile fields set
  await prisma.user.update({
    where: { id: userId },
    data: {
      targetLanguage,
      nativeLanguage,
    },
  })

  // Create learner model if it doesn't exist
  await prisma.learnerModel.upsert({
    where: { userId },
    create: {
      userId,
      cefrGrammar: 2.0,
      cefrFluency: 2.0,
    },
    update: {},
  })

  const plan = {
    _mode: 'onboarding',
    topic: 'Getting to know you',
    sections: [
      { id: 'goals', label: 'Goals', description: 'Understand why the learner is studying this language and what they want to achieve' },
      { id: 'calibration', label: 'Level Check', description: 'Have a natural conversation to assess the learner\'s current level' },
      { id: 'preferences', label: 'Preferences', description: 'Ask about preferred correction style and session preferences' },
      { id: 'summary', label: 'Summary', description: 'Summarize the learning plan and set expectations' },
    ],
  }

  // Create a lesson record for the onboarding
  const lesson = await prisma.lesson.create({
    data: {
      userId,
      targetLanguage,
      lessonGoal: 'Onboarding — getting to know you',
      lessonPlan: plan as unknown as Prisma.InputJsonValue,
      systemPrompt: 'onboarding',
    },
  })

  // Build the onboarding system prompt
  const basePrompt = buildOnboardingPrompt(targetLanguage, nativeLanguage)

  return NextResponse.json({
    _sessionId: lesson.id,
    sessionFocus: 'Onboarding',
    plan,
    agentMetadata: {
      sessionMode: 'onboarding',
      lessonPlan: {
        warmupTopic: 'Introduction and goals',
        mainActivity: 'Level calibration conversation',
        targetVocab: [],
        grammarFocus: [],
        reviewPatterns: [],
      },
    },
    basePrompt,
  })
})

function buildOnboardingPrompt(targetLanguage: string, nativeLanguage: string): string {
  return `You are conducting an onboarding session for a new language learner. Your goal is to learn about them, assess their level, and set up their learning experience.

TARGET LANGUAGE: ${targetLanguage}
NATIVE LANGUAGE: ${nativeLanguage}

SESSION PHASES (follow in order):

PHASE 1 — GOALS (2-3 minutes):
- Greet the learner warmly in ${nativeLanguage} first, then switch to simple ${targetLanguage}
- Ask why they're learning ${targetLanguage}
- Ask about their timeline and goals (travel? work? relationships? culture?)
- Use the setGoal tool to record their goal
- Use saveMemory to save personal facts you learn

PHASE 2 — LEVEL CALIBRATION (3-5 minutes):
- Transition to speaking in ${targetLanguage}
- Start with very simple questions (A1 level)
- Gradually increase complexity based on their responses
- Test: greeting, self-introduction, describing daily routine, expressing opinions
- Use calibrateLevel tool when you have enough data to assess their CEFR level
- Call logError for any errors you notice

PHASE 3 — PREFERENCES (1-2 minutes):
- Ask if they prefer corrections in the moment or just natural recasting
- Ask about session length preference (15, 20, or 30 minutes)
- Use setPreference tool for each preference

PHASE 4 — SUMMARY (1 minute):
- Summarize what you learned about them
- Explain what their sessions will look like
- Express enthusiasm about working together
- Call updateLessonPhase with 'wrapup'

RULES:
- Be warm, encouraging, and conversational
- Keep the tone casual and friendly — this is about building rapport
- Do NOT use markdown or text formatting — this is a voice conversation
- Call tools SILENTLY — never mention them in speech
- Keep your turns short (1-3 sentences)`
}
