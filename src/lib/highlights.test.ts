import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { setupTestDb } from '@/test/db'

const { db, schema, insertBook, insertHighlight, insertUser } = await setupTestDb()
const userId = insertUser().id
const {
  addTags,
  classifyHighlights,
  deleteHighlight,
  getHighlight,
  listHighlights,
  listTags,
  updateHighlight,
} = await import('./highlights')

const book = insertBook(userId, { title: 'Mistborn' })
const other = insertBook(userId, { title: 'Elantris' })
const prologue = db
  .insert(schema.chapter)
  .values({ bookId: book.id, title: 'Prologue', position: 0 })
  .returning()
  .get()
const late = insertHighlight(book.id, { text: 'soot', locStart: 300, chapterId: prologue.id })
const early = insertHighlight(book.id, { text: 'ruddy', locStart: 160, chapterId: prologue.id })
const loose = insertHighlight(book.id, { text: 'unchaptered words here', locStart: 10 })
const elsewhere = insertHighlight(other.id, { text: 'Shaod 100% real', type: 'lore' })

describe('listHighlights', () => {
  it('orders a book by chapter then location, unchaptered last', () => {
    expect(listHighlights(userId, { bookId: book.id }).items.map((h) => h.text)).toEqual([
      'ruddy',
      'soot',
      'unchaptered words here',
    ])
  })

  it('filters by type and chapter', () => {
    expect(listHighlights(userId, { type: 'lore' }).items.map((h) => h.id)).toEqual([elsewhere.id])
    expect(listHighlights(userId, { chapterId: prologue.id }).items).toHaveLength(2)
  })

  it('searches text and notes, treating % literally', () => {
    expect(listHighlights(userId, { q: '100%' }).items.map((h) => h.id)).toEqual([elsewhere.id])
    expect(listHighlights(userId, { q: '0%r' }).items).toEqual([])
    updateHighlight(userId, late.id, { note: 'ash from the sky' })
    expect(listHighlights(userId, { q: 'ASH' }).items.map((h) => h.id)).toEqual([late.id])
  })

  it('paginates with a cursor', () => {
    const first = listHighlights(userId, { bookId: book.id, limit: 2 })
    expect(first.items).toHaveLength(2)
    const second = listHighlights(userId, { bookId: book.id, limit: 2, cursor: first.nextCursor })
    expect(second.items.map((h) => h.text)).toEqual(['unchaptered words here'])
    expect(second.nextCursor).toBeNull()
  })

  it('suggests a type only for unclassified highlights', () => {
    const items = listHighlights(userId, { bookId: book.id }).items
    expect(items.find((h) => h.text === 'ruddy')?.suggestedType).toBe('vocab')
    expect(listHighlights(userId, { type: 'lore' }).items[0].suggestedType).toBeNull()
  })
})

describe('updateHighlight', () => {
  it('creates a vocab entry when classified as vocab', () => {
    updateHighlight(userId, early.id, { type: 'vocab' })
    expect(getHighlight(userId, early.id)?.vocabId).toEqual(expect.any(String))
  })

  it('keeps the vocab entry when reclassified away and back', () => {
    const vocabId = getHighlight(userId, early.id)?.vocabId
    updateHighlight(userId, early.id, { type: 'quote' })
    updateHighlight(userId, early.id, { type: 'vocab' })
    expect(getHighlight(userId, early.id)?.vocabId).toBe(vocabId)
  })

  it('replaces tags, normalized', () => {
    updateHighlight(userId, loose.id, { tags: ['Ash', 'ash ', 'skaa'] })
    expect(getHighlight(userId, loose.id)?.tags.sort()).toEqual(['ash', 'skaa'])
    updateHighlight(userId, loose.id, { tags: ['ash'] })
    expect(getHighlight(userId, loose.id)?.tags).toEqual(['ash'])
  })

  it('reports a missing highlight', () => {
    expect(updateHighlight(userId, 'nope', { note: 'x' })).toEqual({ error: 'Highlight not found' })
    expect(updateHighlight(userId, 'nope', { tags: [] })).toEqual({ error: 'Highlight not found' })
  })
})

describe('classifyHighlights and addTags', () => {
  it('classifies several highlights at once', () => {
    expect(classifyHighlights(userId, [late.id, loose.id], 'vocab')).toEqual({ updated: 2 })
    expect(getHighlight(userId, late.id)?.vocabId).toEqual(expect.any(String))
  })

  it('adds tags without removing existing ones and filters by tag', () => {
    addTags(userId, [loose.id, elsewhere.id], ['Magic'])
    expect(getHighlight(userId, loose.id)?.tags.sort()).toEqual(['ash', 'magic'])
    expect(listHighlights(userId, { tag: 'magic' }).items).toHaveLength(2)
    expect(listTags(userId, book.id)).toEqual([
      { tag: 'ash', count: 1 },
      { tag: 'magic', count: 1 },
    ])
  })
})

describe('deleteHighlight', () => {
  it('removes it with its tags', () => {
    expect(deleteHighlight(userId, loose.id)).toEqual({})
    expect(
      db
        .select()
        .from(schema.highlightTag)
        .where(eq(schema.highlightTag.highlightId, loose.id))
        .all()
    ).toEqual([])
    expect(deleteHighlight(userId, loose.id)).toEqual({ error: 'Highlight not found' })
  })
})
