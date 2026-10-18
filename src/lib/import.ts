import { and, eq } from 'drizzle-orm'
import { db } from '@/db'
import { book, chapter, highlight } from '@/db/schema'
import { clippings } from '@/importers/clippings'
import { kindleHtml } from '@/importers/kindle-html'
import { readest } from '@/importers/readest'
import { normalizeText } from '@/importers/text'
import type { Importer, ParsedBook, ParsedHighlight } from '@/importers/types'
import type { HighlightType, Source } from '@/shared/types'
import { ownsBook } from './access'
import { type ColorMap, getColorMap, typeForColor } from './colors'
import { getHighlight } from './highlights'
import { translateInBackground } from './translate'
import { ensureVocab } from './vocab'

export const importers: Importer[] = [kindleHtml, clippings, readest]

export interface BookImportResult {
  bookId: string
  title: string
  added: number
  updated: number
  unchanged: number
}

export function bookMatchKey(title: string, author?: string | null) {
  return `${normalizeText(title)}|${normalizeText(author ?? '')}`
}

export function dedupKey(h: Pick<ParsedHighlight, 'text' | 'locStart' | 'cfi' | 'page'>) {
  return `${normalizeText(h.text)}@${h.locStart ?? h.cfi ?? h.page ?? ''}`
}

function upsertBook(userId: string, parsed: Omit<ParsedBook, 'highlights'>, language?: string) {
  const matchKey = bookMatchKey(parsed.title, parsed.author)
  return (
    db
      .select()
      .from(book)
      .where(and(eq(book.userId, userId), eq(book.matchKey, matchKey)))
      .get() ??
    db
      .insert(book)
      .values({ userId, title: parsed.title, author: parsed.author, matchKey, language })
      .returning()
      .get()
  )
}

function chapterIds(bookId: string, titles: (string | undefined)[]) {
  const existing = db.select().from(chapter).where(eq(chapter.bookId, bookId)).all()
  const ids = new Map(existing.map((c) => [c.title, c.id]))
  let position = Math.max(-1, ...existing.map((c) => c.position)) + 1
  for (const title of titles) {
    if (!title || ids.has(title)) continue
    const { id } = db
      .insert(chapter)
      .values({ bookId, title, position: position++ })
      .returning({ id: chapter.id })
      .get()
    ids.set(title, id)
  }
  return ids
}

function importBook(
  userId: string,
  parsed: ParsedBook,
  source: Source,
  colors: ColorMap
): BookImportResult {
  const target = upsertBook(userId, parsed)
  const chapters = chapterIds(
    target.id,
    parsed.highlights.map((h) => h.chapter)
  )
  const result = { bookId: target.id, title: target.title, added: 0, updated: 0, unchanged: 0 }

  for (const h of parsed.highlights) {
    const key = dedupKey(h)
    const type = typeForColor(colors, h.color)
    const chapterId = h.chapter ? (chapters.get(h.chapter) ?? null) : null
    const existing = db
      .select()
      .from(highlight)
      .where(and(eq(highlight.bookId, target.id), eq(highlight.dedupKey, key)))
      .get()

    if (!existing) {
      const { id } = db
        .insert(highlight)
        .values({
          bookId: target.id,
          chapterId,
          text: h.text,
          dedupKey: key,
          type,
          color: h.color,
          source,
          locStart: h.locStart,
          locEnd: h.locEnd,
          page: h.page,
          cfi: h.cfi,
          note: h.note,
          highlightedAt: h.createdAt,
        })
        .returning({ id: highlight.id })
        .get()
      if (type === 'vocab') ensureVocab(id)
      result.added++
      continue
    }

    const patch = {
      ...(!existing.color && h.color && { color: h.color }),
      ...(existing.type === 'unclassified' && type !== 'unclassified' && { type }),
      ...(!existing.chapterId && chapterId && { chapterId }),
      ...(!existing.note && h.note && { note: h.note }),
      ...(!existing.page && h.page && { page: h.page }),
      ...(!existing.cfi && h.cfi && { cfi: h.cfi }),
      ...(!existing.highlightedAt && h.createdAt && { highlightedAt: h.createdAt }),
    }
    if (!Object.keys(patch).length) {
      result.unchanged++
      continue
    }
    db.update(highlight).set(patch).where(eq(highlight.id, existing.id)).run()
    if (patch.type === 'vocab') ensureVocab(existing.id)
    result.updated++
  }
  return result
}

export function importContent(userId: string, content: string, source?: Source) {
  const importer = source
    ? importers.find((i) => i.source === source)
    : importers.find((i) => i.detect(content))
  if (!importer) return { error: 'Unrecognized file format' }
  const parsed = importer.parse(content)
  if (!parsed.some((b) => b.highlights.length)) return { error: 'No highlights found in the file' }
  const colors = getColorMap(userId, importer.source)
  const result = db.transaction(() => ({
    source: importer.source,
    books: parsed
      .filter((b) => b.highlights.length)
      .map((b) => importBook(userId, b, importer.source, colors)),
  }))
  translateInBackground(
    userId,
    result.books.map((b) => b.bookId)
  )
  return result
}

export interface ManualHighlight {
  bookId?: string
  book?: { title: string; author?: string | null; language?: string }
  text: string
  type: HighlightType
  chapter?: string | null
  page?: string | null
  note?: string | null
}

export function addHighlight(userId: string, input: ManualHighlight) {
  if (input.bookId && !ownsBook(userId, input.bookId)) return { error: 'Book not found' }
  if (!input.bookId && !input.book) return { error: 'A book is required' }
  const result = db.transaction(() => {
    const bookId =
      input.bookId ??
      upsertBook(
        userId,
        { title: input.book?.title ?? '', author: input.book?.author ?? undefined },
        input.book?.language
      ).id
    const chapterId = input.chapter ? chapterIds(bookId, [input.chapter]).get(input.chapter) : null
    const key = dedupKey({ text: input.text, page: input.page ?? undefined })
    const existing = db
      .select({ id: highlight.id })
      .from(highlight)
      .where(and(eq(highlight.bookId, bookId), eq(highlight.dedupKey, key)))
      .get()
    const id =
      existing?.id ??
      db
        .insert(highlight)
        .values({
          bookId,
          chapterId,
          text: input.text,
          dedupKey: key,
          type: input.type,
          source: 'manual',
          page: input.page,
          note: input.note,
          highlightedAt: new Date(),
        })
        .returning({ id: highlight.id })
        .get().id
    if (!existing && input.type === 'vocab') ensureVocab(id)
    return { highlight: getHighlight(userId, id), created: !existing }
  })
  if (result.created && input.type === 'vocab' && result.highlight) {
    translateInBackground(userId, [result.highlight.bookId])
  }
  return result
}
