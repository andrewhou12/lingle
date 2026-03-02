'use client'

import { useState, useCallback } from 'react'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Search, Play } from 'lucide-react'
import { useWordbank } from '@/hooks/use-wordbank'
import { useGrammar } from '@/hooks/use-grammar'
import { useChunks } from '@/hooks/use-chunks'
import { Skeleton } from '@/components/skeleton'
import { MasteryState } from '@lingle/shared/types'
import type { WordBankEntry, WordBankChunkEntry, FsrsState } from '@lingle/shared/types'
import { MASTERY_COLORS, MASTERY_LABELS } from '@/constants/mastery'
import { api } from '@/lib/api'

const MASTERY_BADGE_STYLES: Record<string, { bg: string; color: string }> = {
  unseen: { bg: 'bg-bg-secondary', color: 'text-text-muted' },
  introduced: { bg: 'bg-[rgba(59,130,246,.08)]', color: 'text-[#3b82f6]' },
  apprentice_1: { bg: 'bg-[rgba(245,158,11,.08)]', color: 'text-[#f59e0b]' },
  apprentice_2: { bg: 'bg-[rgba(245,158,11,.08)]', color: 'text-[#f59e0b]' },
  apprentice_3: { bg: 'bg-[rgba(245,158,11,.08)]', color: 'text-[#f59e0b]' },
  apprentice_4: { bg: 'bg-[rgba(245,158,11,.08)]', color: 'text-[#f59e0b]' },
  journeyman: { bg: 'bg-[rgba(22,163,106,.08)]', color: 'text-[#16a34a]' },
  expert: { bg: 'bg-[rgba(139,92,246,.08)]', color: 'text-[#8b5cf6]' },
  master: { bg: 'bg-[rgba(200,87,42,.07)]', color: 'text-accent-warm' },
  burned: { bg: 'bg-bg-active', color: 'text-text-secondary' },
}

function MasteryBadge({ state }: { state: string }) {
  const style = MASTERY_BADGE_STYLES[state] ?? { bg: 'bg-bg-secondary', color: 'text-text-muted' }
  return (
    <span className={`inline-flex items-center py-0.5 px-2 rounded-full text-[11px] font-medium ${style.bg} ${style.color}`}>
      {MASTERY_LABELS[state] ?? state}
    </span>
  )
}

function formatDueDate(fsrs: FsrsState): string {
  const due = new Date(fsrs.due)
  const now = new Date()
  const diffMs = due.getTime() - now.getTime()
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24))
  if (diffDays < 0) return `${Math.abs(diffDays)}d overdue`
  if (diffDays === 0) return 'Due now'
  if (diffDays === 1) return 'Tomorrow'
  return `In ${diffDays}d`
}

function MasteryFilter({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger>
        <SelectValue placeholder="Filter by mastery" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All states</SelectItem>
        <SelectSeparator />
        <SelectItem value="unseen">Unseen</SelectItem>
        <SelectItem value="introduced">Introduced</SelectItem>
        <SelectItem value="apprentice_1">Apprentice 1</SelectItem>
        <SelectItem value="apprentice_2">Apprentice 2</SelectItem>
        <SelectItem value="apprentice_3">Apprentice 3</SelectItem>
        <SelectItem value="apprentice_4">Apprentice 4</SelectItem>
        <SelectItem value="journeyman">Journeyman</SelectItem>
        <SelectItem value="expert">Expert</SelectItem>
        <SelectItem value="master">Master</SelectItem>
        <SelectItem value="burned">Burned</SelectItem>
      </SelectContent>
    </Select>
  )
}

function LoadingSkeleton() {
  return (
    <div className="flex flex-col gap-3 mt-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex gap-4 items-center">
          <Skeleton width={80} height={16} />
          <Skeleton width={60} height={16} />
          <Skeleton width={140} height={16} />
          <Skeleton width={70} height={20} borderRadius={10} />
          <Skeleton width={60} height={16} />
        </div>
      ))}
    </div>
  )
}

// Vocabulary Tab

function VocabularyTab() {
  const { items, isLoading, search, reload, setFilters } = useWordbank()
  const [searchQuery, setSearchQuery] = useState('')
  const [masteryFilter, setMasteryFilter] = useState('all')
  const [expandedId, setExpandedId] = useState<number | null>(null)

  const handleSearch = (value: string) => {
    setSearchQuery(value)
    if (value.trim()) search(value.trim())
    else reload()
  }

  const handleMasteryFilter = (value: string) => {
    setMasteryFilter(value)
    setSearchQuery('')
    if (value === 'all') setFilters(undefined)
    else setFilters({ masteryState: value as MasteryState })
  }

  const handlePromote = useCallback(async (id: number) => {
    try {
      await api.wordbankPromote(id)
      reload()
    } catch (err) {
      console.error('Failed to promote item:', err)
    }
  }, [reload])

  if (isLoading && items.length === 0) return <LoadingSkeleton />

  return (
    <>
      <div className="flex gap-3 mb-4 items-center">
        <div className="relative flex items-center flex-1 max-w-[400px]">
          <Search size={16} className="absolute left-3 text-text-muted" />
          <Input
            placeholder="Search by word, reading, or meaning..."
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <MasteryFilter value={masteryFilter} onChange={handleMasteryFilter} />
        <span className="text-[13px] text-text-muted">{items.length} items</span>
      </div>

      {items.length === 0 ? (
        <p className="text-text-muted">No items found.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Word</TableHead>
              <TableHead>Reading</TableHead>
              <TableHead>Meaning</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Mastery</TableHead>
              <TableHead>Recognition</TableHead>
              <TableHead>Production</TableHead>
              <TableHead>Stability</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <>
                <TableRow
                  key={item.id}
                  onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}
                  className="cursor-pointer"
                >
                  <TableCell><span className="font-medium text-[15px]">{item.surfaceForm}</span></TableCell>
                  <TableCell><span className="text-[13px] text-text-muted">{item.reading ?? '—'}</span></TableCell>
                  <TableCell><span className="text-[13px]">{item.meaning}</span></TableCell>
                  <TableCell><span className="text-[11px] text-text-muted">{item.partOfSpeech ?? '—'}</span></TableCell>
                  <TableCell><MasteryBadge state={item.masteryState} /></TableCell>
                  <TableCell>
                    <span className="text-[11px] text-text-muted">
                      {item.masteryState === 'unseen' || item.masteryState === 'introduced' ? '—' : formatDueDate(item.recognitionFsrs)}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="text-[11px] text-text-muted">
                      {item.masteryState === 'unseen' || item.masteryState === 'introduced' ? '—' : formatDueDate(item.productionFsrs)}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="text-[11px] text-text-muted">
                      {item.recognitionFsrs.stability > 0 ? `${Math.round(item.recognitionFsrs.stability)}d` : '—'}
                    </span>
                  </TableCell>
                </TableRow>
                {expandedId === item.id && (
                  <TableRow key={`${item.id}-detail`}>
                    <TableCell colSpan={8}>
                      <ItemDetail item={item} onPromote={handlePromote} />
                    </TableCell>
                  </TableRow>
                )}
              </>
            ))}
          </TableBody>
        </Table>
      )}
    </>
  )
}

function ItemDetail({ item, onPromote }: { item: WordBankEntry; onPromote: (id: number) => void }) {
  const canPromote = item.masteryState === 'unseen' || item.masteryState === 'introduced'
  return (
    <div className="flex gap-4 py-2 flex-wrap">
      <div className="flex flex-col gap-1">
        <span className="text-[11px] text-text-muted">First seen</span>
        <span className="text-[13px]">{new Date(item.firstSeen).toLocaleDateString()}</span>
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-[11px] text-text-muted">Exposures</span>
        <span className="text-[13px]">{item.exposureCount}</span>
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-[11px] text-text-muted">Productions</span>
        <span className="text-[13px]">{item.productionCount}</span>
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-[11px] text-text-muted">Rec. Stability</span>
        <span className="text-[13px]">{item.recognitionFsrs.stability > 0 ? `${item.recognitionFsrs.stability.toFixed(1)}d` : '—'}</span>
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-[11px] text-text-muted">Prod. Stability</span>
        <span className="text-[13px]">{item.productionFsrs.stability > 0 ? `${item.productionFsrs.stability.toFixed(1)}d` : '—'}</span>
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-[11px] text-text-muted">Difficulty</span>
        <span className="text-[13px]">{item.recognitionFsrs.difficulty > 0 ? item.recognitionFsrs.difficulty.toFixed(1) : '—'}</span>
      </div>
      {item.tags.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="text-[11px] text-text-muted">Tags</span>
          <div className="flex gap-1">
            {item.tags.map((t) => (
              <span key={t} className="inline-flex items-center rounded-full border border-border py-0.5 px-2 text-[11px] text-text-secondary">{t}</span>
            ))}
          </div>
        </div>
      )}
      {canPromote && (
        <button
          className="inline-flex items-center gap-1 rounded-md bg-bg-secondary py-1.5 px-3 text-[11px] font-medium text-text-secondary border-none cursor-pointer transition-colors duration-150 hover:bg-bg-hover"
          onClick={() => onPromote(item.id)}
        >
          <Play size={12} />
          Start Practicing
        </button>
      )}
    </div>
  )
}

// Grammar Tab

function GrammarTab() {
  const { items, isLoading, search, reload, setFilters } = useGrammar()
  const [searchQuery, setSearchQuery] = useState('')
  const [masteryFilter, setMasteryFilter] = useState('all')

  const handleSearch = (value: string) => {
    setSearchQuery(value)
    if (value.trim()) search(value.trim())
    else reload()
  }

  const handleMasteryFilter = (value: string) => {
    setMasteryFilter(value)
    setSearchQuery('')
    if (value === 'all') setFilters(undefined)
    else setFilters({ masteryState: value })
  }

  const handlePromote = useCallback(async (id: number) => {
    try {
      await api.grammarPromote(id)
      reload()
    } catch (err) {
      console.error('Failed to promote grammar item:', err)
    }
  }, [reload])

  if (isLoading && items.length === 0) return <LoadingSkeleton />

  return (
    <>
      <div className="flex gap-3 mb-4 items-center">
        <div className="relative flex items-center flex-1 max-w-[400px]">
          <Search size={16} className="absolute left-3 text-text-muted" />
          <Input
            placeholder="Search by pattern or name..."
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <MasteryFilter value={masteryFilter} onChange={handleMasteryFilter} />
        <span className="text-[13px] text-text-muted">{items.length} items</span>
      </div>

      {items.length === 0 ? (
        <p className="text-text-muted">No grammar items found.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Pattern</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Level</TableHead>
              <TableHead>Mastery</TableHead>
              <TableHead>Contexts</TableHead>
              <TableHead>Prod. Weight</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => {
              const canPromote = item.masteryState === 'unseen' || item.masteryState === 'introduced'
              return (
                <TableRow key={item.id}>
                  <TableCell><span className="font-medium text-[13px]">{item.patternId}</span></TableCell>
                  <TableCell><span className="text-[13px]">{item.name}</span></TableCell>
                  <TableCell><span className="text-[11px] text-text-muted">{item.cefrLevel ?? '—'}</span></TableCell>
                  <TableCell><MasteryBadge state={item.masteryState} /></TableCell>
                  <TableCell><span className="text-[11px] text-text-muted">{item.contextCount}</span></TableCell>
                  <TableCell><span className="text-[11px] text-text-muted">{item.productionWeight.toFixed(1)}</span></TableCell>
                  <TableCell>
                    {canPromote && (
                      <button
                        className="p-1.5 rounded-md text-text-muted bg-transparent border-none cursor-pointer transition-colors duration-150 hover:bg-bg-hover"
                        onClick={() => handlePromote(item.id)}
                      >
                        <Play size={12} />
                      </button>
                    )}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      )}
    </>
  )
}

// Phrases Tab

const KIND_STYLES: Record<string, { bg: string; color: string }> = {
  collocation: { bg: 'bg-[rgba(59,130,246,.08)]', color: 'text-[#3b82f6]' },
  chunk: { bg: 'bg-[rgba(22,163,106,.08)]', color: 'text-[#16a34a]' },
  pragmatic_formula: { bg: 'bg-[rgba(139,92,246,.08)]', color: 'text-[#8b5cf6]' },
}

function PhrasesTab() {
  const { items, isLoading, search, reload, setFilters } = useChunks()
  const [searchQuery, setSearchQuery] = useState('')
  const [masteryFilter, setMasteryFilter] = useState('all')
  const [kindFilter, setKindFilter] = useState('all')

  const handleSearch = (value: string) => {
    setSearchQuery(value)
    if (value.trim()) search(value.trim())
    else reload()
  }

  const handleMasteryFilter = (value: string) => {
    setMasteryFilter(value)
    setSearchQuery('')
    const f: Record<string, string | undefined> = {}
    if (value !== 'all') f.masteryState = value
    if (kindFilter !== 'all') f.itemKind = kindFilter
    setFilters(Object.keys(f).length > 0 ? f : undefined)
  }

  const handleKindFilter = (value: string) => {
    setKindFilter(value)
    setSearchQuery('')
    const f: Record<string, string | undefined> = {}
    if (masteryFilter !== 'all') f.masteryState = masteryFilter
    if (value !== 'all') f.itemKind = value
    setFilters(Object.keys(f).length > 0 ? f : undefined)
  }

  if (isLoading && items.length === 0) return <LoadingSkeleton />

  const kindLabels: Record<string, string> = {
    collocation: 'Collocation',
    chunk: 'Chunk',
    pragmatic_formula: 'Pragmatic',
  }

  return (
    <>
      <div className="flex gap-3 mb-4 items-center">
        <div className="relative flex items-center flex-1 max-w-[400px]">
          <Search size={16} className="absolute left-3 text-text-muted" />
          <Input
            placeholder="Search phrases..."
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <MasteryFilter value={masteryFilter} onChange={handleMasteryFilter} />
        <Select value={kindFilter} onValueChange={handleKindFilter}>
          <SelectTrigger>
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            <SelectSeparator />
            <SelectItem value="collocation">Collocations</SelectItem>
            <SelectItem value="chunk">Chunks</SelectItem>
            <SelectItem value="pragmatic_formula">Pragmatic</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-[13px] text-text-muted">{items.length} items</span>
      </div>

      {items.length === 0 ? (
        <p className="text-text-muted">No phrases found.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Phrase</TableHead>
              <TableHead>Reading</TableHead>
              <TableHead>Meaning</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Register</TableHead>
              <TableHead>Mastery</TableHead>
              <TableHead>Level</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => {
              const kindStyle = KIND_STYLES[item.itemKind] ?? { bg: 'bg-bg-secondary', color: 'text-text-secondary' }
              return (
                <TableRow key={item.id}>
                  <TableCell><span className="font-medium text-[15px]">{item.phrase}</span></TableCell>
                  <TableCell><span className="text-[13px] text-text-muted">{item.reading ?? '—'}</span></TableCell>
                  <TableCell><span className="text-[13px]">{item.meaning}</span></TableCell>
                  <TableCell>
                    <span className={`inline-flex items-center rounded-full py-0.5 px-2 text-[11px] font-medium ${kindStyle.bg} ${kindStyle.color}`}>
                      {kindLabels[item.itemKind] ?? item.itemKind}
                    </span>
                  </TableCell>
                  <TableCell><span className="text-[11px] text-text-muted">{item.register ?? '—'}</span></TableCell>
                  <TableCell><MasteryBadge state={item.masteryState} /></TableCell>
                  <TableCell><span className="text-[11px] text-text-muted">{item.cefrLevel ?? '—'}</span></TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      )}
    </>
  )
}

// Main Page

export default function KnowledgePage() {
  return (
    <div>
      <h1 className="text-[28px] font-bold mb-4">Knowledge Base</h1>

      <Tabs defaultValue="vocabulary">
        <TabsList className="mb-4">
          <TabsTrigger value="vocabulary">Vocabulary</TabsTrigger>
          <TabsTrigger value="grammar">Grammar</TabsTrigger>
          <TabsTrigger value="phrases">Phrases</TabsTrigger>
        </TabsList>

        <TabsContent value="vocabulary">
          <VocabularyTab />
        </TabsContent>
        <TabsContent value="grammar">
          <GrammarTab />
        </TabsContent>
        <TabsContent value="phrases">
          <PhrasesTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}
