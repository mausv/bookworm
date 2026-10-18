import { describe, expect, it } from 'vitest'
import { setupTestDb } from '@/test/db'

const { insertBook, insertHighlight, insertUser } = await setupTestDb()
const userId = insertUser().id
const { ensureVocab, getVocab, listVocab, setVocabStatus, updateVocab } = await import('./vocab')

const book = insertBook(userId, { title: 'Cien años de soledad', language: 'es' })
const plain = insertHighlight(book.id, { text: 'almendros,', type: 'vocab' })
const noted = insertHighlight(book.id, { text: 'cántaro', type: 'vocab', note: 'jug' })
const quote = insertHighlight(book.id, { text: 'not vocab at all', type: 'quote' })
ensureVocab(plain.id)
ensureVocab(noted.id)
ensureVocab(quote.id)

describe('ensureVocab', () => {
  it('trims the term and inherits the book language', () => {
    const [entry] = listVocab(userId, { missingDefinition: true }).items
    expect(entry).toMatchObject({ term: 'almendros', language: 'es', context: 'almendros,' })
  })

  it('is idempotent', () => {
    ensureVocab(plain.id)
    expect(listVocab(userId, { bookId: book.id }).items).toHaveLength(2)
  })
})

describe('listVocab', () => {
  it('only lists highlights currently typed vocab', () => {
    expect(
      listVocab(userId)
        .items.map((v) => v.term)
        .sort()
    ).toEqual(['almendros', 'cántaro'])
  })

  it('filters by status and missing definition', () => {
    expect(listVocab(userId, { missingDefinition: true }).items.map((v) => v.term)).toEqual([
      'almendros',
    ])
    expect(listVocab(userId, { status: 'known' }).items).toEqual([])
  })
})

describe('updateVocab', () => {
  it('updates the definition and status', () => {
    const [entry] = listVocab(userId, { missingDefinition: true }).items
    const { vocab } = updateVocab(userId, entry.id, {
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
    expect(getVocab(userId, entry.id)?.partOfSpeech).toBe('noun')
  })

  it('reports a missing entry', () => {
    expect(updateVocab(userId, 'nope', { status: 'known' })).toEqual({
      error: 'Vocab entry not found',
    })
  })
})

describe('other users', () => {
  it("cannot list or change someone else's vocab", () => {
    const stranger = insertUser().id
    const [entry] = listVocab(userId).items
    expect(listVocab(stranger).items).toEqual([])
    expect(updateVocab(stranger, entry.id, { definition: 'x' })).toEqual({
      error: 'Vocab entry not found',
    })
    expect(setVocabStatus(stranger, [entry.id], 'known')).toEqual({ updated: 0 })
  })
})
