import { cleanTitle, normalizeText } from './text'
import type { Importer, ParsedBook, ParsedHighlight } from './types'

const SEPARATOR = /^==========\s*$/m
const BOOKMARK =
  /bookmark|marcador|lesezeichen|signet|segnalibro|bladwijzer|закладка|ブックマーク|书签/i
const NOTE = /\b(?:note|nota|notiz|notitie)\b|заметка|メモ|笔记/i
const LOCATION =
  /(?:location|loc\.|posici[oó]n|position|emplacement|posizione|posi[cç][aã]o|locatie|мест[оеа]|位置\s*(?:no\.)?)\s*#?\s*(\d+)(?:\s*(?:-|–|t\/m)\s*(\d+))?/i
const PAGE = [
  /(?:page|p[aá]gina|seite|странице)\s*([\divxlcdm]+)/i,
  /(\d+)\s*ページ/,
  /第\s*(\d+)\s*页/,
]

const MONTHS = [
  ['january', 'enero', 'januar', 'janvier', 'gennaio', 'janeiro', 'januari', 'января'],
  ['february', 'febrero', 'februar', 'février', 'febbraio', 'fevereiro', 'februari', 'февраля'],
  ['march', 'marzo', 'märz', 'mars', 'março', 'maart', 'марта'],
  ['april', 'abril', 'avril', 'aprile', 'апреля'],
  ['may', 'mayo', 'mai', 'maggio', 'maio', 'mei', 'мая'],
  ['june', 'junio', 'juni', 'juin', 'giugno', 'junho', 'июня'],
  ['july', 'julio', 'juli', 'juillet', 'luglio', 'julho', 'июля'],
  ['august', 'agosto', 'août', 'augustus', 'августа'],
  ['september', 'septiembre', 'septembre', 'settembre', 'setembro', 'сентября'],
  ['october', 'octubre', 'oktober', 'octobre', 'ottobre', 'outubro', 'октября'],
  ['november', 'noviembre', 'novembre', 'novembro', 'ноября'],
  ['december', 'diciembre', 'dezember', 'décembre', 'dicembre', 'dezembro', 'декабря'],
]

interface Clipping {
  kind: 'highlight' | 'note' | 'bookmark'
  title: string
  author?: string
  text: string
  page?: string
  locStart?: number
  locEnd?: number
  createdAt?: Date
}

function parseTitleLine(line: string) {
  const match = line.trim().match(/^(.*\S)\s*\(([^()]*)\)$/)
  if (!match) return { title: line.trim() }
  return { title: match[1], author: match[2].trim() || undefined }
}

// "2254-61" on old firmware abbreviates the range end to its differing trailing digits.
function rangeEnd(start: string, end: string | undefined) {
  if (end === undefined) return Number(start)
  if (end.length >= start.length) return Number(end)
  return Number(start.slice(0, start.length - end.length) + end)
}

export function parseClippingDate(text: string) {
  const time = text.match(
    /(上午|下午|午前|午後)?\s*(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([ap]\.?m\.?)?/i
  )
  let hours = time ? Number(time[2]) : 0
  const meridiem = (time?.[1] ?? time?.[5] ?? '').toLowerCase()
  if (/下午|午後|^p/.test(meridiem) && hours < 12) hours += 12
  if (/上午|午前|^a/.test(meridiem) && hours === 12) hours = 0
  const minutes = time ? Number(time[3]) : 0
  const seconds = time?.[4] ? Number(time[4]) : 0
  const rest = time ? text.replace(time[0], ' ') : text

  const cjk = rest.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/)
  if (cjk) {
    return new Date(Date.UTC(+cjk[1], +cjk[2] - 1, +cjk[3], hours, minutes, seconds))
  }

  const year = rest.match(/\b(\d{4})\b/)?.[1]
  const tokens = rest.toLowerCase().split(/[\s,.:]+/)
  const month = MONTHS.findIndex((names) => tokens.some((t) => names.includes(t)))
  const day = rest.replace(year ?? '', ' ').match(/\b(\d{1,2})\b/)?.[1]
  if (!year || month === -1 || !day) return undefined
  return new Date(Date.UTC(+year, month, +day, hours, minutes, seconds))
}

function parseEntry(chunk: string): Clipping | undefined {
  const lines = chunk.replace(/\uFEFF/g, '').split(/\r?\n/)
  while (lines.length && !lines[0].trim()) lines.shift()
  const [titleLine, meta] = lines
  if (!titleLine || !meta || !/^\s*[-–]/.test(meta)) return undefined

  const segments = meta.split('|')
  const head = segments.slice(0, -1).join('|') || meta
  const location = head.match(LOCATION)
  const page = PAGE.map((re) => head.match(re)?.[1]).find(Boolean)
  const text = lines.slice(2).join('\n').trim()
  const kind = BOOKMARK.test(head) ? 'bookmark' : NOTE.test(head) ? 'note' : 'highlight'

  return {
    kind,
    ...parseTitleLine(titleLine),
    text,
    page,
    locStart: location ? Number(location[1]) : undefined,
    locEnd: location ? rangeEnd(location[1], location[2]) : undefined,
    createdAt: segments.length > 1 ? parseClippingDate(segments.at(-1) ?? '') : undefined,
  }
}

function overlaps(a: ParsedHighlight, b: ParsedHighlight) {
  if (a.locStart === undefined || b.locStart === undefined) return false
  return a.locStart <= (b.locEnd ?? b.locStart) && b.locStart <= (a.locEnd ?? a.locStart)
}

// The file is append-only: extending or shrinking a highlight adds a new entry that contains
// (or is contained by) the old text at an overlapping location, so the later one replaces it.
function isRevision(older: ParsedHighlight, newer: ParsedHighlight) {
  const a = normalizeText(older.text)
  const b = normalizeText(newer.text)
  if (a === b) return older.locStart === newer.locStart || overlaps(older, newer)
  return overlaps(older, newer) && (a.includes(b) || b.includes(a))
}

function noteTarget(highlights: ParsedHighlight[], note: Clipping) {
  if (note.locStart === undefined) return undefined
  const loc = note.locStart
  const covering = highlights.filter(
    (h) => h.locStart !== undefined && h.locStart <= loc && loc <= (h.locEnd ?? h.locStart)
  )
  return covering.findLast((h) => h.locEnd === loc) ?? covering.at(-1)
}

export const clippings: Importer = {
  source: 'clippings',

  detect(content) {
    return SEPARATOR.test(content)
  },

  parse(content) {
    const books = new Map<string, { book: ParsedBook; notes: Clipping[] }>()

    for (const chunk of content.split(SEPARATOR)) {
      const entry = parseEntry(chunk)
      if (!entry || entry.kind === 'bookmark' || !entry.text) continue
      if (/^<[^<>]+>$/.test(entry.text)) continue

      const title = cleanTitle(entry.title, entry.author)
      const key = `${title}\u0000${entry.author ?? ''}`
      let group = books.get(key)
      if (!group) {
        group = { book: { title, author: entry.author, highlights: [] }, notes: [] }
        books.set(key, group)
      }
      if (entry.kind === 'note') {
        group.notes.push(entry)
        continue
      }

      const highlight: ParsedHighlight = {
        text: entry.text,
        page: entry.page,
        locStart: entry.locStart,
        locEnd: entry.locEnd,
        createdAt: entry.createdAt,
      }
      const highlights = group.book.highlights
      const revised = highlights.findIndex((h) => isRevision(h, highlight))
      if (revised === -1) highlights.push(highlight)
      else highlights[revised] = highlight
    }

    for (const { book, notes } of books.values()) {
      for (const note of notes) {
        const target = noteTarget(book.highlights, note)
        if (target) {
          target.note = note.text
        } else {
          book.highlights.push({
            text: note.text,
            page: note.page,
            locStart: note.locStart,
            locEnd: note.locEnd,
            createdAt: note.createdAt,
          })
        }
      }
    }

    return [...books.values()].map((g) => g.book)
  },
}
