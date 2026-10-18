import fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import { readest } from './readest'

const content = fs.readFileSync(
  new URL('fixtures/readest-annotations.json', import.meta.url),
  'utf8'
)

describe('readest annotations json', () => {
  const [book] = readest.parse(content)

  it('detects Readest exports only', () => {
    expect(readest.detect(content)).toBe(true)
    expect(readest.detect('{"$format":"other"}')).toBe(false)
    expect(readest.detect('==========')).toBe(false)
  })

  it('reads the book', () => {
    expect(book).toMatchObject({ title: 'The Way of Kings', author: 'Brandon Sanderson' })
  })

  it('keeps highlights with lowercased colors, CFI, note and date, and skips bookmarks', () => {
    expect(book.highlights.map((h) => h.color)).toEqual([
      'yellow',
      'red',
      'blue',
      '#ff8800',
      'violet',
    ])
    expect(book.highlights[1]).toEqual({
      text: 'Life before death. Strength before weakness. Journey before destination.',
      color: 'red',
      cfi: 'epubcfi(/6/12!/4/2/14,/1:0,/1:58)',
      note: 'The First Ideal',
      createdAt: new Date(1792224100000),
    })
  })

  it('returns nothing for malformed files', () => {
    expect(readest.parse('{"$format":"readest-annotations"')).toEqual([])
    expect(readest.parse('{"$format":"readest-annotations","annotations":"no"}')).toEqual([])
  })
})
