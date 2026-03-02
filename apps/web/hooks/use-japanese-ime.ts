'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { toKana, toKatakana } from 'wanakana'
import * as dict from '@/lib/kana-dictionary'
import type { DictEntry } from '@/lib/kana-dictionary'

/**
 * Apple-style Japanese IME state machine with auto-segmentation:
 *
 *   DIRECT  ──(type letter)──▶  COMPOSING   (kana/auto-kanji, highlighted)
 *   COMPOSING ──(Space)──▶      SELECTING   (candidate popup opens)
 *   COMPOSING ──(Enter)──▶      DIRECT      (commit text, Enter consumed)
 *   COMPOSING ──(Escape)──▶     revert to kana / cancel
 *   COMPOSING ──(type more)──▶  COMPOSING   (extend, auto-segment updates)
 *   SELECTING ──(Space/↓)──▶   SELECTING   (next candidate)
 *   SELECTING ──(↑)──▶         SELECTING   (prev candidate)
 *   SELECTING ──(Enter)──▶     DIRECT      (commit selected, Enter consumed)
 *   SELECTING ──(1-9)──▶       DIRECT      (quick-select, commit)
 *   SELECTING ──(Escape)──▶    COMPOSING   (close popup, revert to kana)
 *   SELECTING ──(type)──▶      COMPOSING   (commit selected, start new word)
 *
 * Auto-segmentation: as you type, the kana is segmented into words and
 * each word is auto-converted to the best kanji match. Hiragana-preferred
 * words (particles, greetings) stay as kana. Conjugated forms (わからない)
 * are de-conjugated to find the base kanji and reconstructed.
 *
 * Shift+letter produces katakana (e.g. KARAOKE → カラオケ).
 */

export type IMEMode = 'direct' | 'composing' | 'selecting'

export interface UseJapaneseIMEReturn {
  imeActive: boolean
  toggleIME: () => void
  mode: IMEMode
  compositionBuffer: string
  compositionDisplay: string
  composedText: string
  compositionStart: number
  candidates: DictEntry[]
  selectedIndex: number
  showCandidates: boolean
  katakanaMode: boolean
  toggleKatakana: () => void
  suggestion: string
  handleKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => boolean
  insertText: (textarea: HTMLTextAreaElement, text: string) => void
  reset: () => void
}

const IME_STORAGE_KEY = 'lingle-ime-active'

function getStoredIMEState(): boolean {
  if (typeof window === 'undefined') return false
  const stored = localStorage.getItem(IME_STORAGE_KEY)
  // Default to active — this is a Japanese learning app
  return stored === null ? true : stored === 'true'
}

/** Auto-convert kana using segmentation — handles multi-word, conjugation, hiragana-preferred */
function autoConvert(kana: string): string | null {
  if (!kana || kana.length < 2) return null
  // Don't auto-convert if there's only trailing unconverted romaji
  const clean = kana.replace(/[a-zA-Z]+$/, '')
  if (!clean) return null

  const { text } = dict.autoSegment(kana)
  // If the segmented result is the same as the input, no conversion happened
  if (text === kana) return null
  return text
}

export function useJapaneseIME(
  value: string,
  onChange: (value: string) => void
): UseJapaneseIMEReturn {
  const [imeActive, setImeActive] = useState(getStoredIMEState)
  const [mode, setMode] = useState<IMEMode>('direct')
  const [compositionBuffer, setCompositionBuffer] = useState('')
  const [candidates, setCandidates] = useState<DictEntry[]>([])
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [katakanaMode, setKatakanaMode] = useState(false)
  const [composedText, setComposedText] = useState('')
  const [compositionStart, setCompositionStart] = useState(-1)
  const [suggestion, setSuggestion] = useState('')

  const preRef = useRef('')
  const postRef = useRef('')

  // Load dictionary when IME activates
  useEffect(() => {
    if (imeActive && !dict.isLoaded()) {
      dict.load()
    }
  }, [imeActive])

  /** Kana conversion of the current buffer */
  const compositionDisplay = compositionBuffer
    ? katakanaMode
      ? toKatakana(compositionBuffer, { IMEMode: true })
      : toKana(compositionBuffer, { IMEMode: true })
    : ''

  /** Update the textarea value with new text at the composition slot */
  const updateValue = useCallback(
    (text: string, textarea?: HTMLTextAreaElement) => {
      setComposedText(text)
      const newValue = preRef.current + text + postRef.current
      onChange(newValue)
      if (textarea) {
        const pos = preRef.current.length + text.length
        requestAnimationFrame(() => {
          textarea.selectionStart = pos
          textarea.selectionEnd = pos
        })
      }
    },
    [onChange]
  )

  /** Commit the current composed text — replace kana with suggestion (kanji) in textarea */
  const commitCurrent = useCallback((textarea?: HTMLTextAreaElement) => {
    const textToCommit = suggestion || composedText
    preRef.current += textToCommit
    const newValue = preRef.current + postRef.current
    onChange(newValue)
    if (textarea) {
      const pos = preRef.current.length
      requestAnimationFrame(() => {
        textarea.selectionStart = pos
        textarea.selectionEnd = pos
      })
    }
    setSuggestion('')
    setComposedText('')
    setCompositionStart(-1)
    setCompositionBuffer('')
    setCandidates([])
    setSelectedIndex(0)
    setMode('direct')
  }, [suggestion, composedText, onChange])

  const reset = useCallback(() => {
    setMode('direct')
    setCompositionBuffer('')
    setCandidates([])
    setSelectedIndex(0)
    setComposedText('')
    setSuggestion('')
    setCompositionStart(-1)
    preRef.current = ''
    postRef.current = ''
  }, [])

  const toggleIME = useCallback(() => {
    setImeActive((prev) => {
      const next = !prev
      localStorage.setItem(IME_STORAGE_KEY, String(next))
      if (!next && compositionBuffer) {
        // Turning off mid-composition — commit suggestion (kanji) or kana
        const textToCommit = suggestion || composedText
        preRef.current += textToCommit
        onChange(preRef.current + postRef.current)
        setSuggestion('')
        setComposedText('')
        setCompositionStart(-1)
        setCompositionBuffer('')
        setCandidates([])
        setMode('direct')
      }
      return next
    })
  }, [compositionBuffer, composedText, suggestion, onChange])

  const toggleKatakana = useCallback(() => {
    setKatakanaMode((prev) => !prev)
  }, [])

  const insertText = useCallback(
    (textarea: HTMLTextAreaElement, text: string) => {
      updateValue(text, textarea)
    },
    [updateValue]
  )

  /** Build the candidate list for the selecting popup */
  const buildCandidateList = useCallback(
    (kana: string): DictEntry[] => {
      const results = dict.composingLookup(kana)

      // Add hiragana option if not already present
      if (!results.some((r) => r.surface === kana)) {
        results.push({ surface: kana, reading: kana, meaning: '(hiragana)', pos: '', freq: 99998 })
      }

      // Add katakana option
      const kata = toKatakana(kana)
      if (kata !== kana && !results.some((r) => r.surface === kata)) {
        results.push({ surface: kata, reading: kana, meaning: '(katakana)', pos: '', freq: 99999 })
      }

      return results
    },
    []
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>): boolean => {
      if (!imeActive) return false

      const textarea = e.currentTarget

      // Ctrl+Space / Cmd+Space toggle
      if (e.key === ' ' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault()
        toggleIME()
        return true
      }

      // ─── Cmd/Ctrl+Backspace → delete entire composition ──────────
      if (e.key === 'Backspace' && (e.ctrlKey || e.metaKey) && mode !== 'direct') {
        e.preventDefault()
        const newValue = preRef.current + postRef.current
        onChange(newValue)
        const pos = preRef.current.length
        requestAnimationFrame(() => {
          textarea.selectionStart = pos
          textarea.selectionEnd = pos
        })
        reset()
        return true
      }

      // ─── SELECTING MODE ────────────────────────────────────────
      if (mode === 'selecting') {
        // Enter → commit selected candidate (consume Enter — don't send)
        if (e.key === 'Enter') {
          e.preventDefault()
          commitCurrent(textarea)
          return true
        }

        // Space or ArrowDown → next candidate
        if (e.key === ' ' || e.key === 'ArrowDown') {
          e.preventDefault()
          const nextIdx = Math.min(selectedIndex + 1, candidates.length - 1)
          setSelectedIndex(nextIdx)
          setSuggestion(candidates[nextIdx].surface)
          return true
        }

        // ArrowUp → previous candidate
        if (e.key === 'ArrowUp') {
          e.preventDefault()
          const prevIdx = Math.max(selectedIndex - 1, 0)
          setSelectedIndex(prevIdx)
          setSuggestion(candidates[prevIdx].surface)
          return true
        }

        // Number keys 1-9 → quick select and commit
        if (e.key >= '1' && e.key <= '9') {
          const idx = parseInt(e.key) - 1
          if (idx < candidates.length) {
            e.preventDefault()
            // Commit candidate — replace kana with candidate in value
            preRef.current += candidates[idx].surface
            const newValue = preRef.current + postRef.current
            onChange(newValue)
            const pos = preRef.current.length
            requestAnimationFrame(() => {
              textarea.selectionStart = pos
              textarea.selectionEnd = pos
            })
            setSuggestion('')
            setComposedText('')
            setCompositionStart(-1)
            setCompositionBuffer('')
            setCandidates([])
            setSelectedIndex(0)
            setMode('direct')
            return true
          }
        }

        // Escape → close popup, back to composing (kana already in textarea)
        if (e.key === 'Escape') {
          e.preventDefault()
          setCandidates([])
          setSelectedIndex(0)
          // Restore auto-conversion suggestion
          setSuggestion(autoConvert(compositionDisplay) || '')
          setMode('composing')
          return true
        }

        // Backspace → close popup, back to composing (kana already in textarea)
        if (e.key === 'Backspace') {
          e.preventDefault()
          setCandidates([])
          setSelectedIndex(0)
          setSuggestion(autoConvert(compositionDisplay) || '')
          setMode('composing')
          return true
        }

        // Typing a letter → commit current selection, start new composition
        if (e.key.length === 1 && /^[a-zA-Z]$/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
          e.preventDefault()
          // Commit suggestion (kanji) or kana
          const textToCommit = suggestion || composedText
          preRef.current += textToCommit
          setCandidates([])
          setSelectedIndex(0)

          // Start new composition — kana in textarea, kanji in suggestion
          const char = e.key.toLowerCase()
          const useKata = katakanaMode || e.shiftKey
          const newBuffer = char
          setCompositionBuffer(newBuffer)
          setCompositionStart(preRef.current.length)

          const display = useKata
            ? toKatakana(newBuffer, { IMEMode: true })
            : toKana(newBuffer, { IMEMode: true })
          const converted = autoConvert(display)
          updateValue(display, textarea)
          setSuggestion(converted || '')
          setMode('composing')
          return true
        }

        return false
      }

      // ─── COMPOSING MODE ────────────────────────────────────────
      if (mode === 'composing') {
        // Enter → commit composed text (consume Enter so message doesn't send)
        if (e.key === 'Enter') {
          e.preventDefault()
          commitCurrent(textarea)
          return true
        }

        // Space → open candidate list for the last segment (or full composition)
        if (e.key === ' ') {
          e.preventDefault()
          const kana = compositionDisplay.replace(/[a-zA-Z]+$/, '')
          if (!kana) return true

          // For multi-word compositions, get candidates for the last segment
          const { segments } = dict.autoSegment(kana)
          const lastSegment = segments.length > 0 ? segments[segments.length - 1] : null
          const lookupKana = lastSegment ? lastSegment.kana : kana

          const list = buildCandidateList(lookupKana)
          setCandidates(list)

          // If auto-converted, highlight matching candidate; otherwise first
          const currentDisplay = lastSegment ? lastSegment.converted : (suggestion || composedText)
          const currentIdx = list.findIndex((c) => c.surface === currentDisplay)
          const startIdx = currentIdx >= 0 ? currentIdx : 0
          setSelectedIndex(startIdx)

          if (lastSegment && segments.length > 1) {
            // Commit all segments except the last, then show candidates for last
            const committedPart = segments.slice(0, -1).map(s => s.converted).join('')
            preRef.current += committedPart
            setCompositionStart(preRef.current.length)
            setCompositionBuffer(lastSegment.kana) // approximate — just the kana of last segment
            updateValue(lastSegment.kana, textarea)   // kana in textarea
            setSuggestion(list[startIdx].surface)      // candidate floats above
          } else {
            updateValue(kana, textarea)                // clean kana in textarea
            setSuggestion(list[startIdx].surface)      // candidate floats above
          }
          setMode('selecting')
          return true
        }

        // Escape → clear suggestion (if present) or cancel composition
        if (e.key === 'Escape') {
          e.preventDefault()
          if (suggestion) {
            // Clear suggestion — kana stays in textarea
            setSuggestion('')
          } else {
            // Cancel composition entirely
            const newValue = preRef.current + postRef.current
            onChange(newValue)
            const pos = preRef.current.length
            requestAnimationFrame(() => {
              textarea.selectionStart = pos
              textarea.selectionEnd = pos
            })
            reset()
          }
          return true
        }

        // Backspace → remove last char from buffer
        if (e.key === 'Backspace') {
          e.preventDefault()
          if (compositionBuffer.length > 1) {
            const newBuffer = compositionBuffer.slice(0, -1)
            setCompositionBuffer(newBuffer)
            const useKata = katakanaMode
            const display = useKata
              ? toKatakana(newBuffer, { IMEMode: true })
              : toKana(newBuffer, { IMEMode: true })
            const converted = autoConvert(display)
            updateValue(display, textarea)         // kana in textarea
            setSuggestion(converted || '')          // kanji suggestion
          } else {
            // Buffer empty → cancel composition
            const newValue = preRef.current + postRef.current
            onChange(newValue)
            const pos = preRef.current.length
            requestAnimationFrame(() => {
              textarea.selectionStart = pos
              textarea.selectionEnd = pos
            })
            reset()
          }
          return true
        }

        // ArrowDown → if there are dictionary matches, open candidate list
        if (e.key === 'ArrowDown') {
          e.preventDefault()
          const kana = compositionDisplay.replace(/[a-zA-Z]+$/, '')
          if (!kana) return true

          const { segments } = dict.autoSegment(kana)
          const lastSegment = segments.length > 0 ? segments[segments.length - 1] : null
          const lookupKana = lastSegment ? lastSegment.kana : kana

          const list = buildCandidateList(lookupKana)
          if (list.length > 0) {
            setCandidates(list)
            const currentDisplay = lastSegment ? lastSegment.converted : (suggestion || composedText)
            const currentIdx = list.findIndex((c) => c.surface === currentDisplay)
            const startIdx = currentIdx >= 0 ? currentIdx : 0
            setSelectedIndex(startIdx)

            if (lastSegment && segments.length > 1) {
              const committedPart = segments.slice(0, -1).map(s => s.converted).join('')
              preRef.current += committedPart
              setCompositionStart(preRef.current.length)
              setCompositionBuffer(lastSegment.kana)
              updateValue(lastSegment.kana, textarea)   // kana in textarea
              setSuggestion(list[startIdx].surface)      // candidate floats above
            } else {
              updateValue(kana, textarea)                // clean kana in textarea
              setSuggestion(list[startIdx].surface)      // candidate floats above
            }
            setMode('selecting')
          }
          return true
        }
      }

      // ─── ROMAJI INPUT (DIRECT or extending COMPOSING) ─────────
      if (e.key.length === 1 && /^[a-zA-Z]$/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault()
        const char = e.key.toLowerCase()
        const useKata = katakanaMode || e.shiftKey

        if (mode === 'direct') {
          // Start new composition
          const cursorPos = textarea.selectionStart
          preRef.current = value.slice(0, cursorPos)
          postRef.current = value.slice(cursorPos)
          setCompositionStart(cursorPos)
        }

        const newBuffer = (mode === 'composing' ? compositionBuffer : '') + char
        setCompositionBuffer(newBuffer)

        const display = useKata
          ? toKatakana(newBuffer, { IMEMode: true })
          : toKana(newBuffer, { IMEMode: true })

        const converted = autoConvert(display)
        updateValue(display, textarea)          // kana in textarea
        setSuggestion(converted || '')           // kanji suggestion floats above
        setMode('composing')
        return true
      }

      // Non-romaji character while composing → commit and insert character
      if (mode === 'composing' && e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
        e.preventDefault()
        const textToCommit = suggestion || composedText
        preRef.current += textToCommit + e.key
        onChange(preRef.current + postRef.current)
        const pos = preRef.current.length
        requestAnimationFrame(() => {
          textarea.selectionStart = pos
          textarea.selectionEnd = pos
        })
        setSuggestion('')
        setComposedText('')
        setCompositionStart(-1)
        setCompositionBuffer('')
        setCandidates([])
        setSelectedIndex(0)
        setMode('direct')
        return true
      }

      return false
    },
    [
      imeActive, mode, compositionBuffer, compositionDisplay, composedText,
      suggestion, candidates, selectedIndex, katakanaMode, value, onChange,
      updateValue, commitCurrent, reset, toggleIME, buildCandidateList,
    ]
  )

  return {
    imeActive,
    toggleIME,
    mode,
    compositionBuffer,
    compositionDisplay,
    composedText,
    compositionStart,
    suggestion,
    candidates,
    selectedIndex,
    showCandidates: mode === 'selecting',
    katakanaMode,
    toggleKatakana,
    handleKeyDown,
    insertText,
    reset,
  }
}
