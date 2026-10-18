import { describe, expect, it } from 'vitest'
import { setupTestDb } from '@/test/db'

const { insertBook, insertHighlight, insertUser } = await setupTestDb()
const userId = insertUser().id
const { getColorMap, listColorMappings, resetColorMapping, setColorMapping, typeForColor } =
  await import('./colors')

describe('color mappings', () => {
  it('maps Kindle colors by default', () => {
    const map = getColorMap(userId, 'kindle-html')
    expect(typeForColor(map, 'yellow')).toBe('vocab')
    expect(typeForColor(map, 'Orange')).toBe('quote')
    expect(typeForColor(map, 'aqua')).toBe('lore')
    expect(typeForColor(map, 'pink')).toBe('unclassified')
    expect(typeForColor(map, undefined)).toBe('unclassified')
  })

  it('overrides and resets a color per source', () => {
    setColorMapping(userId, 'kindle-html', 'Pink', 'lore')
    expect(getColorMap(userId, 'kindle-html').pink).toBe('lore')
    expect(getColorMap(userId, 'readest').pink).toBeUndefined()
    resetColorMapping(userId, 'kindle-html', 'pink')
    expect(getColorMap(userId, 'kindle-html').pink).toBeUndefined()
  })

  it('lists default, overridden and seen colors', () => {
    insertHighlight(insertBook(userId).id, { color: 'purple', source: 'kindle-html' })
    setColorMapping(userId, 'kindle-html', 'yellow', 'quote')
    expect(listColorMappings(userId, 'kindle-html')).toEqual([
      { color: 'aqua', type: 'lore', isDefault: true },
      { color: 'blue', type: 'lore', isDefault: true },
      { color: 'orange', type: 'quote', isDefault: true },
      { color: 'purple', type: 'unclassified', isDefault: true },
      { color: 'yellow', type: 'quote', isDefault: false },
    ])
  })
})
