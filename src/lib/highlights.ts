import { and, asc, desc, eq, gte, inArray, sql, type SQL } from 'drizzle-orm'
import { db } from '@/db'
import { book, chapter, highlight, highlightTag } from '@/db/schema'
import { suggestType } from '@/importers/text'
import type { HighlightType } from '@/shared/types'
import { chapterCondition, ownedHighlightIds } from './access'
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
  vocabId: highlight.vocabId,
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
}

export function listHighlights(userId: string, filter: HighlightFilter = {}) {
  const conditions: SQL[] = [eq(book.userId, userId)]
  if (filter.bookId) conditions.push(eq(highlight.bookId, filter.bookId))
  if (filter.chapterId) conditions.push(chapterCondition(filter.chapterId))
  if (filter.type) conditions.push(eq(highlight.type, filter.type))
  if (filter.since) conditions.push(gte(highlight.createdAt, filter.since))
  if (filter.q) {
    const pattern = `%${escapeLike(filter.q)}%`
    conditions.push(
      sql`(${highlight.text} like ${pattern} escape '\\' or ${highlight.note} like ${pattern} escape '\\')`
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
    ? [
        sql`${chapter.position} is null`,
        asc(chapter.position),
        asc(highlight.locStart),
        asc(highlight.highlightedAt),
      ]
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

export function getHighlight(userId: string, id: string) {
  const row = select()
    .where(and(eq(highlight.id, id), eq(book.userId, userId)))
    .get()
  return row && withTags([row])[0]
}

export interface HighlightUpdate {
  type?: HighlightType
  note?: string | null
  text?: string
  chapterId?: string | null
  tags?: string[]
}

export function updateHighlight(userId: string, id: string, { tags, ...values }: HighlightUpdate) {
  if (!ownedHighlightIds(userId, [id]).length) return { error: 'Highlight not found' }
  return db.transaction(() => {
    if (Object.keys(values).length) {
      db.update(highlight).set(values).where(eq(highlight.id, id)).run()
    }
    if (values.type === 'vocab') ensureVocab(id)
    if (tags) {
      db.delete(highlightTag).where(eq(highlightTag.highlightId, id)).run()
      addTags(userId, [id], tags)
    }
    return { highlight: getHighlight(userId, id) }
  })
}

export function addNote(userId: string, id: string, note: string) {
  const found = getHighlight(userId, id)
  if (!found) return { error: 'Highlight not found' }
  return updateHighlight(userId, id, { note: found.note ? `${found.note}\n\n${note}` : note })
}

export function classifyHighlights(userId: string, ids: string[], type: HighlightType) {
  const owned = ownedHighlightIds(userId, ids)
  if (!owned.length) return { updated: 0 }
  return db.transaction(() => {
    const { changes } = db.update(highlight).set({ type }).where(inArray(highlight.id, owned)).run()
    if (type === 'vocab') owned.forEach(ensureVocab)
    return { updated: changes }
  })
}

export function normalizeTags(tags: string[]) {
  return [...new Set(tags.map((t) => t.trim().toLowerCase()).filter(Boolean))]
}

export function addTags(userId: string, ids: string[], tags: string[]) {
  const owned = ownedHighlightIds(userId, ids)
  const values = owned.flatMap((id) => normalizeTags(tags).map((tag) => ({ highlightId: id, tag })))
  if (values.length) db.insert(highlightTag).values(values).onConflictDoNothing().run()
  return { tagged: owned.length }
}

export function deleteHighlight(userId: string, id: string) {
  if (!ownedHighlightIds(userId, [id]).length) return { error: 'Highlight not found' }
  db.delete(highlight).where(eq(highlight.id, id)).run()
  return {}
}

export function listTags(userId: string, bookId?: string) {
  return db
    .select({ tag: highlightTag.tag, count: sql<number>`count(*)` })
    .from(highlightTag)
    .innerJoin(highlight, eq(highlight.id, highlightTag.highlightId))
    .innerJoin(book, eq(book.id, highlight.bookId))
    .where(and(eq(book.userId, userId), bookId ? eq(highlight.bookId, bookId) : undefined))
    .groupBy(highlightTag.tag)
    .orderBy(asc(highlightTag.tag))
    .all()
}
