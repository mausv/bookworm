import type { listApiKeys } from '@/lib/api-keys'
import type { getBook, listBooks } from '@/lib/books'
import type { listColorMappings } from '@/lib/colors'
import type { getHighlight } from '@/lib/highlights'
import type { studySummary } from '@/lib/history'
import type { BookImportResult } from '@/lib/import'
import type { listLore } from '@/lib/lore'
import type { listConnectedClients } from '@/lib/oauth'
import type { buildMatch } from '@/lib/quiz'
import type { getVocab, listVocab } from '@/lib/vocab'
import type { Source, VocabStatus } from '@/shared/types'

type Json<T> = T extends Date
  ? string
  : T extends (infer U)[]
    ? Json<U>[]
    : T extends object
      ? { [K in keyof T]: Json<T[K]> }
      : T

export type Book = Json<ReturnType<typeof listBooks>[number]>
export type StudySummary = Json<ReturnType<typeof studySummary>>
export type MatchCard = Json<ReturnType<typeof buildMatch>[number]>
export type BookDetail = Json<NonNullable<ReturnType<typeof getBook>>>
export type Chapter = BookDetail['chapters'][number]
export type TypeCounts = Book['counts']
export type Highlight = Json<NonNullable<ReturnType<typeof getHighlight>>>
export type Vocab = Json<ReturnType<typeof listVocab>['items'][number]>
export type VocabDetail = Json<NonNullable<ReturnType<typeof getVocab>>>
export type Lore = Json<ReturnType<typeof listLore>[number]>
export type ColorMapping = Json<ReturnType<typeof listColorMappings>[number]>
export type ApiKey = Json<ReturnType<typeof listApiKeys>[number]>
export type Connection = Json<ReturnType<typeof listConnectedClients>[number]>

export interface Page<T> {
  items: T[]
  nextCursor: string | null
}

export type ImportResult =
  { file: string; source: Source; books: BookImportResult[] } | { file: string; error: string }

export interface ImportResponse {
  results: ImportResult[]
}

export type QuizMode = 'choice' | 'typed' | 'mixed'

export interface QuizQuestion {
  vocabId: string
  mode: 'choice' | 'typed'
  direction: 'term' | 'definition'
  prompt: string
  context: string | null
  options: string[] | null
}

export interface QuizAnswer {
  correct: boolean
  close: boolean
  expected: string
  status: VocabStatus
  examples: string[]
  synonyms: string | null
  antonyms: string | null
}
