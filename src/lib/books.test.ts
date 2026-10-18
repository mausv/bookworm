import { describe, expect, it } from 'vitest'
import { setupTestDb } from '@/test/db'

const { db, schema, insertBook, insertHighlight, insertUser } = await setupTestDb()
const userId = insertUser().id
const { deleteBook, getBook, listBooks, updateBook } = await import('./books')

const book = insertBook(userId, { title: 'Mistborn' })
const empty = insertBook(userId, { title: 'Elantris' })
const chapter = db
  .insert(schema.chapter)
  .values({ bookId: book.id, title: 'Chapter 1', position: 0 })
  .returning()
  .get()
insertHighlight(book.id, { type: 'vocab', chapterId: chapter.id })
insertHighlight(book.id, { type: 'vocab', chapterId: chapter.id })
insertHighlight(book.id, { type: 'lore' })

describe('listBooks', () => {
  it('lists books by title with counts per type', () => {
    expect(listBooks(userId).map((b) => [b.title, b.counts])).toEqual([
      ['Elantris', { vocab: 0, quote: 0, lore: 0, unclassified: 0 }],
      ['Mistborn', { vocab: 2, quote: 0, lore: 1, unclassified: 0 }],
    ])
  })
})

describe('getBook', () => {
  it('returns chapters with counts and the unchaptered remainder', () => {
    expect(getBook(userId, book.id)).toMatchObject({
      counts: { vocab: 2, lore: 1 },
      chapters: [{ title: 'Chapter 1', counts: { vocab: 2, lore: 0 } }],
      unchaptered: { lore: 1 },
      loreEntries: 0,
    })
  })

  it('returns undefined for a missing book', () => {
    expect(getBook(userId, 'nope')).toBeUndefined()
  })
})

describe('updateBook and deleteBook', () => {
  it('updates fields', () => {
    expect(updateBook(userId, empty.id, { language: 'es' }).book?.language).toBe('es')
    expect(updateBook(userId, 'nope', { title: 'x' })).toEqual({ error: 'Book not found' })
  })

  it('deletes a book', () => {
    expect(deleteBook(userId, empty.id)).toEqual({})
    expect(getBook(userId, empty.id)).toBeUndefined()
  })
})
