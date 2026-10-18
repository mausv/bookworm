import { describe, expect, it } from 'vitest'
import { setupTestDb } from '@/test/db'

const { db, schema, insertBook, insertHighlight } = await setupTestDb()
const { deleteBook, getBook, listBooks, updateBook } = await import('./books')

const book = insertBook({ title: 'Mistborn' })
const empty = insertBook({ title: 'Elantris' })
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
    expect(listBooks().map((b) => [b.title, b.counts])).toEqual([
      ['Elantris', { vocab: 0, quote: 0, lore: 0, unclassified: 0 }],
      ['Mistborn', { vocab: 2, quote: 0, lore: 1, unclassified: 0 }],
    ])
  })
})

describe('getBook', () => {
  it('returns chapters with counts and the unchaptered remainder', () => {
    expect(getBook(book.id)).toMatchObject({
      counts: { vocab: 2, lore: 1 },
      chapters: [{ title: 'Chapter 1', counts: { vocab: 2, lore: 0 } }],
      unchaptered: { lore: 1 },
      loreEntries: 0,
    })
  })

  it('returns undefined for a missing book', () => {
    expect(getBook('nope')).toBeUndefined()
  })
})

describe('updateBook and deleteBook', () => {
  it('updates fields', () => {
    expect(updateBook(empty.id, { language: 'es' }).book?.language).toBe('es')
    expect(updateBook('nope', { title: 'x' })).toEqual({ error: 'Book not found' })
  })

  it('deletes a book', () => {
    expect(deleteBook(empty.id)).toEqual({})
    expect(getBook(empty.id)).toBeUndefined()
  })
})
