import fs from 'node:fs'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { setupTestDb } from '@/test/db'

const { insertUser } = await setupTestDb()
const userId = insertUser().id
const { importContent } = await import('@/lib/import')
const { upsertLore } = await import('@/lib/lore')
const { createMcpServer } = await import('./server')

const fixture = (name: string) =>
  fs.readFileSync(new URL(`../importers/fixtures/${name}`, import.meta.url), 'utf8')
importContent(userId, fixture('kindle-notebook.html'))

const client = new Client({ name: 'test', version: '1.0.0' })
const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
await createMcpServer(userId).connect(serverTransport)
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

function fetchBook(id: string) {
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
  it('lists books with counts and what is missing', () => {
    expect(books).toEqual([
      expect.objectContaining({
        title: 'Mistborn',
        author: 'Brandon Sanderson',
        counts: { vocab: 9, quote: 2, lore: 1, unclassified: 1 },
        missing: { definitions: expect.any(Number), explanations: 2 },
      }),
    ])
  })

  it('summarizes a book with its chapters', async () => {
    const book = await fetchBook(bookId)
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
    const book = await fetchBook(bookId)
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
    upsertLore(userId, {
      bookId,
      name: 'Preservation',
      kind: 'concept',
      highlightIds: [items[0].id],
    })
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

describe('write tools', () => {
  it('adds a definition marked as written by Claude, trimming the term', async () => {
    const { items } = await callTool(
      'get_vocab',
      { book_id: bookId, missing_definition: true },
      vocabList
    )
    const opulence = items.find((v) => v.term === 'opulence')
    const stifled = items.find((v) => v.term === 'stifled')
    const result = await callTool(
      'add_definitions',
      {
        entries: [
          {
            vocab_id: opulence?.id,
            definition: 'great wealth or luxuriousness',
            part_of_speech: 'noun',
            term: 'Opulence',
          },
          { vocab_id: stifled?.id, definition: 'held back, suppressed', translation: 'contenido' },
          { vocab_id: 'nope', definition: 'x' },
        ],
      },
      z.object({
        updated: z.number(),
        failed: z.array(z.object({ vocab_id: z.string(), error: z.string() })),
      })
    )
    expect(result).toEqual({
      updated: 2,
      failed: [{ vocab_id: 'nope', error: 'Vocab entry not found' }],
    })
    const after = await callTool('get_vocab', { book_id: bookId, limit: 200 }, vocabList)
    expect(after.items.find((v) => v.id === opulence?.id)).toMatchObject({
      term: 'Opulence',
      definitionBy: 'claude',
      partOfSpeech: 'noun',
    })
    expect(after.items.find((v) => v.id === stifled?.id)).toMatchObject({
      translation: 'contenido',
      translationBy: 'claude',
    })
  })

  it('classifies highlights and creates vocab entries', async () => {
    const { items } = await callTool('search_highlights', { type: 'unclassified' }, list)
    const result = await callTool(
      'classify_highlight',
      { highlight_ids: [items[0].id], type: 'vocab' },
      z.object({ updated: z.number() })
    )
    expect(result.updated).toBe(1)
    const vocab = await callTool('get_vocab', { book_id: bookId }, vocabList)
    expect(vocab.items.map((v) => v.term)).toContain('she gasped in pain despite herself')
  })

  it('appends notes and adds tags', async () => {
    const { items } = await callTool('search_highlights', { query: 'quarry' }, list)
    const id = items[0].id
    const noted = await callTool(
      'add_note',
      { highlight_id: id, note: 'hunting sense' },
      z.object({ highlight: z.looseObject({ note: z.string() }) })
    )
    expect(noted.highlight.note).toBe('target, prey\n\nhunting sense')
    await callTool(
      'add_tags',
      { highlight_ids: [id], tags: ['Hunting'] },
      z.object({ tagged: z.number() })
    )
    const tagged = await callTool('search_highlights', { tag: 'hunting' }, list)
    expect(tagged.items.map((h) => h.id)).toEqual([id])
  })

  it('upserts lore entries and rejects unknown books', async () => {
    const { lore, created } = await callTool(
      'upsert_lore_entry',
      { book_id: bookId, name: 'Kelsier', kind: 'character', body: 'The Survivor.' },
      z.object({ created: z.boolean(), lore: z.looseObject({ name: z.string() }) })
    )
    expect(created).toBe(true)
    expect(lore.name).toBe('Kelsier')
    const missing = await client.callTool({
      name: 'upsert_lore_entry',
      arguments: { book_id: 'nope', name: 'x', kind: 'other' },
    })
    expect(missing.isError).toBe(true)
  })

  it('sets vocab status', async () => {
    const { items } = await callTool('get_vocab', { book_id: bookId, limit: 2 }, vocabList)
    const result = await callTool(
      'set_vocab_status',
      { vocab_ids: items.map((v) => v.id), status: 'known' },
      z.object({ updated: z.number() })
    )
    expect(result.updated).toBe(2)
    const known = await callTool('get_vocab', { status: 'known' }, vocabList)
    expect(known.items).toHaveLength(2)
  })

  it('exports a book as Markdown text', async () => {
    const result = await client.callTool({
      name: 'export_book_markdown',
      arguments: { book_id: bookId },
    })
    expect(result.content).toEqual([{ type: 'text', text: expect.stringContaining('# Mistborn') }])
  })
})

describe('add_highlight', () => {
  it('adds a word by hand and joins the existing vocab entry when repeated', async () => {
    const added = await callTool(
      'add_highlight',
      { book_id: bookId, text: 'hale', type: 'vocab', chapter: 'Chapter 12', page: '210' },
      z.object({ created: z.boolean(), highlight: z.looseObject({ chapter: z.string() }) })
    )
    expect(added).toMatchObject({ created: true, highlight: { chapter: 'Chapter 12' } })
    const { items } = await callTool('get_vocab', { book_id: bookId, limit: 200 }, vocabList)
    expect(items.filter((v) => v.term === 'hale')).toEqual([
      expect.objectContaining({ seen: 2, definition: 'healthy, of sound mind' }),
    ])
  })

  it('needs a book', async () => {
    const result = await client.callTool({
      name: 'add_highlight',
      arguments: { text: 'x', type: 'quote' },
    })
    expect(result.isError).toBe(true)
  })
})

describe('translations', () => {
  it('lists entries missing a translation and sets several at once', async () => {
    const missing = await callTool(
      'get_vocab',
      { book_id: bookId, missing_translation: true, limit: 2 },
      vocabList
    )
    expect(missing.items).toHaveLength(2)
    const result = await callTool(
      'set_translations',
      {
        translations: [
          { vocab_id: missing.items[0].id, translation: 'tópicos' },
          { vocab_id: 'nope', translation: 'x' },
        ],
      },
      z.object({ updated: z.number(), notFound: z.array(z.string()) })
    )
    expect(result).toEqual({ updated: 1, notFound: ['nope'] })
    const { items } = await callTool('get_vocab', { book_id: bookId, limit: 200 }, vocabList)
    expect(items.find((v) => v.id === missing.items[0].id)).toMatchObject({
      translation: 'tópicos',
      translationBy: 'claude',
    })
  })
})

describe('explanations and missing counts', () => {
  it('reports what a book is missing', async () => {
    const book = await callTool(
      'get_book',
      { book_id: bookId },
      z.looseObject({ missing: z.object({ definitions: z.number(), explanations: z.number() }) })
    )
    expect(book.missing.explanations).toBe(2)
    expect(book.missing.definitions).toBeGreaterThan(0)
  })

  it('explains quotes in bulk and drops them from the missing list', async () => {
    const { items } = await callTool(
      'search_highlights',
      { book_id: bookId, type: 'quote', missing_explanation: true },
      list
    )
    expect(items).toHaveLength(2)
    const result = await callTool(
      'add_explanations',
      {
        entries: [
          { highlight_id: items[0].id, explanation: 'Vin notices comfort she has never had.' },
          { highlight_id: 'nope', explanation: 'x' },
        ],
      },
      z.object({ updated: z.number(), notFound: z.array(z.string()) })
    )
    expect(result).toEqual({ updated: 1, notFound: ['nope'] })
    const after = await callTool(
      'search_highlights',
      { book_id: bookId, type: 'quote', missing_explanation: true },
      list
    )
    expect(after.items).toHaveLength(1)
    const explained = await callTool('search_highlights', { query: 'mattress' }, list)
    expect(explained.items[0]).toMatchObject({ explanationBy: 'claude' })
  })
})
