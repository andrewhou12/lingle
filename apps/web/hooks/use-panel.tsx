'use client'

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'

interface PanelState {
  isOpen: boolean
  toggle: () => void
  open: () => void
  close: () => void
}

const PanelContext = createContext<PanelState | null>(null)

export function PanelProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)

  const toggle = useCallback(() => setIsOpen((v) => !v), [])
  const open = useCallback(() => setIsOpen(true), [])
  const close = useCallback(() => setIsOpen(false), [])

  return (
    <PanelContext.Provider value={{ isOpen, toggle, open, close }}>
      {children}
    </PanelContext.Provider>
  )
}

export function usePanel(): PanelState {
  const ctx = useContext(PanelContext)
  if (!ctx) throw new Error('usePanel must be used within PanelProvider')
  return ctx
}
