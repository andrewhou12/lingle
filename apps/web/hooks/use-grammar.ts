'use client'

import { useEffect, useState, useCallback } from 'react'
import { api } from '@/lib/api'

type GrammarEntry = Awaited<ReturnType<typeof api.grammarList>>[number]

export function useGrammar(initialFilters?: { masteryState?: string }) {
  const [items, setItems] = useState<GrammarEntry[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [filters, setFilters] = useState(initialFilters)

  const loadItems = useCallback(async () => {
    setIsLoading(true)
    try {
      const result = await api.grammarList(filters)
      setItems(result)
    } catch (err) {
      console.error('Failed to load grammar items:', err)
    }
    setIsLoading(false)
  }, [filters])

  useEffect(() => {
    loadItems()
  }, [loadItems])

  const search = useCallback(async (query: string) => {
    setIsLoading(true)
    try {
      const result = await api.grammarList({ ...filters, search: query })
      setItems(result)
    } catch (err) {
      console.error('Failed to search grammar items:', err)
    }
    setIsLoading(false)
  }, [filters])

  return { items, isLoading, filters, setFilters, search, reload: loadItems }
}
