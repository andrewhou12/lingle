'use client'

import { useCallback, useMemo, useSyncExternalStore } from 'react'

const PREFIX = 'lingle_onboarding_'

const HINT_IDS = [
  'welcome_card',
  'hint_suggestions',
  'hint_voice_toggle',
  'hint_sidebar',
  'hint_chat_tools',
  'hint_chat_suggestions',
  'hint_voice_spacebar',
  'hint_voice_subtitles',
  'hint_voice_feedback',
] as const

export type HintId = (typeof HINT_IDS)[number]

// Simple pub/sub so multiple components re-render when state changes
let listeners: Array<() => void> = []
function subscribe(cb: () => void) {
  listeners.push(cb)
  return () => {
    listeners = listeners.filter((l) => l !== cb)
  }
}
function emitChange() {
  for (const l of listeners) l()
}

function getSnapshot() {
  // Return a serialized string of all onboarding keys so React detects changes
  return HINT_IDS.map((id) => localStorage.getItem(PREFIX + id) ?? '').join(',')
}

function getServerSnapshot() {
  return HINT_IDS.map(() => '').join(',')
}

export function useOnboarding() {
  // Subscribe to changes across components
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  // Derive isFirstVisit from the snapshot so server and client agree during hydration.
  // Server snapshot is all empty strings → isFirstVisit = true (same as a first-visit client).
  const isFirstVisit = useMemo(() => {
    const values = snapshot.split(',')
    const idx = HINT_IDS.indexOf('welcome_card')
    return !values[idx]
  }, [snapshot])

  const isDismissed = useCallback((id: HintId): boolean => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem(PREFIX + id) === '1'
  }, [])

  const dismiss = useCallback((id: HintId) => {
    localStorage.setItem(PREFIX + id, '1')
    emitChange()
  }, [])

  const dismissAll = useCallback(() => {
    for (const id of HINT_IDS) {
      localStorage.setItem(PREFIX + id, '1')
    }
    emitChange()
  }, [])

  return { isDismissed, dismiss, dismissAll, isFirstVisit }
}
