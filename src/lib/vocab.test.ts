import { describe, expect, it } from 'vitest'
import { setupTestDb } from '@/test/db'

const { insertBook, insertHighlight } = await setupTestDb()
const { ensureVocab, getVocab, listVocab, updateVocab } = await import('./vocab')

const book = insertBook({ title: 'Cien años de soledad', language: 'es' })
const plain = insertHighlight(book.id, { text: 'almendros,', type: 'vocab' })
const noted = insertHighlight(book.id, { text: 'cántaro', type: 'vocab', note: 'jug' })
const quote = insertHighlight(book.id, { text: 'not vocab at all', type: 'quote' })
ensureVocab(plain.id)
ensureVocab(noted.id)
ensureVocab(quote.id)

describe('ensureVocab', () => {
  it('trims the term and inherits the book language', () => {
    const [entry] = listVocab({ missingDefinition: true }).items
    expect(entry).toMatchObject({ term: 'almendros', language: 'es', context: 'almendros,' })
  })

  it('is idempotent', () => {
    ensureVocab(plain.id)
    expect(listVocab({ bookId: book.id }).items).toHaveLength(2)
  })
})

describe('listVocab', () => {
  it('only lists highlights currently typed vocab', () => {
    expect(
      listVocab()
        .items.map((v) => v.term)
        .sort()
    ).toEqual(['almendros', 'cántaro'])
  })

  it('filters by status and missing definition', () => {
    expect(listVocab({ missingDefinition: true }).items.map((v) => v.term)).toEqual(['almendros'])
    expect(listVocab({ status: 'known' }).items).toEqual([])
  })
})

describe('updateVocab', () => {
  it('updates the definition and status', () => {
    const [entry] = listVocab({ missingDefinition: true }).items
    const { vocab } = updateVocab(entry.id, {
      definition: 'almond trees',
      partOfSpeech: 'noun',
      definitionBy: 'claude',
      status: 'learning',
    })
    expect(vocab).toMatchObject({
      definition: 'almond trees',
      definitionBy: 'claude',
      status: 'learning',
    })
    expect(getVocab(entry.id)?.partOfSpeech).toBe('noun')
  })

  it('reports a missing entry', () => {
    expect(updateVocab('nope', { status: 'known' })).toEqual({ error: 'Vocab entry not found' })
  })
})
