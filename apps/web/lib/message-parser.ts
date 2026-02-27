export type MessageSegmentType =
  | 'text'
  | 'vocab_card'
  | 'grammar_card'
  | 'review_prompt'
  | 'correction'
  | 'targets_hit'

export interface MessageSegment {
  type: MessageSegmentType
  content: string
  data?: Record<string, string>
}

const TAG_MAP: Record<string, MessageSegmentType> = {
  VOCAB_CARD: 'vocab_card',
  GRAMMAR_CARD: 'grammar_card',
  REVIEW_PROMPT: 'review_prompt',
  CORRECTION: 'correction',
}

const BLOCK_REGEX = /\[(VOCAB_CARD|GRAMMAR_CARD|REVIEW_PROMPT|CORRECTION)\]([\s\S]*?)\[\/\1\]/g
const TARGETS_HIT_REGEX = /\[TARGETS_HIT:\s*([^\]]*)\]/

function parseKeyValueBlock(content: string): Record<string, string> {
  const data: Record<string, string> = {}
  for (const line of content.split('\n')) {
    const match = line.match(/^\s*(\w+(?:_\w+)*):\s*(.+)$/)
    if (match) {
      data[match[1].trim()] = match[2].trim()
    }
  }
  return data
}

export function parseMessage(content: string): MessageSegment[] {
  const segments: MessageSegment[] = []
  let lastIndex = 0

  // Extract targets hit line first
  let targetsHitItems: string[] = []
  const targetsMatch = content.match(TARGETS_HIT_REGEX)
  if (targetsMatch) {
    targetsHitItems = targetsMatch[1].split(',').map((s) => s.trim()).filter(Boolean)
  }

  // Strip targets hit line from content for block parsing
  const cleanContent = content.replace(TARGETS_HIT_REGEX, '').trimEnd()

  // Find all structured blocks
  const matches = [...cleanContent.matchAll(BLOCK_REGEX)]

  for (const match of matches) {
    const beforeText = cleanContent.slice(lastIndex, match.index).trim()
    if (beforeText) {
      segments.push({ type: 'text', content: beforeText })
    }

    const tagName = match[1]
    const blockContent = match[2]
    const segmentType = TAG_MAP[tagName]
    if (segmentType) {
      segments.push({
        type: segmentType,
        content: blockContent.trim(),
        data: parseKeyValueBlock(blockContent),
      })
    }

    lastIndex = (match.index ?? 0) + match[0].length
  }

  // Remaining text after last block
  const remaining = cleanContent.slice(lastIndex).trim()
  if (remaining) {
    segments.push({ type: 'text', content: remaining })
  }

  // Add targets hit as a separate segment
  if (targetsHitItems.length > 0) {
    segments.push({
      type: 'targets_hit',
      content: targetsHitItems.join(', '),
      data: { items: targetsHitItems.join(',') },
    })
  }

  // If no segments were created (empty message), return a single text segment
  if (segments.length === 0) {
    segments.push({ type: 'text', content: '' })
  }

  return segments
}

export function extractTargetsHit(content: string): string[] {
  const match = content.match(TARGETS_HIT_REGEX)
  if (!match) return []
  return match[1].split(',').map((s) => s.trim()).filter(Boolean)
}
