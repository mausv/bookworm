import { describe, expect, it } from 'vitest'
import { groupByChapter, locationLabel, parseTags } from './highlights'
import { type Translate, translate } from './i18n'

const t: Translate = (key, params) => translate('en', key, params)

describe('groupByChapter', () => {
  it('groups consecutive items by chapter, keeping order', () => {
    const items = [
      { id: 1, chapterId: 'a', chapter: 'One' },
      { id: 2, chapterId: 'a', chapter: 'One' },
      { id: 3, chapterId: 'b', chapter: 'Two' },
      { id: 4, chapterId: null, chapter: null },
    ]
    expect(groupByChapter(items)).toEqual([
      { chapterId: 'a', chapter: 'One', items: [items[0], items[1]] },
      { chapterId: 'b', chapter: 'Two', items: [items[2]] },
      { chapterId: null, chapter: null, items: [items[3]] },
    ])
  })

  it('returns no groups for no items', () => {
    expect(groupByChapter([])).toEqual([])
  })
})

describe('locationLabel', () => {
  it('prefers the page', () => {
    expect(locationLabel({ locStart: 120, page: '14' }, t)).toBe('p. 14')
  })

  it('falls back to the location', () => {
    expect(locationLabel({ locStart: 0, page: null }, t)).toBe('loc. 0')
  })

  it('returns null without either', () => {
    expect(locationLabel({ locStart: null, page: null }, t)).toBeNull()
  })
})

describe('parseTags', () => {
  it('splits, trims, lowercases and dedupes', () => {
    expect(parseTags(' Foo, bar ,,foo, Baz Qux ')).toEqual(['foo', 'bar', 'baz qux'])
  })

  it('returns nothing for blank input', () => {
    expect(parseTags('  ')).toEqual([])
  })
})
