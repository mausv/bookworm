import { and, asc, eq, sql } from 'drizzle-orm'
import { db } from '@/db'
import { book, chapter, highlight, loreEntry } from '@/db/schema'
import { HIGHLIGHT_TYPES, type HighlightType } from '@/shared/types'

export type TypeCounts = Record<HighlightType, number>

function emptyCounts(): TypeCounts {
  return { vocab: 0, quote: 0, lore: 0, unclassified: 0 }
}

function countsBy<K extends string>(rows: { key: K | null; type: HighlightType; count: number }[]) {
  const counts = new Map<K | null, TypeCounts>()
  for (const { key, type, count } of rows) {
    const entry = counts.get(key) ?? emptyCounts()
    entry[type] = count
    counts.set(key, entry)
  }
  return counts
}

const missingDefinitions = sql<number>`(
  select count(*) from vocab_entry v where v.book_id = book.id
  and (v.definition is null or v.definition = '')
  and exists (select 1 from highlight h where h.vocab_id = v.id and h.type = 'vocab')
)`

const missingExplanations = sql<number>`(
  select count(*) from highlight h where h.book_id = book.id and h.type = 'quote'
  and (h.explanation is null or h.explanation = '')
)`

function selectWithMissing() {
  return db
    .select({ book, definitions: missingDefinitions, explanations: missingExplanations })
    .from(book)
}

function owned(userId: string, id: string) {
  return and(eq(book.id, id), eq(book.userId, userId))
}

export function listBooks(userId: string) {
  const books = selectWithMissing().where(eq(book.userId, userId)).orderBy(asc(book.title)).all()
  const counts = countsBy(
    db
      .select({ key: highlight.bookId, type: highlight.type, count: sql<number>`count(*)` })
      .from(highlight)
      .innerJoin(book, eq(book.id, highlight.bookId))
      .where(eq(book.userId, userId))
      .groupBy(highlight.bookId, highlight.type)
      .all()
  )
  return books.map(({ book: b, definitions, explanations }) => ({
    ...b,
    counts: counts.get(b.id) ?? emptyCounts(),
    missing: { definitions, explanations },
  }))
}

export function getBook(userId: string, id: string) {
  const row = selectWithMissing().where(owned(userId, id)).get()
  if (!row) return undefined
  const { book: found, definitions, explanations } = row
  const counts = countsBy(
    db
      .select({ key: highlight.chapterId, type: highlight.type, count: sql<number>`count(*)` })
      .from(highlight)
      .where(eq(highlight.bookId, id))
      .groupBy(highlight.chapterId, highlight.type)
      .all()
  )
  const chapters = db
    .select()
    .from(chapter)
    .where(eq(chapter.bookId, id))
    .orderBy(asc(chapter.position))
    .all()
    .map((c) => ({ ...c, counts: counts.get(c.id) ?? emptyCounts() }))
  const total = emptyCounts()
  for (const c of counts.values()) for (const t of HIGHLIGHT_TYPES) total[t] += c[t]
  const lore = db
    .select({ count: sql<number>`count(*)` })
    .from(loreEntry)
    .where(eq(loreEntry.bookId, id))
    .get()
  return {
    ...found,
    counts: total,
    missing: { definitions, explanations },
    loreEntries: lore?.count ?? 0,
    chapters,
    unchaptered: counts.get(null) ?? emptyCounts(),
  }
}

export type BookUpdate = Partial<Pick<typeof book.$inferInsert, 'title' | 'author' | 'language'>>

export function updateBook(userId: string, id: string, values: BookUpdate) {
  const { changes } = db.update(book).set(values).where(owned(userId, id)).run()
  return changes ? { book: getBook(userId, id) } : { error: 'Book not found' }
}

export function deleteBook(userId: string, id: string) {
  const { changes } = db.delete(book).where(owned(userId, id)).run()
  return changes ? {} : { error: 'Book not found' }
}
