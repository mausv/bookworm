import { and, eq, inArray, isNull } from 'drizzle-orm'
import { db } from '@/db'
import { book, highlight, loreEntry, vocabEntry } from '@/db/schema'

export function ownsBook(userId: string, bookId: string) {
  return (
    db
      .select({ id: book.id })
      .from(book)
      .where(and(eq(book.id, bookId), eq(book.userId, userId)))
      .get() !== undefined
  )
}

export function ownedHighlightIds(userId: string, ids: string[]) {
  if (!ids.length) return []
  return db
    .select({ id: highlight.id })
    .from(highlight)
    .innerJoin(book, eq(book.id, highlight.bookId))
    .where(and(eq(book.userId, userId), inArray(highlight.id, ids)))
    .all()
    .map((r) => r.id)
}

export function ownedVocabIds(userId: string, ids: string[]) {
  if (!ids.length) return []
  return db
    .select({ id: vocabEntry.id })
    .from(vocabEntry)
    .innerJoin(highlight, eq(highlight.id, vocabEntry.highlightId))
    .innerJoin(book, eq(book.id, highlight.bookId))
    .where(and(eq(book.userId, userId), inArray(vocabEntry.id, ids)))
    .all()
    .map((r) => r.id)
}

export function ownedLore(userId: string, loreId: string) {
  return db
    .select({ id: loreEntry.id, bookId: loreEntry.bookId })
    .from(loreEntry)
    .innerJoin(book, eq(book.id, loreEntry.bookId))
    .where(and(eq(book.userId, userId), eq(loreEntry.id, loreId)))
    .get()
}

const NO_CHAPTER = 'none'

export function chapterCondition(chapterId: string) {
  return chapterId === NO_CHAPTER ? isNull(highlight.chapterId) : eq(highlight.chapterId, chapterId)
}
