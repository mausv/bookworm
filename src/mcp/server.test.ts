import fs from 'node:fs'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { setupTestDb } from '@/test/db'

await setupTestDb()
const { importContent } = await import('@/lib/import')
const { upsertLore } = await import('@/lib/lore')
const { createMcpServer } = await import('./server')

const fixture = (name: string) =>
  fs.readFileSync(new URL(`../importers/fixtures/${name}`, import.meta.url), 'utf8')
importContent(fixture('kindle-notebook.html'))

const client = new Client({ name: 'test', version: '1.0.0' })
const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
await createMcpServer().connect(serverTransport)
await client.connect(clientTransport)

const item = z.looseObject({ id: z.string() })
const named = item.extend({ title: z.string() })
const list = z.object({ items: z.array(item), nextCursor: z.string().nullable() })
const vocabList = z.object({
  items: z.array(item.extend({ term: z.string() })),
  nextCursor: z.string().nullable(),
})

async function callTool<T extends z.ZodType>(
  name: string,
  args: Record<string, unknown>,
  schema: T
): Promise<z.infer<T>> {
  const result = await client.callTool({ name, arguments: args })
  if (result.isError) throw new Error(JSON.stringify(result.content))
  return schema.parse(result.structuredContent)
}

function getBook(id: string) {
  return callTool('get_book', { book_id: id }, z.looseObject({ chapters: z.array(named) }))
}

const { books } = await callTool('list_books', {}, z.object({ books: z.array(named) }))
const bookId: string = books[0].id

describe('instructions', () => {
  it('explain the color convention', () => {
    expect(client.getInstructions()).toContain('vocab (yellow)')
    expect(client.getInstructions()).toContain('quote (orange)')
  })
})

describe('list_books and get_book', () => {
  it('lists books with counts', () => {
    expect(books).toEqual([
      expect.objectContaining({
        title: 'Mistborn',
        author: 'Brandon Sanderson',
        counts: { vocab: 9, quote: 2, lore: 1, unclassified: 1 },
      }),
    ])
  })

  it('summarizes a book with its chapters', async () => {
    const book = await getBook(bookId)
    expect(book.chapters.map((c) => c.title)).toEqual([
      'Preface',
      'Prologue',
      'Chapter 1',
      'Chapter 6',
      'Chapter 8',
      'Chapter 9',
    ])
    expect(book).not.toHaveProperty('unchaptered')
  })

  it('reports a missing book as an error', async () => {
    const result = await client.callTool({ name: 'get_book', arguments: { book_id: 'nope' } })
    expect(result.isError).toBe(true)
  })
})

describe('search_highlights', () => {
  it('searches within a book in reading order without repeating the book', async () => {
    const { items } = await callTool('search_highlights', { book_id: bookId, type: 'quote' }, list)
    expect(items.map((h) => h.chapter)).toEqual(['Chapter 6', 'Chapter 9'])
    expect(items[0]).not.toHaveProperty('book')
  })

  it('includes the book across books and omits empty fields', async () => {
    const { items } = await callTool('search_highlights', { query: 'quarry' }, list)
    expect(items).toEqual([
      expect.objectContaining({ text: 'quarry.', note: 'target, prey', book: 'Mistborn' }),
    ])
    expect(items[0]).not.toHaveProperty('tags')
  })

  it('paginates', async () => {
    const first = await callTool('search_highlights', { book_id: bookId, limit: 10 }, list)
    expect(first.items).toHaveLength(10)
    const second = await callTool(
      'search_highlights',
      {
        book_id: bookId,
        limit: 10,
        cursor: first.nextCursor,
      },
      list
    )
    expect(second.items).toHaveLength(3)
    expect(second.nextCursor).toBeNull()
  })
})

describe('get_vocab', () => {
  it('lists entries missing a definition, scoped to a chapter', async () => {
    const book = await getBook(bookId)
    const chapter8 = book.chapters.find((c) => c.title === 'Chapter 8')
    const { items } = await callTool(
      'get_vocab',
      {
        chapter_id: chapter8?.id,
        missing_definition: true,
      },
      vocabList
    )
    expect(items.map((v) => v.term)).toEqual(['opulence', 'stifled'])
    expect(items[0]).toMatchObject({ context: 'opulence,', status: 'new', book: 'Mistborn' })
  })

  it('shows my note as the definition without repeating it', async () => {
    const { items } = await callTool('get_vocab', { book_id: bookId }, vocabList)
    const hale = items.find((v) => v.term === 'hale')
    expect(hale).toMatchObject({ definition: 'healthy, of sound mind', definitionBy: 'me' })
    expect(hale).not.toHaveProperty('note')
    expect(hale).not.toHaveProperty('context')
  })
})

describe('get_lore and get_recent', () => {
  it('returns lore entries with their highlights', async () => {
    const { items } = await callTool('search_highlights', { type: 'lore' }, list)
    upsertLore({ bookId, name: 'Preservation', kind: 'concept', highlightIds: [items[0].id] })
    const { entries } = await callTool(
      'get_lore',
      { book_id: bookId },
      z.object({ entries: z.array(item) })
    )
    expect(entries).toEqual([
      {
        id: expect.any(String),
        name: 'Preservation',
        kind: 'concept',
        highlights: [expect.objectContaining({ text: 'prelan—' })],
      },
    ])
  })

  it('returns recent highlights since a date', async () => {
    const recent = await callTool('get_recent', { since: '2000-01-01T00:00:00Z', limit: 5 }, list)
    expect(recent.items).toHaveLength(5)
    const none = await callTool('get_recent', { since: '2999-01-01T00:00:00Z' }, list)
    expect(none.items).toEqual([])
  })
})
