import { describe, expect, it } from 'vitest'
import { setupTestDb } from '@/test/db'

const { insertBook, insertHighlight } = await setupTestDb()
const { getColorMap, listColorMappings, resetColorMapping, setColorMapping, typeForColor } =
  await import('./colors')

describe('color mappings', () => {
  it('maps Kindle colors by default', () => {
    const map = getColorMap('kindle-html')
    expect(typeForColor(map, 'yellow')).toBe('vocab')
    expect(typeForColor(map, 'Orange')).toBe('quote')
    expect(typeForColor(map, 'aqua')).toBe('lore')
    expect(typeForColor(map, 'pink')).toBe('unclassified')
    expect(typeForColor(map, undefined)).toBe('unclassified')
  })

  it('overrides and resets a color per source', () => {
    setColorMapping('kindle-html', 'Pink', 'lore')
    expect(getColorMap('kindle-html').pink).toBe('lore')
    expect(getColorMap('readest').pink).toBeUndefined()
    resetColorMapping('kindle-html', 'pink')
    expect(getColorMap('kindle-html').pink).toBeUndefined()
  })

  it('lists default, overridden and seen colors', () => {
    insertHighlight(insertBook().id, { color: 'purple', source: 'kindle-html' })
    setColorMapping('kindle-html', 'yellow', 'quote')
    expect(listColorMappings('kindle-html')).toEqual([
      { color: 'aqua', type: 'lore', isDefault: true },
      { color: 'blue', type: 'lore', isDefault: true },
      { color: 'orange', type: 'quote', isDefault: true },
      { color: 'purple', type: 'unclassified', isDefault: true },
      { color: 'yellow', type: 'quote', isDefault: false },
    ])
  })
})
