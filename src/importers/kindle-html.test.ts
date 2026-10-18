import fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import { kindleHtml } from './kindle-html'

const fixture = (name: string) =>
  fs.readFileSync(new URL(`fixtures/${name}`, import.meta.url), 'utf8')

describe('kindle notebook html', () => {
  const [book] = kindleHtml.parse(fixture('kindle-notebook.html'))
  const byText = (text: string) => book.highlights.find((h) => h.text === text)

  it('detects notebook exports', () => {
    expect(kindleHtml.detect(fixture('kindle-notebook.html'))).toBe(true)
    expect(kindleHtml.detect(fixture('clippings-edge.txt'))).toBe(false)
  })

  it('reads the title without author and Z-Library suffixes, and the author', () => {
    expect(book.title).toBe('Mistborn')
    expect(book.author).toBe('Brandon Sanderson')
  })

  it('reads colors from the annotation class', () => {
    expect(byText('tropes,')?.color).toBe('yellow')
    expect(byText('prelan—')?.color).toBe('aqua')
    expect(byText('she gasped in pain despite herself.')?.color).toBe('pink')
    expect(byText('In the end, I worry that my arrogance shall destroy us all.')?.color).toBe(
      'orange'
    )
  })

  it('uses the chapter from the heading, falling back to the section', () => {
    expect(byText('tropes,')?.chapter).toBe('Preface')
    expect(byText('ruddy')?.chapter).toBe('Prologue')
    expect(byText('Leisurely.')?.chapter).toBe('Chapter 1')
    expect(byText('quarry.')?.chapter).toBe('Chapter 9')
  })

  it('reads the location', () => {
    expect(byText('ruddy')).toMatchObject({ locStart: 160, locEnd: 160 })
  })

  it('attaches a note to the highlight at the same location, before or after it', () => {
    expect(byText('hale')?.note).toBe('healthy, of sound mind')
    expect(byText('nod off')?.note).toBe('sleep')
    expect(byText('quarry.')?.note).toBe('target, prey')
    expect(byText('opulence,')?.note).toBeUndefined()
    expect(byText('stifled')?.note).toBeUndefined()
  })

  it('does not emit notes as highlights', () => {
    expect(book.highlights).toHaveLength(13)
    expect(byText('sleep')).toBeUndefined()
  })
})

describe('legacy desktop notebook html', () => {
  const [book] = kindleHtml.parse(fixture('kindle-notebook-legacy.html'))

  it('repairs mismatched h2/h3 markup and keeps every highlight', () => {
    expect(book.title).toBe('On Writing: A Memoir of the Craft')
    expect(book.author).toBe('King, Stephen')
    expect(book.highlights.map((h) => h.color)).toEqual(['yellow', 'blue', 'orange'])
  })

  it('reads page and location from localized headings', () => {
    expect(book.highlights[0]).toMatchObject({
      text: 'Good writing is often about letting go of fear and affectation.',
      page: '6',
      locStart: 114,
      chapter: 'Chapter 3 Toolbox',
      note: 'Yes! Write what you want.',
    })
    expect(book.highlights[1]).toMatchObject({ page: '8', locStart: 130 })
  })

  it('joins multiple text blocks under one heading', () => {
    expect(book.highlights[2].text).toBe('Line one\nline two')
  })
})
