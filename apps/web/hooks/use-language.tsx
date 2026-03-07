'use client'

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import { api } from '@/lib/api'

interface LanguageContextValue {
  targetLanguage: string
  nativeLanguage: string
  setTargetLanguage: (language: string) => Promise<void>
}

const LanguageContext = createContext<LanguageContextValue>({
  targetLanguage: 'Japanese',
  nativeLanguage: 'English',
  setTargetLanguage: async () => {},
})

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [targetLanguage, setLang] = useState('Japanese')
  const [nativeLanguage, setNativeLang] = useState('English')

  useEffect(() => {
    api.profileGet().then((profile) => {
      if (profile?.targetLanguage) setLang(profile.targetLanguage)
      if (profile?.nativeLanguage) setNativeLang(profile.nativeLanguage)
    }).catch(() => {})
  }, [])

  const setTargetLanguage = useCallback(async (language: string) => {
    try {
      await api.profilePatch({ targetLanguage: language })
      // State update after DB write so re-fetches read the new language
      setLang(language)
    } catch (err) {
      console.error('Failed to update language:', err)
    }
  }, [])

  return (
    <LanguageContext.Provider value={{ targetLanguage, nativeLanguage, setTargetLanguage }}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLanguage() {
  return useContext(LanguageContext)
}
