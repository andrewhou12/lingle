'use client'

import { useEffect, useState, useCallback } from 'react'
import type { WordBankChunkEntry } from '@linguist/shared/types'
import { api } from '@/lib/api'

export function useChunks(initialFilters?: { masteryState?: string; itemKind?: string }) {
  const [items, setItems] = useState<WordBankChunkEntry[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [filters, setFilters] = useState(initialFilters)

  const loadItems = useCallback(async () => {
    setIsLoading(true)
    try {
      const result = await api.chunksList(filters)
      setItems(result)
    } catch (err) {
      console.error('Failed to load chunk items:', err)
    }
    setIsLoading(false)
  }, [filters])

  useEffect(() => {
    loadItems()
  }, [loadItems])

  const search = useCallback(async (query: string) => {
    setIsLoading(true)
    try {
      const result = await api.chunksList({ ...filters, search: query })
      setItems(result)
    } catch (err) {
      console.error('Failed to search chunk items:', err)
    }
    setIsLoading(false)
  }, [filters])

  return { items, isLoading, filters, setFilters, search, reload: loadItems }
}
