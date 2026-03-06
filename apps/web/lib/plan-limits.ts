export const PLAN_LIMITS = {
  free: { dailyConversationSeconds: 10 * 60 }, // 10 minutes
  pro: { dailyConversationSeconds: Infinity },
} as const

export type PlanType = 'free' | 'pro'

export function getDailyLimitSeconds(plan: PlanType): number {
  return PLAN_LIMITS[plan].dailyConversationSeconds
}
