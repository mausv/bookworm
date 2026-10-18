import { and, eq } from 'drizzle-orm'
import { db } from '@/db'
import { book, chapter, highlight } from '@/db/schema'
import { clippings } from '@/importers/clippings'
import { kindleHtml } from '@/importers/kindle-html'
import { readest } from '@/importers/readest'
import { normalizeText } from '@/importers/text'
import type { Importer, ParsedBook, ParsedHighlight } from '@/importers/types'
import type { Source } from '@/shared/types'
import { type ColorMap, getColorMap, typeForColor } from './colors'
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

function upsertBook(userId: string, parsed: ParsedBook) {
  const matchKey = bookMatchKey(parsed.title, parsed.author)
  return (
    db
      .select()
      .from(book)
      .where(and(eq(book.userId, userId), eq(book.matchKey, matchKey)))
      .get() ??
    db
      .insert(book)
      .values({ userId, title: parsed.title, author: parsed.author, matchKey })
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
  return db.transaction(() => ({
    source: importer.source,
    books: parsed
      .filter((b) => b.highlights.length)
      .map((b) => importBook(userId, b, importer.source, colors)),
  }))
}
