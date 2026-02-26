#!/usr/bin/env npx tsx
/**
 * Adds sense disambiguation fields to vocabulary.json:
 * - senseId: "{id}-s{n}" unique per sense
 * - senseGroup: shared surfaceForm (groups polysemous entries)
 * - senseIndex: 1, 2, 3...
 * - senseGloss: short disambiguation label
 */

import * as fs from 'fs'
import * as path from 'path'

const vocabPath = path.resolve(
  __dirname,
  '../packages/core/src/curriculum/data/vocabulary.json'
)

interface VocabItem {
  id: string
  surfaceForm: string
  reading: string
  meaning: string
  partOfSpeech: string
  cefrLevel: string
  jlptLevel: string
  frequencyRank: number
  tags: string[]
  assessmentCandidate: boolean
  senseId?: string
  senseGroup?: string
  senseIndex?: number
  senseGloss?: string
}

const raw = fs.readFileSync(vocabPath, 'utf-8')
const items: VocabItem[] = JSON.parse(raw)

// Group by surfaceForm to find polysemous entries
const surfaceGroups = new Map<string, VocabItem[]>()
for (const item of items) {
  const group = surfaceGroups.get(item.surfaceForm) ?? []
  group.push(item)
  surfaceGroups.set(item.surfaceForm, group)
}

// Count polysemous groups
const polysemousGroups = Array.from(surfaceGroups.entries()).filter(
  ([, g]) => g.length > 1
)
console.log(`Total items: ${items.length}`)
console.log(`Unique surface forms: ${surfaceGroups.size}`)
console.log(`Polysemous groups: ${polysemousGroups.length}`)

// Derive senseGloss from meaning field
function deriveSenseGloss(meaning: string, maxLen = 30): string {
  // Take first clause (split by semicolons)
  const firstClause = meaning.split(';')[0].trim()
  if (firstClause.length <= maxLen) return firstClause
  // Truncate at word boundary
  const truncated = firstClause.slice(0, maxLen)
  const lastSpace = truncated.lastIndexOf(' ')
  return lastSpace > 10 ? truncated.slice(0, lastSpace) : truncated
}

// Assign sense fields
for (const [surfaceForm, group] of surfaceGroups) {
  for (let i = 0; i < group.length; i++) {
    const item = group[i]
    const senseIndex = i + 1
    item.senseId = `${item.id}-s${senseIndex}`
    item.senseGroup = surfaceForm
    item.senseIndex = senseIndex
    item.senseGloss = deriveSenseGloss(item.meaning)
  }
}

// Write back
fs.writeFileSync(vocabPath, JSON.stringify(items, null, 2) + '\n')
console.log('Done. Wrote sense fields to vocabulary.json')

// Print a few polysemous examples
console.log('\nSample polysemous groups:')
let shown = 0
for (const [sf, group] of polysemousGroups) {
  if (shown >= 5) break
  console.log(`  ${sf}:`)
  for (const item of group) {
    console.log(`    [s${item.senseIndex}] ${item.senseGloss}`)
  }
  shown++
}
