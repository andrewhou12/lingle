export interface DictEntry {
  surface: string  // 食べる
  reading: string  // たべる
  meaning: string  // to eat
  pos: string      // verb
  freq: number     // frequency rank (lower = more common)
}

export interface DictionaryIndex {
  version: string
  entries: Record<string, DictEntry[]>  // keyed by reading (kana)
}
