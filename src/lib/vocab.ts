import { and, asc, eq, inArray, isNull, or, type SQL } from 'drizzle-orm'
import { db } from '@/db'
import { book, chapter, highlight, vocabEntry } from '@/db/schema'
import { vocabTerm } from '@/importers/text'
import type { VocabStatus } from '@/shared/types'
import { page, type PageInput } from './page'

export function ensureVocab(highlightId: string) {
  const row = db
    .select({ text: highlight.text, note: highlight.note, language: book.language })
    .from(highlight)
    .innerJoin(book, eq(book.id, highlight.bookId))
    .where(eq(highlight.id, highlightId))
    .get()
  if (!row) return
  db.insert(vocabEntry)
    .values({
      highlightId,
      term: vocabTerm(row.text),
      definition: row.note,
      definitionBy: row.note ? 'me' : null,
      language: row.language,
    })
    .onConflictDoNothing()
    .run()
}

export interface VocabFilter extends PageInput {
  bookId?: string
  chapterId?: string
  status?: VocabStatus
  missingDefinition?: boolean
}

export const vocabColumns = {
  id: vocabEntry.id,
  highlightId: vocabEntry.highlightId,
  term: vocabEntry.term,
  definition: vocabEntry.definition,
  partOfSpeech: vocabEntry.partOfSpeech,
  language: vocabEntry.language,
  example: vocabEntry.example,
  status: vocabEntry.status,
  definitionBy: vocabEntry.definitionBy,
  context: highlight.text,
  note: highlight.note,
  bookId: highlight.bookId,
  bookTitle: book.title,
  chapterId: highlight.chapterId,
  chapter: chapter.title,
}

export function vocabConditions(filter: VocabFilter) {
  const conditions: SQL[] = [eq(highlight.type, 'vocab')]
  if (filter.bookId) conditions.push(eq(highlight.bookId, filter.bookId))
  if (filter.chapterId) conditions.push(eq(highlight.chapterId, filter.chapterId))
  if (filter.status) conditions.push(eq(vocabEntry.status, filter.status))
  if (filter.missingDefinition) {
    conditions.push(or(isNull(vocabEntry.definition), eq(vocabEntry.definition, '')) as SQL)
  }
  return and(...conditions)
}

export function listVocab(filter: VocabFilter = {}) {
  return page(filter, (limit, offset) =>
    db
      .select(vocabColumns)
      .from(vocabEntry)
      .innerJoin(highlight, eq(highlight.id, vocabEntry.highlightId))
      .innerJoin(book, eq(book.id, highlight.bookId))
      .leftJoin(chapter, eq(chapter.id, highlight.chapterId))
      .where(vocabConditions(filter))
      .orderBy(
        asc(book.title),
        asc(chapter.position),
        asc(highlight.locStart),
        asc(vocabEntry.term)
      )
      .limit(limit)
      .offset(offset)
      .all()
  )
}

export function getVocab(id: string) {
  return db
    .select(vocabColumns)
    .from(vocabEntry)
    .innerJoin(highlight, eq(highlight.id, vocabEntry.highlightId))
    .innerJoin(book, eq(book.id, highlight.bookId))
    .leftJoin(chapter, eq(chapter.id, highlight.chapterId))
    .where(eq(vocabEntry.id, id))
    .get()
}

export type VocabUpdate = Partial<
  Pick<
    typeof vocabEntry.$inferInsert,
    'term' | 'definition' | 'partOfSpeech' | 'language' | 'example' | 'status' | 'definitionBy'
  >
>

export function setVocabStatus(ids: string[], status: VocabStatus) {
  const { changes } = db.update(vocabEntry).set({ status }).where(inArray(vocabEntry.id, ids)).run()
  return { updated: changes }
}

export function updateVocab(id: string, values: VocabUpdate) {
  const { changes } = db.update(vocabEntry).set(values).where(eq(vocabEntry.id, id)).run()
  return changes ? { vocab: getVocab(id) } : { error: 'Vocab entry not found' }
}
