import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const TEST_USER_ID = 'seed-test-user-001'

async function main() {
  console.log('Seeding database...\n')

  // Clear existing data (order matters for foreign keys)
  await prisma.errorLog.deleteMany()
  await prisma.errorPattern.deleteMany()
  await prisma.vocabularyItem.deleteMany()
  await prisma.lesson.deleteMany()
  await prisma.learnerModel.deleteMany()
  await prisma.dailyUsage.deleteMany()
  await prisma.subscription.deleteMany()
  await prisma.user.deleteMany()

  // Create test user
  const user = await prisma.user.create({
    data: {
      id: TEST_USER_ID,
      email: 'test@lingle.ai',
      name: 'Test Learner',
      onboardingComplete: true,
      targetLanguage: 'ja',
      nativeLanguage: 'en',
      correctionStyle: 'recast',
      lessonStylePreference: 'conversational',
      sessionLengthMinutes: 30,
      sessionsPerWeek: 2,
    },
  })
  console.log(`  User created (id=${user.id}, ${user.email})`)

  // Create learner model
  const learnerModel = await prisma.learnerModel.create({
    data: {
      userId: TEST_USER_ID,
      cefrGrammar: 2.0,
      cefrFluency: 2.0,
      sessionsCompleted: 0,
    },
  })
  console.log(`  LearnerModel created (id=${learnerModel.id}, grammar=${learnerModel.cefrGrammar}, fluency=${learnerModel.cefrFluency})`)

  console.log(`\nSeed complete!`)
}

main()
  .catch((e) => {
    console.error('Seed failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
