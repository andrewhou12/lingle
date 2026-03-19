/**
 * Episodic Memory Module
 *
 * Stores and retrieves facts about the learner across sessions.
 * Currently backed by Prisma (text search). Interface is designed
 * to be compatible with Mem0/pgvector for future migration.
 *
 * Usage:
 * - Post-session: addMemories() extracts facts from queued memories
 * - Pre-session: searchMemories() retrieves relevant memories for Slot 4
 * - Real-time: addMemory() stores a single fact immediately (from saveMemory tool)
 */
import { prisma } from '@lingle/db'
import { generateObject } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { z } from 'zod'
import type { SessionState } from '@lingle/shared'

/**
 * Add a single memory immediately (called from the saveMemory tool handler).
 */
export async function addMemory(
  userId: string,
  content: string,
  memoryType: string,
  lessonId?: string,
): Promise<void> {
  // Check for duplicate or near-duplicate
  const existing = await prisma.memory.findFirst({
    where: {
      userId,
      content: { contains: content.slice(0, 50) },
    },
  })

  if (existing) {
    // Update existing memory with newer content
    await prisma.memory.update({
      where: { id: existing.id },
      data: { content, updatedAt: new Date() },
    })
  } else {
    await prisma.memory.create({
      data: {
        userId,
        content,
        memoryType,
        lessonId,
      },
    })
  }
}

/**
 * Extract and store memories from a completed session.
 * Processes the memoriesQueued array from session state and
 * also runs LLM extraction on the session metadata.
 */
export async function addMemories(
  userId: string,
  sessionState: SessionState,
): Promise<number> {
  let count = 0

  // Store explicitly queued memories (from saveMemory tool)
  for (const entry of sessionState.memoriesQueued) {
    await addMemory(userId, entry.content, entry.memoryType, sessionState.lessonId)
    count++
  }

  // Extract additional facts from session context via LLM
  if (sessionState.topicsCovered.length > 0 || sessionState.strengthsNoted.length > 0) {
    try {
      const extractionSchema = z.object({
        facts: z.array(z.object({
          content: z.string(),
          type: z.enum(['personal', 'preference', 'goal', 'context', 'achievement']),
        })).describe('Personal facts about the learner extracted from this session. Only include concrete, specific facts — not observations about language ability.'),
      })

      const { object } = await generateObject({
        model: anthropic('claude-haiku-4-5-20251001'),
        schema: extractionSchema,
        prompt: `Extract personal facts about the learner from this session data. Only include concrete facts about the person (not about their language skills).

Topics discussed: ${sessionState.topicsCovered.join(', ')}
Vocab introduced: ${sessionState.vocabIntroduced.join(', ')}
Strengths noted: ${sessionState.strengthsNoted.join('; ')}

Rules:
- Only extract facts about the learner's life, interests, job, family, etc.
- Do NOT extract language learning observations (those go in the learner model).
- Each fact should be a single, self-contained statement.
- If no personal facts can be extracted, return an empty array.`,
      })

      for (const fact of object.facts) {
        await addMemory(userId, fact.content, fact.type, sessionState.lessonId)
        count++
      }
    } catch (err) {
      console.error('[memory] LLM extraction failed:', err)
    }
  }

  if (count > 0) {
    console.log(`[memory] ${userId}: stored ${count} memories from session ${sessionState.sessionId}`)
  }
  return count
}

/**
 * Search for memories relevant to a query (or general context).
 * Returns memories formatted for Slot 4 of the system prompt.
 *
 * Currently uses simple recency + type-based retrieval.
 * When migrated to pgvector, this will use semantic similarity.
 */
export async function searchMemories(
  userId: string,
  query?: string,
  limit: number = 10,
): Promise<string> {
  const memories = await prisma.memory.findMany({
    where: { userId },
    orderBy: { updatedAt: 'desc' },
    take: limit,
    select: { content: true, memoryType: true },
  })

  if (memories.length === 0) return ''

  const grouped = new Map<string, string[]>()
  for (const m of memories) {
    const group = grouped.get(m.memoryType) ?? []
    group.push(m.content)
    grouped.set(m.memoryType, group)
  }

  const sections: string[] = []
  for (const [type, facts] of grouped) {
    sections.push(`${type}: ${facts.join('; ')}`)
  }

  return `MEMORIES FROM PAST SESSIONS:\n${sections.join('\n')}`
}

/**
 * Get all memories for a user (for display in settings/profile).
 */
export async function getAllMemories(userId: string) {
  return prisma.memory.findMany({
    where: { userId },
    orderBy: { updatedAt: 'desc' },
  })
}
