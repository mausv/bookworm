import { and, asc, eq, inArray, sql } from 'drizzle-orm'
import { db } from '@/db'
import { chapter, highlight, loreEntry, loreHighlight } from '@/db/schema'
import type { LoreKind } from '@/shared/types'
import { ownedLore, ownsBook } from './access'

function entriesOf(bookId: string, kind?: LoreKind) {
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

export function listLore(userId: string, bookId: string, kind?: LoreKind) {
  return ownsBook(userId, bookId) ? entriesOf(bookId, kind) : []
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

function entryOf(bookId: string, id: string) {
  return entriesOf(bookId).find((e) => e.id === id)
}

export function upsertLore(
  userId: string,
  { bookId, name, kind, body, highlightIds = [] }: LoreInput
) {
  if (!ownsBook(userId, bookId)) return { error: 'Book not found' }
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
    return { lore: entryOf(bookId, entry.id), created: !existing }
  })
}

export function updateLore(
  userId: string,
  id: string,
  values: Partial<Pick<typeof loreEntry.$inferInsert, 'name' | 'kind' | 'body'>>
) {
  const owned = ownedLore(userId, id)
  if (!owned) return { error: 'Lore entry not found' }
  db.update(loreEntry).set(values).where(eq(loreEntry.id, id)).run()
  return { lore: entryOf(owned.bookId, id) }
}

export function unlinkLoreHighlight(userId: string, loreId: string, highlightId: string) {
  if (!ownedLore(userId, loreId)) return { error: 'Lore entry not found' }
  db.delete(loreHighlight)
    .where(and(eq(loreHighlight.loreId, loreId), eq(loreHighlight.highlightId, highlightId)))
    .run()
  return {}
}

export function deleteLore(userId: string, id: string) {
  if (!ownedLore(userId, id)) return { error: 'Lore entry not found' }
  db.delete(loreEntry).where(eq(loreEntry.id, id)).run()
  return {}
}
