import { describe, expect, it } from 'vitest'
import { setupTestDb } from '@/test/db'

const { insertBook, insertHighlight, insertUser } = await setupTestDb()
const userId = insertUser().id
const { deleteLore, listLore, unlinkLoreHighlight, updateLore, upsertLore } = await import('./lore')

const book = insertBook(userId, { title: 'Mistborn' })
const other = insertBook(userId, { title: 'Elantris' })
const first = insertHighlight(book.id, { text: 'Kelsier', locStart: 20 })
const second = insertHighlight(book.id, { text: 'Survivor of Hathsin', locStart: 10 })
const foreign = insertHighlight(other.id, { text: 'Raoden' })

describe('upsertLore', () => {
  it('creates an entry linked to highlights', () => {
    const result = upsertLore(userId, {
      bookId: book.id,
      name: 'Kelsier',
      kind: 'character',
      body: 'Leader of the crew.',
      highlightIds: [first.id],
    })
    expect(result).toMatchObject({
      created: true,
      lore: { name: 'Kelsier', kind: 'character', highlights: [{ id: first.id }] },
    })
  })

  it('updates by name case-insensitively and adds links', () => {
    const result = upsertLore(userId, {
      bookId: book.id,
      name: 'kelsier ',
      kind: 'character',
      highlightIds: [second.id, foreign.id],
    })
    expect(result).toMatchObject({
      created: false,
      lore: { body: 'Leader of the crew.', highlights: [{ id: second.id }, { id: first.id }] },
    })
  })
})

describe('listLore', () => {
  it('filters by kind', () => {
    upsertLore(userId, { bookId: book.id, name: 'Luthadel', kind: 'place' })
    expect(listLore(userId, book.id, 'place').map((e) => e.name)).toEqual(['Luthadel'])
    expect(listLore(userId, book.id).map((e) => e.name)).toEqual(['Kelsier', 'Luthadel'])
  })
})

describe('updateLore, unlink and delete', () => {
  it('edits, unlinks and deletes', () => {
    const [kelsier] = listLore(userId, book.id, 'character')
    expect(updateLore(userId, kelsier.id, { body: 'The Survivor.' }).lore?.body).toBe(
      'The Survivor.'
    )
    unlinkLoreHighlight(userId, kelsier.id, first.id)
    expect(listLore(userId, book.id, 'character')[0].highlights.map((h) => h.id)).toEqual([
      second.id,
    ])
    expect(deleteLore(userId, kelsier.id)).toEqual({})
    expect(deleteLore(userId, kelsier.id)).toEqual({ error: 'Lore entry not found' })
  })
})

describe('other users', () => {
  it("cannot read or write someone else's lore", () => {
    const stranger = insertUser().id
    const [entry] = listLore(userId, book.id)
    expect(listLore(stranger, book.id)).toEqual([])
    expect(upsertLore(stranger, { bookId: book.id, name: 'Vin', kind: 'character' })).toEqual({
      error: 'Book not found',
    })
    expect(updateLore(stranger, entry.id, { body: 'x' })).toEqual({ error: 'Lore entry not found' })
    expect(deleteLore(stranger, entry.id)).toEqual({ error: 'Lore entry not found' })
  })
})
