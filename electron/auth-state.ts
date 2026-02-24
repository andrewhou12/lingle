let currentUserId: string | null = null

export function setCurrentUserId(id: string | null): void {
  currentUserId = id
}

export function getCurrentUserId(): string {
  if (!currentUserId) throw new Error('No authenticated user')
  return currentUserId
}

export function hasCurrentUser(): boolean {
  return currentUserId !== null
}
