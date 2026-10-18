import fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import { setupTestDb } from '@/test/db'

const { insertUser } = await setupTestDb()
const userId = insertUser().id
const { importContent } = await import('./import')
const { listHighlights, updateHighlight } = await import('./highlights')
const { upsertLore } = await import('./lore')
const { listVocab, updateVocab } = await import('./vocab')
const { bookMarkdown, jsonDump, vocabTsv } = await import('./export')

const result = importContent(
  userId,
  fs.readFileSync(new URL('../importers/fixtures/kindle-notebook.html', import.meta.url), 'utf8')
)
if ('error' in result) throw new Error(result.error)
const bookId = result.books[0].bookId

const quotes = listHighlights(userId, { bookId, type: 'quote' }).items
updateHighlight(userId, quotes[0].id, { tags: ['comfort'] })
const lore = listHighlights(userId, { bookId, type: 'lore' }).items
upsertLore(userId, {
  bookId,
  name: 'Preservation',
  kind: 'concept',
  body: 'A god.',
  highlightIds: [lore[0].id],
})
const tropes = listVocab(userId, { bookId }).items.find((v) => v.term === 'tropes')
if (tropes) updateVocab(userId, tropes.id, { definition: 'common themes', partOfSpeech: 'noun' })

describe('bookMarkdown', () => {
  const exported = bookMarkdown(userId, bookId)
  const markdown = exported?.markdown ?? ''

  it('starts with frontmatter', () => {
    expect(exported?.filename).toBe('Mistborn.md')
    expect(markdown).toMatch(/^---\ntitle: "Mistborn"\nauthor: "Brandon Sanderson"\nlanguage: en\n/)
  })

  it('lists vocabulary by chapter with definitions and context', () => {
    expect(markdown).toContain(
      '## Vocabulary\n\n### Preface\n\n- **tropes** *(noun)* — common themes\n  - tropes,'
    )
    expect(markdown).toContain('- **hale** — healthy, of sound mind')
  })

  it('quotes by chapter with location and tags', () => {
    expect(markdown).toContain(
      '### Chapter 6\n\n> lay on an actual mattress, raised on posts, with sheets and a plush\n> — loc. 1856 #comfort'
    )
  })

  it('renders lore entries as wikilinks with their highlights', () => {
    expect(markdown).toContain('### Concepts\n\n#### [[Preservation]]\n\nA god.\n\n> prelan—')
    expect(markdown).not.toContain('## Lore highlights')
  })

  it('lists unclassified highlights', () => {
    expect(markdown).toContain('## Unclassified\n\n> she gasped in pain despite herself.')
  })

  it('returns undefined for a missing book', () => {
    expect(bookMarkdown(userId, 'nope')).toBeUndefined()
  })
})

describe('vocabTsv', () => {
  it('writes an Anki header and one row per entry with tags', () => {
    const lines = vocabTsv(userId, { bookId }).trimEnd().split('\n')
    expect(lines.slice(0, 3)).toEqual(['#separator:tab', '#html:true', '#tags column:4'])
    expect(lines).toContain('tropes\t<i>noun</i> common themes\ttropes,\tbookworm Mistborn Preface')
    expect(lines).toHaveLength(3 + 9)
  })
})

describe('jsonDump', () => {
  it('includes every table with tags and lore links', () => {
    const dump = jsonDump(userId)
    expect(dump).toMatchObject({ format: 'bookworm', version: 1 })
    expect(dump.highlights).toHaveLength(13)
    expect(dump.highlights.find((h) => h.id === quotes[0].id)?.tags).toEqual(['comfort'])
    expect(dump.lore[0].highlightIds).toEqual([lore[0].id])
    expect(dump.vocab).toHaveLength(9)
  })
})
