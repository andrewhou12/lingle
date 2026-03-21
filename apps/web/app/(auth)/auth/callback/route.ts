import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@lingle/db'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/dashboard'

  if (code) {
    const supabase = await createClient()
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error && data.user) {
      await prisma.user.upsert({
        where: { id: data.user.id },
        create: {
          id: data.user.id,
          email: data.user.email ?? null,
          name: data.user.user_metadata?.full_name ?? data.user.user_metadata?.name ?? null,
          avatarUrl: data.user.user_metadata?.avatar_url ?? null,
          updatedAt: new Date(),
        },
        update: {
          email: data.user.email ?? null,
          name: data.user.user_metadata?.full_name ?? data.user.user_metadata?.name ?? null,
          avatarUrl: data.user.user_metadata?.avatar_url ?? null,
        },
      })

      // Check if user has completed onboarding
      const user = await prisma.user.findUnique({
        where: { id: data.user.id },
        select: { onboardingComplete: true },
      })

      if (!user?.onboardingComplete) {
        return NextResponse.redirect(`${origin}/onboarding`)
      }

      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  // Auth failed — redirect to sign-in with error
  return NextResponse.redirect(`${origin}/sign-in?error=auth_failed`)
}
