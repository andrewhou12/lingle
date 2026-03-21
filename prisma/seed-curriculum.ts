/**
 * Seed curriculum data from per-language JSON files.
 *
 * Usage: npx tsx prisma/seed-curriculum.ts [language]
 * Example: npx tsx prisma/seed-curriculum.ts ja
 *
 * Adding a new language: create prisma/curriculum/{lang}/vocab.json + grammar.json
 * and run this script with the language code. No code changes needed.
 */
import { PrismaClient } from '@prisma/client'
import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const prisma = new PrismaClient()

interface VocabEntry {
  word: string
  cefrLevel: string
  frequencyRank: number
  domain?: string
}

interface GrammarEntry {
  pattern: string
  displayName: string
  cefrLevel: string
  sequencePosition: number
  prerequisites: string[]
}

async function seedLanguage(lang: string) {
  const vocabPath = resolve(__dirname, `curriculum/${lang}/vocab.json`)
  const grammarPath = resolve(__dirname, `curriculum/${lang}/grammar.json`)

  if (!existsSync(vocabPath)) {
    console.error(`No vocab file found at ${vocabPath}`)
    process.exit(1)
  }
  if (!existsSync(grammarPath)) {
    console.error(`No grammar file found at ${grammarPath}`)
    process.exit(1)
  }

  const vocab: VocabEntry[] = JSON.parse(readFileSync(vocabPath, 'utf-8'))
  const grammar: GrammarEntry[] = JSON.parse(readFileSync(grammarPath, 'utf-8'))

  console.log(`Seeding ${lang}: ${vocab.length} vocab items, ${grammar.length} grammar patterns`)

  // Clear existing curriculum data for this language
  await prisma.curriculumVocab.deleteMany({ where: { language: lang } })
  await prisma.curriculumGrammar.deleteMany({ where: { language: lang } })

  // Seed vocab
  await prisma.curriculumVocab.createMany({
    data: vocab.map((v) => ({
      language: lang,
      word: v.word,
      cefrLevel: v.cefrLevel,
      frequencyRank: v.frequencyRank,
      domain: v.domain ?? null,
    })),
  })
  console.log(`  ✓ ${vocab.length} vocab items`)

  // Seed grammar
  await prisma.curriculumGrammar.createMany({
    data: grammar.map((g) => ({
      language: lang,
      pattern: g.pattern,
      displayName: g.displayName,
      cefrLevel: g.cefrLevel,
      sequencePosition: g.sequencePosition,
      prerequisites: g.prerequisites,
    })),
  })
  console.log(`  ✓ ${grammar.length} grammar patterns`)

  console.log(`\nCurriculum seed complete for '${lang}'!`)
}

const lang = process.argv[2] || 'ja'
seedLanguage(lang)
  .catch((e) => {
    console.error('Seed failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
