import { asc, eq, inArray } from 'drizzle-orm'
import { db } from '@/db'
import {
  book,
  chapter,
  colorMapping,
  highlight,
  highlightTag,
  loreEntry,
  loreHighlight,
  vocabEntry,
} from '@/db/schema'
import { LORE_KINDS } from '@/shared/types'
import { getBook } from './books'
import { listHighlights } from './highlights'
import { listLore } from './lore'
import { listVocab } from './vocab'

const NO_CHAPTER = 'No chapter'

function all<T>(fetch: (cursor: string | null) => { items: T[]; nextCursor: string | null }) {
  const items: T[] = []
  let cursor: string | null = null
  do {
    const result = fetch(cursor)
    items.push(...result.items)
    cursor = result.nextCursor
  } while (cursor)
  return items
}

function groupByChapter<T extends { chapter: string | null }>(items: T[]) {
  const groups = new Map<string, T[]>()
  for (const item of items) {
    const key = item.chapter ?? NO_CHAPTER
    groups.set(key, [...(groups.get(key) ?? []), item])
  }
  return groups
}

function yamlString(value: string) {
  return JSON.stringify(value)
}

function quote(text: string) {
  return text
    .split('\n')
    .map((line) => `> ${line}`)
    .join('\n')
}

function where(h: { locStart: number | null; page: string | null }) {
  const parts = [h.page && `p. ${h.page}`, h.locStart !== null && `loc. ${h.locStart}`]
  return parts.filter(Boolean).join(', ')
}

const KIND_HEADINGS: Record<(typeof LORE_KINDS)[number], string> = {
  character: 'Characters',
  place: 'Places',
  faction: 'Factions',
  event: 'Events',
  concept: 'Concepts',
  other: 'Other',
}

export function bookMarkdown(userId: string, bookId: string) {
  const found = getBook(userId, bookId)
  if (!found) return undefined
  const highlights = all((cursor) => listHighlights(userId, { bookId, cursor, limit: 500 }))
  const vocab = all((cursor) => listVocab(userId, { bookId, cursor, limit: 500 }))
  const lore = listLore(userId, bookId)
  const lines = [
    '---',
    `title: ${yamlString(found.title)}`,
    ...(found.author ? [`author: ${yamlString(found.author)}`] : []),
    `language: ${found.language}`,
    'tags: [book]',
    `vocab: ${found.counts.vocab}`,
    `quotes: ${found.counts.quote}`,
    `lore: ${lore.length}`,
    `exported: ${new Date().toISOString().slice(0, 10)}`,
    '---',
    '',
    `# ${found.title}`,
    '',
  ]

  if (vocab.length) {
    lines.push('## Vocabulary', '')
    for (const [title, entries] of groupByChapter(vocab)) {
      lines.push(`### ${title}`, '')
      for (const v of entries) {
        const pos = v.partOfSpeech ? ` *(${v.partOfSpeech})*` : ''
        const translation = v.translation ? ` (${v.translation})` : ''
        lines.push(`- **${v.term}**${pos}${translation}${v.definition ? ` — ${v.definition}` : ''}`)
        if (v.context.trim() !== v.term) lines.push(`  - ${v.context.replace(/\n/g, ' ')}`)
        if (v.example) lines.push(`  - e.g. ${v.example}`)
      }
      lines.push('')
    }
  }

  const quotes = highlights.filter((h) => h.type === 'quote')
  if (quotes.length) {
    lines.push('## Quotes', '')
    for (const [title, entries] of groupByChapter(quotes)) {
      lines.push(`### ${title}`, '')
      for (const h of entries) {
        lines.push(quote(h.text))
        const meta = [where(h), ...h.tags.map((t) => `#${t.replace(/\s+/g, '-')}`)].filter(Boolean)
        if (meta.length) lines.push(`> — ${meta.join(' ')}`)
        if (h.note) lines.push('', h.note)
        lines.push('')
      }
    }
  }

  if (lore.length) {
    lines.push('## Lore', '')
    for (const kind of LORE_KINDS) {
      const entries = lore.filter((e) => e.kind === kind)
      if (!entries.length) continue
      lines.push(`### ${KIND_HEADINGS[kind]}`, '')
      for (const e of entries) {
        lines.push(`#### [[${e.name}]]`, '')
        if (e.body) lines.push(e.body, '')
        for (const h of e.highlights) lines.push(quote(h.text), '')
      }
    }
  }

  const unlinkedLore = highlights.filter(
    (h) => h.type === 'lore' && !lore.some((e) => e.highlights.some((l) => l.id === h.id))
  )
  const unclassified = highlights.filter((h) => h.type === 'unclassified')
  for (const [heading, entries] of [
    ['Lore highlights', unlinkedLore],
    ['Unclassified', unclassified],
  ] as const) {
    if (!entries.length) continue
    lines.push(`## ${heading}`, '')
    for (const h of entries) {
      lines.push(quote(h.text))
      if (h.note) lines.push('', h.note)
      lines.push('')
    }
  }

  return { filename: `${found.title.replace(/[\\/:*?"<>|]/g, '')}.md`, markdown: lines.join('\n') }
}

function tsvField(value: string | null) {
  return (value ?? '').replace(/\t/g, ' ').replace(/\r?\n/g, '<br>')
}

function ankiTag(value: string) {
  return value
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^\p{L}\p{N}_:-]/gu, '')
}

export function vocabTsv(userId: string, scope: { bookId?: string; chapterId?: string } = {}) {
  const vocab = all((cursor) => listVocab(userId, { ...scope, cursor, limit: 500 }))
  const rows = vocab.map((v) => {
    const back = [
      v.partOfSpeech && `<i>${v.partOfSpeech}</i>`,
      v.translation && `<b>${v.translation}</b>`,
      v.definition,
    ]
      .filter(Boolean)
      .join(' ')
    const context = v.context.trim() === v.term ? (v.example ?? '') : v.context
    const tags = ['bookworm', ankiTag(v.bookTitle), v.chapter && ankiTag(v.chapter)]
      .filter(Boolean)
      .join(' ')
    return [v.term, back, context, tags].map(tsvField).join('\t')
  })
  return ['#separator:tab', '#html:true', '#tags column:4', ...rows, ''].join('\n')
}

export function jsonDump(userId: string) {
  const books = db.select().from(book).where(eq(book.userId, userId)).orderBy(asc(book.title)).all()
  const bookIds = books.map((b) => b.id)
  const highlights = db
    .select()
    .from(highlight)
    .where(inArray(highlight.bookId, bookIds))
    .orderBy(asc(highlight.createdAt))
    .all()
  const highlightIds = highlights.map((h) => h.id)
  const tags = db
    .select()
    .from(highlightTag)
    .where(inArray(highlightTag.highlightId, highlightIds))
    .all()
  const lore = db.select().from(loreEntry).where(inArray(loreEntry.bookId, bookIds)).all()
  const loreLinks = db
    .select()
    .from(loreHighlight)
    .where(inArray(loreHighlight.highlightId, highlightIds))
    .all()
  return {
    format: 'bookworm',
    version: 1,
    exportedAt: new Date().toISOString(),
    books: books.map(({ userId, ...b }) => b),
    chapters: db
      .select()
      .from(chapter)
      .where(inArray(chapter.bookId, bookIds))
      .orderBy(asc(chapter.bookId), asc(chapter.position))
      .all(),
    highlights: highlights.map((h) => ({
      ...h,
      tags: tags.filter((t) => t.highlightId === h.id).map((t) => t.tag),
    })),
    vocab: db.select().from(vocabEntry).where(inArray(vocabEntry.bookId, bookIds)).all(),
    lore: lore.map((e) => ({
      ...e,
      highlightIds: loreLinks.filter((l) => l.loreId === e.id).map((l) => l.highlightId),
    })),
    colorMappings: db
      .select({ source: colorMapping.source, color: colorMapping.color, type: colorMapping.type })
      .from(colorMapping)
      .where(eq(colorMapping.userId, userId))
      .all(),
  }
}
