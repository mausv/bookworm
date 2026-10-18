import { and, asc, desc, eq, gte, inArray, or, sql, type SQL } from 'drizzle-orm'
import { db } from '@/db'
import { book, chapter, highlight, highlightTag, vocabEntry } from '@/db/schema'
import { suggestType } from '@/importers/text'
import type { HighlightType } from '@/shared/types'
import { page, type PageInput } from './page'
import { ensureVocab } from './vocab'

export interface HighlightFilter extends PageInput {
  bookId?: string
  chapterId?: string
  type?: HighlightType
  q?: string
  tag?: string
  since?: Date
}

const columns = {
  id: highlight.id,
  bookId: highlight.bookId,
  bookTitle: book.title,
  chapterId: highlight.chapterId,
  chapter: chapter.title,
  text: highlight.text,
  type: highlight.type,
  color: highlight.color,
  source: highlight.source,
  note: highlight.note,
  locStart: highlight.locStart,
  page: highlight.page,
  highlightedAt: highlight.highlightedAt,
  createdAt: highlight.createdAt,
  vocabId: vocabEntry.id,
}

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`)
}

function withTags<T extends { id: string; type: HighlightType; text: string }>(rows: T[]) {
  const ids = rows.map((r) => r.id)
  const tags = ids.length
    ? db.select().from(highlightTag).where(inArray(highlightTag.highlightId, ids)).all()
    : []
  return rows.map((r) => ({
    ...r,
    tags: tags.filter((t) => t.highlightId === r.id).map((t) => t.tag),
    suggestedType: r.type === 'unclassified' ? suggestType(r.text) : null,
  }))
}

function select() {
  return db
    .select(columns)
    .from(highlight)
    .innerJoin(book, eq(book.id, highlight.bookId))
    .leftJoin(chapter, eq(chapter.id, highlight.chapterId))
    .leftJoin(vocabEntry, eq(vocabEntry.highlightId, highlight.id))
}

export function listHighlights(filter: HighlightFilter = {}) {
  const conditions: SQL[] = []
  if (filter.bookId) conditions.push(eq(highlight.bookId, filter.bookId))
  if (filter.chapterId) conditions.push(eq(highlight.chapterId, filter.chapterId))
  if (filter.type) conditions.push(eq(highlight.type, filter.type))
  if (filter.since) conditions.push(gte(highlight.createdAt, filter.since))
  if (filter.q) {
    const pattern = `%${escapeLike(filter.q)}%`
    conditions.push(
      or(
        sql`${highlight.text} like ${pattern} escape '\\'`,
        sql`${highlight.note} like ${pattern} escape '\\'`
      ) as SQL
    )
  }
  if (filter.tag) {
    conditions.push(
      inArray(
        highlight.id,
        db
          .select({ id: highlightTag.highlightId })
          .from(highlightTag)
          .where(eq(highlightTag.tag, filter.tag))
      )
    )
  }
  const order = filter.bookId
    ? [sql`${chapter.position} is null`, asc(chapter.position), asc(highlight.locStart)]
    : [desc(highlight.createdAt)]

  const result = page(filter, (limit, offset) =>
    select()
      .where(and(...conditions))
      .orderBy(...order, asc(highlight.id))
      .limit(limit)
      .offset(offset)
      .all()
  )
  return { ...result, items: withTags(result.items) }
}

export function getHighlight(id: string) {
  const row = select().where(eq(highlight.id, id)).get()
  return row && withTags([row])[0]
}

export interface HighlightUpdate {
  type?: HighlightType
  note?: string | null
  text?: string
  chapterId?: string | null
  tags?: string[]
}

export function updateHighlight(id: string, { tags, ...values }: HighlightUpdate) {
  return db.transaction(() => {
    if (Object.keys(values).length) {
      const { changes } = db.update(highlight).set(values).where(eq(highlight.id, id)).run()
      if (!changes) return { error: 'Highlight not found' }
    } else if (!db.select({ id: highlight.id }).from(highlight).where(eq(highlight.id, id)).get()) {
      return { error: 'Highlight not found' }
    }
    if (values.type === 'vocab') ensureVocab(id)
    if (tags) {
      db.delete(highlightTag).where(eq(highlightTag.highlightId, id)).run()
      addTags([id], tags)
    }
    return { highlight: getHighlight(id) }
  })
}

export function addNote(id: string, note: string) {
  const found = db
    .select({ note: highlight.note })
    .from(highlight)
    .where(eq(highlight.id, id))
    .get()
  if (!found) return { error: 'Highlight not found' }
  return updateHighlight(id, { note: found.note ? `${found.note}\n\n${note}` : note })
}

export function classifyHighlights(ids: string[], type: HighlightType) {
  return db.transaction(() => {
    const { changes } = db.update(highlight).set({ type }).where(inArray(highlight.id, ids)).run()
    if (type === 'vocab') ids.forEach(ensureVocab)
    return { updated: changes }
  })
}

export function normalizeTags(tags: string[]) {
  return [...new Set(tags.map((t) => t.trim().toLowerCase()).filter(Boolean))]
}

export function addTags(ids: string[], tags: string[]) {
  const existing = db
    .select({ id: highlight.id })
    .from(highlight)
    .where(inArray(highlight.id, ids))
    .all()
  const values = existing.flatMap(({ id }) =>
    normalizeTags(tags).map((tag) => ({ highlightId: id, tag }))
  )
  if (values.length) db.insert(highlightTag).values(values).onConflictDoNothing().run()
  return { tagged: existing.length }
}

export function deleteHighlight(id: string) {
  const { changes } = db.delete(highlight).where(eq(highlight.id, id)).run()
  return changes ? {} : { error: 'Highlight not found' }
}

export function listTags(bookId?: string) {
  return db
    .select({ tag: highlightTag.tag, count: sql<number>`count(*)` })
    .from(highlightTag)
    .innerJoin(highlight, eq(highlight.id, highlightTag.highlightId))
    .where(bookId ? eq(highlight.bookId, bookId) : undefined)
    .groupBy(highlightTag.tag)
    .orderBy(asc(highlightTag.tag))
    .all()
}
