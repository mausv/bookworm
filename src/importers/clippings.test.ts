import fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import { clippings, parseClippingDate } from './clippings'

const fixture = (name: string) =>
  fs.readFileSync(new URL(`fixtures/${name}`, import.meta.url), 'utf8')

describe('My Clippings.txt edge cases', () => {
  const books = clippings.parse(fixture('clippings-edge.txt'))
  const mistborn = books.find((b) => b.title === 'Mistborn')
  const byText = (text: string) => mistborn?.highlights.find((h) => h.text === text)

  it('detects clippings files', () => {
    expect(clippings.detect(fixture('clippings-edge.txt'))).toBe(true)
  })

  it('takes the author from the last parenthesized group and cleans the title', () => {
    expect(mistborn?.author).toBe('Brandon Sanderson')
    expect(books.map((b) => [b.title, b.author])).toEqual([
      ['Mistborn', 'Brandon Sanderson'],
      ['The Old Man and the Sea (1952) (1953 Pulitzer Prize)', 'Ernest Hemingway'],
      ['Notes to self', undefined],
    ])
  })

  it('reads page, location range and date', () => {
    expect(byText('ruddy')).toMatchObject({
      page: '12',
      locStart: 160,
      locEnd: 160,
      createdAt: new Date(Date.UTC(2024, 0, 15, 22, 30, 45)),
    })
  })

  it('keeps only the latest revision of an extended highlight', () => {
    const quotes = mistborn?.highlights.filter((h) => h.locStart === 2184)
    expect(quotes?.map((h) => h.text)).toEqual(['“Why yes, as a matter of fact it is.”'])
  })

  it('attaches the latest note to the highlight it covers', () => {
    expect(byText('nod off')?.note).toBe('to fall asleep')
  })

  it('keeps a note without a highlight as its own entry', () => {
    expect(byText('remember to look up Lord Ruler')).toMatchObject({ locStart: 4100 })
  })

  it('skips bookmarks and clipping-limit placeholders', () => {
    const all = books.flatMap((b) => b.highlights)
    expect(all.some((h) => h.text.includes('clipping limit'))).toBe(false)
    expect(all.some((h) => h.locStart === 2950)).toBe(false)
  })

  it('expands abbreviated location ranges from old firmware', () => {
    const old = books.find((b) => b.author === 'Ernest Hemingway')?.highlights[0]
    expect(old).toMatchObject({
      locStart: 2254,
      locEnd: 2261,
      createdAt: new Date(Date.UTC(2010, 1, 13, 9, 45)),
    })
  })
})

describe('My Clippings.txt across languages', () => {
  const books = clippings.parse(fixture('clippings-multilang.txt'))
  const all = books.flatMap((b) => b.highlights.map((h) => ({ ...h, book: b.title })))
  const starting = (prefix: string) => all.find((h) => h.text.startsWith(prefix))

  it.each([
    ['Books must be read', { page: '74', locStart: 1218, locEnd: 1218 }],
    ['ls -F shows', { page: '26', locStart: undefined }],
    ['You should specify copy', { locStart: 162, locEnd: 163 }],
    ['You would have searched', { page: '2', locStart: 92, locEnd: 97 }],
    ['Whatever Mum', { page: '3', locStart: 66, locEnd: 70 }],
    ['I’m a novelist', { page: '6', locStart: 111, locEnd: 114 }],
    ['“Mainstream readers', { locStart: 4, locEnd: 7 }],
    ['cooled. I sat', { locStart: 140, locEnd: 142 }],
    ['Douglas Stewart', { page: '185', locStart: 2836, locEnd: 2838 }],
    ['think I might enjoy', { page: '5', locStart: 62, locEnd: 64 }],
    ['part of Paris', { page: '90', locStart: 1371, locEnd: 1373 }],
    ['Overrunning the satellite', { locStart: 2025, locEnd: 2026 }],
    ['may tranquillity', { page: '35', locStart: 527, locEnd: 528 }],
    ['array. Arrays in Swift', { locStart: 2, locEnd: 5 }],
  ])('parses the location of "%s"', (prefix, expected) => {
    expect(starting(prefix)).toMatchObject(expected)
  })

  it('pairs a localized note with its highlight', () => {
    expect(starting('Apple Inc. has constructed')?.note).toBe('italiano  swift')
  })

  it.each([
    [
      '- Tu subrayado en la página 6 | posición 111-114 | Añadido',
      '- Tu nota en la página 6 | posición 114 | Añadido',
    ],
    [
      '- Ihre Markierung auf Seite 3 | bei Position 66-70 | Hinzugefügt',
      '- Ihre Notiz auf Seite 3 | bei Position 70 | Hinzugefügt',
    ],
    [
      '– Ваш выделенный отрывок в месте 446–448 | Добавлено',
      '– Ваша заметка в месте 447 | Добавлено',
    ],
    ['- 位置No. 18-20のハイライト |作成日', '- 位置No. 20のメモ |作成日'],
    [
      '- 您在第 35 页（位置 #527-528）的标注 | 添加于',
      '- 您在第 35 页（位置 #528）的笔记 | 添加于',
    ],
  ])('recognizes the note in "%s"', (highlightMeta, noteMeta) => {
    const content = `Book (Author)\n${highlightMeta}\n\nhighlighted\n==========\nBook (Author)\n${noteMeta}\n\nmy note\n==========\n`
    expect(clippings.parse(content)[0].highlights).toEqual([
      expect.objectContaining({ text: 'highlighted', note: 'my note' }),
    ])
  })

  it('never imports bookmarks', () => {
    expect(all.every((h) => h.text.length > 0)).toBe(true)
  })

  it('strips a byte order mark from the first title', () => {
    expect(books.some((b) => b.title.startsWith('\uFEFF'))).toBe(false)
  })
})

describe('parseClippingDate', () => {
  it.each([
    ['Added on Monday, February 2, 2015 9:42:48 PM', Date.UTC(2015, 1, 2, 21, 42, 48)],
    ['Added on Thursday, 3 December 2015 11:02:51', Date.UTC(2015, 11, 3, 11, 2, 51)],
    ['Añadido el sábado, 26 de diciembre de 2015 11:05:59', Date.UTC(2015, 11, 26, 11, 5, 59)],
    ['Añadido el viernes 6 de septiembre de 2013, 13:05:02', Date.UTC(2013, 8, 6, 13, 5, 2)],
    ['Hinzugefügt am Samstag, 26. Dezember 2015 11:02:51', Date.UTC(2015, 11, 26, 11, 2, 51)],
    ['Ajouté le samedi 26 décembre 2015 11:21:18', Date.UTC(2015, 11, 26, 11, 21, 18)],
    ['Добавлено: суббота, 26 декабря 2015 г. в 0:16:37', Date.UTC(2015, 11, 26, 0, 16, 37)],
    ['作成日: 2015年12月26日土曜日 11:32:45', Date.UTC(2015, 11, 26, 11, 32, 45)],
    ['添加于 2016年5月4日星期三 下午5:57:27', Date.UTC(2016, 4, 4, 17, 57, 27)],
  ])('parses %s', (text, expected) => {
    expect(parseClippingDate(text)?.getTime()).toBe(expected)
  })
})
