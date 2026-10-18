import { and, asc, eq, inArray, sql } from 'drizzle-orm'
import { db } from '@/db'
import { chapter, highlight, loreEntry, loreHighlight } from '@/db/schema'
import type { LoreKind } from '@/shared/types'

export function listLore(bookId: string, kind?: LoreKind) {
  const entries = db
    .select()
    .from(loreEntry)
    .where(and(eq(loreEntry.bookId, bookId), kind ? eq(loreEntry.kind, kind) : undefined))
    .orderBy(asc(loreEntry.kind), asc(loreEntry.name))
    .all()
  const links = entries.length
    ? db
        .select({
          loreId: loreHighlight.loreId,
          id: highlight.id,
          text: highlight.text,
          chapter: chapter.title,
          locStart: highlight.locStart,
        })
        .from(loreHighlight)
        .innerJoin(highlight, eq(highlight.id, loreHighlight.highlightId))
        .leftJoin(chapter, eq(chapter.id, highlight.chapterId))
        .where(
          inArray(
            loreHighlight.loreId,
            entries.map((e) => e.id)
          )
        )
        .orderBy(asc(chapter.position), asc(highlight.locStart))
        .all()
    : []
  return entries.map((e) => ({
    ...e,
    highlights: links.filter((l) => l.loreId === e.id).map(({ loreId, ...h }) => h),
  }))
}

export interface LoreInput {
  bookId: string
  name: string
  kind: LoreKind
  body?: string
  highlightIds?: string[]
}

function findByName(bookId: string, name: string) {
  return db
    .select()
    .from(loreEntry)
    .where(and(eq(loreEntry.bookId, bookId), sql`lower(${loreEntry.name}) = lower(${name})`))
    .get()
}

function link(loreId: string, bookId: string, highlightIds: string[]) {
  if (!highlightIds.length) return
  const valid = db
    .select({ id: highlight.id })
    .from(highlight)
    .where(and(eq(highlight.bookId, bookId), inArray(highlight.id, highlightIds)))
    .all()
  if (valid.length) {
    db.insert(loreHighlight)
      .values(valid.map(({ id }) => ({ loreId, highlightId: id })))
      .onConflictDoNothing()
      .run()
  }
}

export function upsertLore({ bookId, name, kind, body, highlightIds = [] }: LoreInput) {
  return db.transaction(() => {
    const existing = findByName(bookId, name.trim())
    const entry = existing
      ? db
          .update(loreEntry)
          .set({ kind, ...(body !== undefined && { body }) })
          .where(eq(loreEntry.id, existing.id))
          .returning()
          .get()
      : db
          .insert(loreEntry)
          .values({ bookId, name: name.trim(), kind, body: body ?? '' })
          .returning()
          .get()
    link(entry.id, bookId, highlightIds)
    return { lore: listLore(bookId).find((e) => e.id === entry.id), created: !existing }
  })
}

export function updateLore(
  id: string,
  values: Partial<Pick<typeof loreEntry.$inferInsert, 'name' | 'kind' | 'body'>>
) {
  const updated = db.update(loreEntry).set(values).where(eq(loreEntry.id, id)).returning().get()
  if (!updated) return { error: 'Lore entry not found' }
  return { lore: listLore(updated.bookId).find((e) => e.id === id) }
}

export function unlinkLoreHighlight(loreId: string, highlightId: string) {
  db.delete(loreHighlight)
    .where(and(eq(loreHighlight.loreId, loreId), eq(loreHighlight.highlightId, highlightId)))
    .run()
}

export function deleteLore(id: string) {
  const { changes } = db.delete(loreEntry).where(eq(loreEntry.id, id)).run()
  return changes ? {} : { error: 'Lore entry not found' }
}
