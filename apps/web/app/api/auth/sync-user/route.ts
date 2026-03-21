import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@lingle/db'

/**
 * POST /api/auth/sync-user
 *
 * Called after client-side signInWithIdToken to upsert the user
 * in Prisma and return onboarding status.
 */
export async function POST() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()

  if (error || !user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  await prisma.user.upsert({
    where: { id: user.id },
    create: {
      id: user.id,
      email: user.email ?? null,
      name: user.user_metadata?.full_name ?? user.user_metadata?.name ?? null,
      avatarUrl: user.user_metadata?.avatar_url ?? null,
      updatedAt: new Date(),
    },
    update: {
      email: user.email ?? null,
      name: user.user_metadata?.full_name ?? user.user_metadata?.name ?? null,
      avatarUrl: user.user_metadata?.avatar_url ?? null,
    },
  })

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { onboardingComplete: true },
  })

  return NextResponse.json({
    onboardingCompleted: dbUser?.onboardingComplete ?? false,
  })
}
