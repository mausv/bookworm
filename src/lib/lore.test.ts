import { describe, expect, it } from 'vitest'
import { setupTestDb } from '@/test/db'

const { insertBook, insertHighlight } = await setupTestDb()
const { deleteLore, listLore, unlinkLoreHighlight, updateLore, upsertLore } = await import('./lore')

const book = insertBook({ title: 'Mistborn' })
const other = insertBook({ title: 'Elantris' })
const first = insertHighlight(book.id, { text: 'Kelsier', locStart: 20 })
const second = insertHighlight(book.id, { text: 'Survivor of Hathsin', locStart: 10 })
const foreign = insertHighlight(other.id, { text: 'Raoden' })

describe('upsertLore', () => {
  it('creates an entry linked to highlights', () => {
    const result = upsertLore({
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
    const result = upsertLore({
      bookId: book.id,
      name: 'kelsier ',
      kind: 'character',
      highlightIds: [second.id, foreign.id],
    })
    expect(result.created).toBe(false)
    expect(result.lore?.body).toBe('Leader of the crew.')
    expect(result.lore?.highlights.map((h) => h.id)).toEqual([second.id, first.id])
  })
})

describe('listLore', () => {
  it('filters by kind', () => {
    upsertLore({ bookId: book.id, name: 'Luthadel', kind: 'place' })
    expect(listLore(book.id, 'place').map((e) => e.name)).toEqual(['Luthadel'])
    expect(listLore(book.id).map((e) => e.name)).toEqual(['Kelsier', 'Luthadel'])
  })
})

describe('updateLore, unlink and delete', () => {
  it('edits, unlinks and deletes', () => {
    const [kelsier] = listLore(book.id, 'character')
    expect(updateLore(kelsier.id, { body: 'The Survivor.' }).lore?.body).toBe('The Survivor.')
    unlinkLoreHighlight(kelsier.id, first.id)
    expect(listLore(book.id, 'character')[0].highlights.map((h) => h.id)).toEqual([second.id])
    expect(deleteLore(kelsier.id)).toEqual({})
    expect(deleteLore(kelsier.id)).toEqual({ error: 'Lore entry not found' })
  })
})
