import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// ── FSRS State Helpers ──

interface FsrsState {
  due: string
  stability: number
  difficulty: number
  elapsed_days: number
  scheduled_days: number
  reps: number
  lapses: number
  state: number
  last_review?: string
}

const now = new Date()
const today = now.toISOString()

function daysAgo(n: number): string {
  const d = new Date(now)
  d.setDate(d.getDate() - n)
  return d.toISOString()
}

function makeFsrs(overrides: Partial<FsrsState> = {}): FsrsState {
  return {
    due: today,
    stability: 0,
    difficulty: 0,
    elapsed_days: 0,
    scheduled_days: 0,
    reps: 0,
    lapses: 0,
    state: 0,
    ...overrides,
  }
}

function initialFsrs(): FsrsState {
  return makeFsrs()
}

function apprentice1Fsrs(): FsrsState {
  return makeFsrs({
    stability: 1,
    difficulty: 5.5,
    elapsed_days: 1,
    scheduled_days: 1,
    reps: 1,
    state: 2,
    last_review: daysAgo(1),
  })
}

function apprentice2Fsrs(): FsrsState {
  return makeFsrs({
    stability: 2,
    difficulty: 5.2,
    elapsed_days: 2,
    scheduled_days: 2,
    reps: 2,
    state: 2,
    last_review: daysAgo(2),
  })
}

function apprentice3Fsrs(): FsrsState {
  return makeFsrs({
    stability: 4,
    difficulty: 5.0,
    elapsed_days: 4,
    scheduled_days: 4,
    reps: 3,
    state: 2,
    last_review: daysAgo(4),
  })
}

function journeymanFsrs(): FsrsState {
  return makeFsrs({
    stability: 14,
    difficulty: 4.5,
    elapsed_days: 14,
    scheduled_days: 14,
    reps: 5,
    state: 2,
    last_review: daysAgo(14),
  })
}

const TEST_USER_ID = 'seed-test-user-001'

// ── Vocabulary Data (A1 Japanese) ──

interface VocabSeed {
  surfaceForm: string
  reading: string
  meaning: string
  partOfSpeech: string
  masteryState: string
  cefrLevel: string
  tags: string[]
  makeFsrs: () => FsrsState
  exposureCount: number
  productionCount: number
}

const vocabulary: VocabSeed[] = [
  { surfaceForm: '食べる', reading: 'たべる', meaning: 'to eat', partOfSpeech: 'verb', masteryState: 'apprentice_1', cefrLevel: 'A1', tags: ['N5', 'verb', 'ichidan'], makeFsrs: apprentice1Fsrs, exposureCount: 2, productionCount: 0 },
  { surfaceForm: '飲む', reading: 'のむ', meaning: 'to drink', partOfSpeech: 'verb', masteryState: 'apprentice_1', cefrLevel: 'A1', tags: ['N5', 'verb', 'godan'], makeFsrs: apprentice1Fsrs, exposureCount: 2, productionCount: 0 },
  { surfaceForm: '大きい', reading: 'おおきい', meaning: 'big; large', partOfSpeech: 'i-adjective', masteryState: 'apprentice_1', cefrLevel: 'A1', tags: ['N5', 'adjective'], makeFsrs: apprentice1Fsrs, exposureCount: 1, productionCount: 0 },
  { surfaceForm: '小さい', reading: 'ちいさい', meaning: 'small; little', partOfSpeech: 'i-adjective', masteryState: 'apprentice_1', cefrLevel: 'A1', tags: ['N5', 'adjective'], makeFsrs: apprentice1Fsrs, exposureCount: 1, productionCount: 0 },
  { surfaceForm: '学校', reading: 'がっこう', meaning: 'school', partOfSpeech: 'noun', masteryState: 'apprentice_1', cefrLevel: 'A1', tags: ['N5', 'noun', 'place'], makeFsrs: apprentice1Fsrs, exposureCount: 2, productionCount: 0 },
  { surfaceForm: '先生', reading: 'せんせい', meaning: 'teacher; doctor', partOfSpeech: 'noun', masteryState: 'apprentice_1', cefrLevel: 'A1', tags: ['N5', 'noun', 'person'], makeFsrs: apprentice1Fsrs, exposureCount: 1, productionCount: 0 },
  { surfaceForm: '時間', reading: 'じかん', meaning: 'time; hour', partOfSpeech: 'noun', masteryState: 'apprentice_1', cefrLevel: 'A1', tags: ['N5', 'noun', 'time'], makeFsrs: apprentice1Fsrs, exposureCount: 2, productionCount: 0 },
  { surfaceForm: '新しい', reading: 'あたらしい', meaning: 'new', partOfSpeech: 'i-adjective', masteryState: 'apprentice_1', cefrLevel: 'A1', tags: ['N5', 'adjective'], makeFsrs: apprentice1Fsrs, exposureCount: 1, productionCount: 0 },
  { surfaceForm: '水', reading: 'みず', meaning: 'water', partOfSpeech: 'noun', masteryState: 'apprentice_2', cefrLevel: 'A1', tags: ['N5', 'noun'], makeFsrs: apprentice2Fsrs, exposureCount: 4, productionCount: 0 },
  { surfaceForm: '友達', reading: 'ともだち', meaning: 'friend', partOfSpeech: 'noun', masteryState: 'apprentice_2', cefrLevel: 'A1', tags: ['N5', 'noun', 'person'], makeFsrs: apprentice2Fsrs, exposureCount: 3, productionCount: 0 },
  { surfaceForm: '行く', reading: 'いく', meaning: 'to go', partOfSpeech: 'verb', masteryState: 'apprentice_2', cefrLevel: 'A1', tags: ['N5', 'verb', 'godan'], makeFsrs: apprentice2Fsrs, exposureCount: 5, productionCount: 0 },
  { surfaceForm: '来る', reading: 'くる', meaning: 'to come', partOfSpeech: 'verb', masteryState: 'apprentice_2', cefrLevel: 'A1', tags: ['N5', 'verb', 'irregular'], makeFsrs: apprentice2Fsrs, exposureCount: 4, productionCount: 0 },
  { surfaceForm: '本', reading: 'ほん', meaning: 'book', partOfSpeech: 'noun', masteryState: 'apprentice_2', cefrLevel: 'A1', tags: ['N5', 'noun'], makeFsrs: apprentice2Fsrs, exposureCount: 3, productionCount: 0 },
  { surfaceForm: '天気', reading: 'てんき', meaning: 'weather', partOfSpeech: 'noun', masteryState: 'apprentice_2', cefrLevel: 'A1', tags: ['N5', 'noun'], makeFsrs: apprentice2Fsrs, exposureCount: 3, productionCount: 0 },
  { surfaceForm: '人', reading: 'ひと', meaning: 'person; people', partOfSpeech: 'noun', masteryState: 'apprentice_3', cefrLevel: 'A1', tags: ['N5', 'noun', 'person'], makeFsrs: apprentice3Fsrs, exposureCount: 7, productionCount: 1 },
  { surfaceForm: '見る', reading: 'みる', meaning: 'to see; to look', partOfSpeech: 'verb', masteryState: 'apprentice_3', cefrLevel: 'A1', tags: ['N5', 'verb', 'ichidan'], makeFsrs: apprentice3Fsrs, exposureCount: 6, productionCount: 1 },
  { surfaceForm: '言う', reading: 'いう', meaning: 'to say', partOfSpeech: 'verb', masteryState: 'apprentice_3', cefrLevel: 'A1', tags: ['N5', 'verb', 'godan'], makeFsrs: apprentice3Fsrs, exposureCount: 8, productionCount: 1 },
  { surfaceForm: '日本語', reading: 'にほんご', meaning: 'Japanese language', partOfSpeech: 'noun', masteryState: 'apprentice_3', cefrLevel: 'A1', tags: ['N5', 'noun', 'language'], makeFsrs: apprentice3Fsrs, exposureCount: 6, productionCount: 1 },
  { surfaceForm: '私', reading: 'わたし', meaning: 'I; me', partOfSpeech: 'pronoun', masteryState: 'journeyman', cefrLevel: 'A1', tags: ['N5', 'pronoun'], makeFsrs: journeymanFsrs, exposureCount: 15, productionCount: 5 },
  { surfaceForm: 'する', reading: 'する', meaning: 'to do', partOfSpeech: 'verb', masteryState: 'journeyman', cefrLevel: 'A1', tags: ['N5', 'verb', 'irregular'], makeFsrs: journeymanFsrs, exposureCount: 20, productionCount: 8 },
  { surfaceForm: 'ある', reading: 'ある', meaning: 'to exist (inanimate); there is', partOfSpeech: 'verb', masteryState: 'journeyman', cefrLevel: 'A1', tags: ['N5', 'verb', 'godan'], makeFsrs: journeymanFsrs, exposureCount: 18, productionCount: 6 },
  { surfaceForm: 'いい', reading: 'いい', meaning: 'good; fine', partOfSpeech: 'i-adjective', masteryState: 'journeyman', cefrLevel: 'A1', tags: ['N5', 'adjective'], makeFsrs: journeymanFsrs, exposureCount: 12, productionCount: 4 },
  { surfaceForm: '電車', reading: 'でんしゃ', meaning: 'train', partOfSpeech: 'noun', masteryState: 'introduced', cefrLevel: 'A1', tags: ['N5', 'noun', 'transport'], makeFsrs: initialFsrs, exposureCount: 1, productionCount: 0 },
  { surfaceForm: '買う', reading: 'かう', meaning: 'to buy', partOfSpeech: 'verb', masteryState: 'introduced', cefrLevel: 'A1', tags: ['N5', 'verb', 'godan'], makeFsrs: initialFsrs, exposureCount: 1, productionCount: 0 },
  { surfaceForm: '病院', reading: 'びょういん', meaning: 'hospital', partOfSpeech: 'noun', masteryState: 'introduced', cefrLevel: 'A1', tags: ['N5', 'noun', 'place'], makeFsrs: initialFsrs, exposureCount: 1, productionCount: 0 },
  { surfaceForm: '書く', reading: 'かく', meaning: 'to write', partOfSpeech: 'verb', masteryState: 'introduced', cefrLevel: 'A1', tags: ['N5', 'verb', 'godan'], makeFsrs: initialFsrs, exposureCount: 1, productionCount: 0 },
  { surfaceForm: '映画', reading: 'えいが', meaning: 'movie; film', partOfSpeech: 'noun', masteryState: 'unseen', cefrLevel: 'A1', tags: ['N5', 'noun'], makeFsrs: initialFsrs, exposureCount: 0, productionCount: 0 },
  { surfaceForm: '走る', reading: 'はしる', meaning: 'to run', partOfSpeech: 'verb', masteryState: 'unseen', cefrLevel: 'A1', tags: ['N5', 'verb', 'godan'], makeFsrs: initialFsrs, exposureCount: 0, productionCount: 0 },
  { surfaceForm: '高い', reading: 'たかい', meaning: 'tall; expensive', partOfSpeech: 'i-adjective', masteryState: 'unseen', cefrLevel: 'A1', tags: ['N5', 'adjective'], makeFsrs: initialFsrs, exposureCount: 0, productionCount: 0 },
  { surfaceForm: '安い', reading: 'やすい', meaning: 'cheap; inexpensive', partOfSpeech: 'i-adjective', masteryState: 'unseen', cefrLevel: 'A1', tags: ['N5', 'adjective'], makeFsrs: initialFsrs, exposureCount: 0, productionCount: 0 },
]

// ── Grammar Data (A1 Japanese) ──

interface GrammarSeed {
  patternId: string
  name: string
  description: string
  cefrLevel: string
  masteryState: string
  makeFsrs: () => FsrsState
}

const grammar: GrammarSeed[] = [
  { patternId: 'n5-te-form', name: 'て-form', description: 'Verb て-form used for requests, sequential actions, and connecting clauses', cefrLevel: 'A1', masteryState: 'apprentice_1', makeFsrs: apprentice1Fsrs },
  { patternId: 'n5-tai', name: 'たい-form', description: 'Express desire to do something (~たい)', cefrLevel: 'A1', masteryState: 'apprentice_1', makeFsrs: apprentice1Fsrs },
  { patternId: 'n5-nai', name: 'ない-form', description: 'Negative verb conjugation (~ない)', cefrLevel: 'A1', masteryState: 'apprentice_1', makeFsrs: apprentice1Fsrs },
  { patternId: 'n5-desu', name: 'です / だ copula', description: 'Basic copula for equative and descriptive sentences', cefrLevel: 'A1', masteryState: 'apprentice_2', makeFsrs: apprentice2Fsrs },
  { patternId: 'n5-particle-wa', name: 'は topic marker', description: 'Topic marker particle は', cefrLevel: 'A1', masteryState: 'apprentice_2', makeFsrs: apprentice2Fsrs },
  { patternId: 'n5-particle-ga', name: 'が subject marker', description: 'Subject marker particle が — marks the grammatical subject', cefrLevel: 'A1', masteryState: 'introduced', makeFsrs: initialFsrs },
  { patternId: 'n5-past-tense', name: 'Past tense (~た / ~ました)', description: 'Past tense conjugation for verbs and adjectives', cefrLevel: 'A1', masteryState: 'introduced', makeFsrs: initialFsrs },
  { patternId: 'n5-particle-ni', name: 'に particle (direction/time)', description: 'Particle に indicating direction, time, or indirect object', cefrLevel: 'A1', masteryState: 'unseen', makeFsrs: initialFsrs },
]

// ── Main Seed Function ──

async function main() {
  console.log('Seeding database...\n')

  // Clear existing data (order matters for foreign keys)
  await prisma.itemContextLog.deleteMany()
  await prisma.reviewEvent.deleteMany()
  await prisma.lexicalItem.deleteMany()
  await prisma.grammarItem.deleteMany()
  await prisma.conversationSession.deleteMany()
  await prisma.tomInference.deleteMany()
  await prisma.curriculumItem.deleteMany()
  await prisma.pragmaticProfile.deleteMany()
  await prisma.learnerProfile.deleteMany()
  await prisma.user.deleteMany()

  // 0. Create test user
  const user = await prisma.user.create({
    data: {
      id: TEST_USER_ID,
      email: 'test@linguist.dev',
      name: 'Test Learner',
      onboardingCompleted: true,
    },
  })
  console.log(`  User created (id=${user.id}, ${user.email})`)

  // 1. LearnerProfile
  const profile = await prisma.learnerProfile.create({
    data: {
      userId: TEST_USER_ID,
      targetLanguage: 'Japanese',
      nativeLanguage: 'English',
      selfReportedLevel: 'N5',
      dailyNewItemLimit: 10,
      targetRetention: 0.9,
      computedLevel: 'A1',
      comprehensionCeiling: 'A1',
      productionCeiling: 'A1',
    },
  })
  console.log(`  LearnerProfile created (id=${profile.id}, ${profile.targetLanguage})`)

  // 2. PragmaticProfile
  const pragmatic = await prisma.pragmaticProfile.create({
    data: {
      userId: TEST_USER_ID,
      preferredRegister: 'polite',
    },
  })
  console.log(`  PragmaticProfile created (id=${pragmatic.id})`)

  // 3. LexicalItems
  let vocabCounts: Record<string, number> = {}
  for (const v of vocabulary) {
    const fsrs = v.makeFsrs()
    await prisma.lexicalItem.create({
      data: {
        userId: TEST_USER_ID,
        surfaceForm: v.surfaceForm,
        reading: v.reading,
        meaning: v.meaning,
        partOfSpeech: v.partOfSpeech,
        masteryState: v.masteryState,
        recognitionFsrs: fsrs as unknown as Record<string, unknown>,
        productionFsrs: fsrs as unknown as Record<string, unknown>,
        tags: v.tags,
        cefrLevel: v.cefrLevel,
        source: 'seed',
        exposureCount: v.exposureCount,
        productionCount: v.productionCount,
        firstSeen: new Date(daysAgo(v.exposureCount > 0 ? v.exposureCount * 2 : 0)),
        lastReviewed: v.masteryState.startsWith('apprentice') || v.masteryState === 'journeyman'
          ? new Date(fsrs.last_review!)
          : undefined,
      },
    })
    vocabCounts[v.masteryState] = (vocabCounts[v.masteryState] || 0) + 1
  }
  console.log(`  LexicalItems created (${vocabulary.length} total):`)
  for (const [state, count] of Object.entries(vocabCounts)) {
    console.log(`    ${state}: ${count}`)
  }

  // 4. GrammarItems
  let grammarCounts: Record<string, number> = {}
  for (const g of grammar) {
    const fsrs = g.makeFsrs()
    await prisma.grammarItem.create({
      data: {
        userId: TEST_USER_ID,
        patternId: g.patternId,
        name: g.name,
        description: g.description,
        cefrLevel: g.cefrLevel,
        masteryState: g.masteryState,
        recognitionFsrs: fsrs as unknown as Record<string, unknown>,
        productionFsrs: fsrs as unknown as Record<string, unknown>,
        firstSeen: new Date(daysAgo(g.masteryState === 'unseen' ? 0 : 5)),
        lastReviewed: g.masteryState.startsWith('apprentice')
          ? new Date(fsrs.last_review!)
          : undefined,
      },
    })
    grammarCounts[g.masteryState] = (grammarCounts[g.masteryState] || 0) + 1
  }
  console.log(`  GrammarItems created (${grammar.length} total):`)
  for (const [state, count] of Object.entries(grammarCounts)) {
    console.log(`    ${state}: ${count}`)
  }

  const reviewableVocab = vocabulary.filter(v =>
    v.masteryState.startsWith('apprentice') || v.masteryState === 'journeyman'
  ).length
  const reviewableGrammar = grammar.filter(g =>
    g.masteryState.startsWith('apprentice')
  ).length

  console.log(`\nSeed complete!`)
  console.log(`  ${vocabulary.length} vocabulary items`)
  console.log(`  ${grammar.length} grammar items`)
  console.log(`  ${reviewableVocab + reviewableGrammar} items due for review`)
}

main()
  .catch((e) => {
    console.error('Seed failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
