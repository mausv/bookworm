import fs from 'node:fs'
import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { setupTestDb } from '@/test/db'

const { db, schema, insertUser } = await setupTestDb()
const userId = insertUser().id
const { importContent } = await import('./import')
const { setColorMapping } = await import('./colors')

const fixture = (name: string) =>
  fs.readFileSync(new URL(`../importers/fixtures/${name}`, import.meta.url), 'utf8')

function highlightByText(text: string) {
  return db.select().from(schema.highlight).where(eq(schema.highlight.text, text)).get()
}

const first = importContent(userId, fixture('kindle-notebook.html'))

describe('importContent', () => {
  it('detects the format and reports added highlights per book', () => {
    expect(first).toEqual({
      source: 'kindle-html',
      books: [
        { bookId: expect.any(String), title: 'Mistborn', added: 13, updated: 0, unchanged: 0 },
      ],
    })
  })

  it('classifies by the source color mapping', () => {
    expect(highlightByText('ruddy')?.type).toBe('vocab')
    expect(highlightByText('prelan—')?.type).toBe('lore')
    expect(
      highlightByText('lay on an actual mattress, raised on posts, with sheets and a plush')?.type
    ).toBe('quote')
    expect(highlightByText('she gasped in pain despite herself.')?.type).toBe('unclassified')
  })

  it('creates chapters in reading order', () => {
    const chapters = db.select().from(schema.chapter).orderBy(schema.chapter.position).all()
    expect(chapters.map((c) => c.title)).toEqual([
      'Preface',
      'Prologue',
      'Chapter 1',
      'Chapter 6',
      'Chapter 8',
      'Chapter 9',
    ])
  })

  it('creates vocab entries, using my note as the definition', () => {
    const hale = highlightByText('hale')
    const vocab = db
      .select()
      .from(schema.vocabEntry)
      .where(eq(schema.vocabEntry.highlightId, hale?.id ?? ''))
      .get()
    expect(vocab).toMatchObject({
      term: 'hale',
      definition: 'healthy, of sound mind',
      definitionBy: 'me',
      status: 'new',
    })
    const tropes = db
      .select()
      .from(schema.vocabEntry)
      .where(eq(schema.vocabEntry.highlightId, highlightByText('tropes,')?.id ?? ''))
      .get()
    expect(tropes).toMatchObject({ term: 'tropes', definition: null, definitionBy: null })
  })

  it('is idempotent on re-import', () => {
    const again = importContent(userId, fixture('kindle-notebook.html'))
    expect(again).toMatchObject({ books: [{ added: 0, updated: 0, unchanged: 13 }] })
    expect(db.select().from(schema.book).all()).toHaveLength(1)
  })

  it('merges clippings into the same book and highlight', () => {
    const result = importContent(userId, fixture('clippings-edge.txt'))
    if ('error' in result) throw new Error(result.error)
    const mistborn = result.books.find((b) => b.title === 'Mistborn')
    expect(mistborn?.bookId).toBe(first && 'books' in first ? first.books[0].bookId : undefined)
    expect(highlightByText('ruddy')).toMatchObject({
      source: 'kindle-html',
      page: '12',
      type: 'vocab',
    })
  })

  it('keeps clippings without a color unclassified', () => {
    expect(highlightByText('remember to look up Lord Ruler')).toMatchObject({
      type: 'unclassified',
      source: 'clippings',
      color: null,
    })
  })

  it('applies color mapping overrides', () => {
    setColorMapping(userId, 'kindle-html', 'pink', 'quote')
    const html = fixture('kindle-notebook.html').replace('Mistborn (Brandon', 'Elantris (Brandon')
    importContent(userId, html)
    const pink = db.select().from(schema.highlight).where(eq(schema.highlight.color, 'pink')).all()
    expect(pink.map((h) => h.type).sort()).toEqual(['quote', 'unclassified'])
  })

  it('fills the type of an unclassified highlight when a colored copy arrives', () => {
    const clipped = importContent(
      userId,
      'Warbreaker (Brandon Sanderson)\n- Your Highlight on Location 10-10 | Added on Monday, January 1, 2024 1:00:00 PM\n\nverdant\n==========\n'
    )
    expect(clipped).toMatchObject({ books: [{ added: 1 }] })
    const html = fixture('kindle-notebook.html')
      .replace('Mistborn (Brandon Sanderson) (Z-Library)', 'Warbreaker')
      .replace(
        'Location 121\n</div>\n<div class="noteText">\ntropes,',
        'Location 10\n</div>\n<div class="noteText">\nverdant'
      )
    importContent(userId, html)
    expect(highlightByText('verdant')).toMatchObject({ type: 'vocab', color: 'yellow' })
  })

  it('rejects unknown formats', () => {
    expect(importContent(userId, 'just some text')).toEqual({ error: 'Unrecognized file format' })
  })
})
