import { and, eq, inArray, sql } from 'drizzle-orm'
import { parse } from 'node-html-parser'
import { z } from 'zod'
import { db } from '@/db'
import { book, vocabEntry } from '@/db/schema'

const USER_AGENT = 'Bookworm/0.1 (https://github.com/mausv/bookworm)'
const CONCURRENCY = 2

export interface DictionaryEntry {
  definition: string
  partOfSpeech: string | null
  example: string | null
  translation: string | null
}

const enSchema = z.record(
  z.string(),
  z.array(
    z.object({
      partOfSpeech: z.string(),
      definitions: z.array(
        z.object({
          definition: z.string(),
          parsedExamples: z.array(z.object({ example: z.string() })).optional(),
        })
      ),
    })
  )
)

const esSchema = z.object({ parse: z.object({ wikitext: z.string() }).optional() })

function htmlText(html: string) {
  return parse(html).text.replace(/\s+/g, ' ').trim()
}

async function get(url: string) {
  return fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' } })
}

// Inflected forms ("simple past and past participle of rile up") only point at the lemma.
const FORM_OF =
  /^(?:.*\b(?:past|participle|plural|third-person|comparative|superlative|alternative (?:form|spelling)|obsolete (?:form|spelling)|misspelling)\b.*?\bof) (.+?)\.?$/i

async function lookupEnglish(term: string, followForms = true): Promise<DictionaryEntry | null> {
  const res = await get(
    `https://en.wiktionary.org/api/rest_v1/page/definition/${encodeURIComponent(term)}`
  )
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`Wiktionary request failed (${res.status})`)
  for (const section of enSchema.parse(await res.json()).en ?? []) {
    if (section.partOfSpeech === 'Proper noun') continue
    for (const sense of section.definitions) {
      const definition = htmlText(sense.definition)
      if (!definition) continue
      const lemma = definition.match(FORM_OF)?.[1]
      if (lemma) return followForms ? lookupEnglish(lemma, false) : null
      const example = sense.parsedExamples
        ?.map((e) => e.example)
        .find((e) => !e.includes('color-panel'))
      const exampleText = example ? htmlText(example) : ''
      return {
        definition,
        partOfSpeech: section.partOfSpeech.toLowerCase(),
        example: exampleText && exampleText.length <= 250 ? exampleText : null,
        translation: null,
      }
    }
  }
  return null
}

// Spanish Wiktionary has no definition endpoint, so this reads the first numbered sense
// (";1 …: text") from the page's Spanish section and strips the wiki markup.
export function parseSpanishWikitext(wikitext: string): DictionaryEntry | null {
  const start = wikitext.indexOf('{{lengua|es}}')
  if (start === -1) return null
  const next = wikitext.indexOf('{{lengua|', start + 1)
  const section = wikitext.slice(start, next === -1 ? undefined : next)
  const sense = section.match(/^;\d+[^:\n]*:\s*(.+)$/m)
  if (!sense || sense.index === undefined) return null

  const definition = sense[1]
    .replace(/<ref[^>]*\/>|<ref[^>]*>[\s\S]*?<\/ref>/g, '')
    .replace(/\{\{plm\|([^}|]+)[^}]*\}\}/g, (_, w: string) => w[0].toUpperCase() + w.slice(1))
    .replace(/\{\{[^{}]*\}\}/g, '')
    .replace(/\[\[(?:[^\]|]*\|)?([^\]]+)\]\]/g, '$1')
    .replace(/'{2,}/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!definition) return null

  const headings = [
    ...section.slice(0, sense.index).matchAll(/^=+\s*\{\{([^|}]+)\|es[^}]*\}\}\s*=+\s*$/gm),
  ]
  const translation = section.match(/\{\{t\|en\|[^}]*?t1=([^|}]+)/)?.[1].trim() ?? null
  return {
    definition,
    partOfSpeech: headings.at(-1)?.[1].trim() ?? null,
    example: null,
    translation,
  }
}

async function lookupSpanish(term: string): Promise<DictionaryEntry | null> {
  const params = new URLSearchParams({
    action: 'parse',
    page: term,
    prop: 'wikitext',
    format: 'json',
    formatversion: '2',
  })
  const res = await get(`https://es.wiktionary.org/w/api.php?${params}`)
  if (!res.ok) throw new Error(`Wiktionary request failed (${res.status})`)
  const wikitext = esSchema.parse(await res.json()).parse?.wikitext
  return wikitext ? parseSpanishWikitext(wikitext) : null
}

export async function lookup(term: string, language: 'en' | 'es') {
  const find = language === 'es' ? lookupSpanish : lookupEnglish
  const variants = [...new Set([term, term.toLowerCase()])]
  for (const variant of variants) {
    const entry = await find(variant)
    if (entry) return entry
  }
  return null
}

const missingDefinition = sql`(${vocabEntry.definition} is null or ${vocabEntry.definition} = '')`

export async function defineMissing(userId: string, bookIds?: string[]) {
  const rows = db
    .select({
      id: vocabEntry.id,
      term: vocabEntry.term,
      partOfSpeech: vocabEntry.partOfSpeech,
      example: vocabEntry.example,
      translation: vocabEntry.translation,
      language: book.language,
    })
    .from(vocabEntry)
    .innerJoin(book, eq(book.id, vocabEntry.bookId))
    .where(
      and(
        eq(book.userId, userId),
        bookIds ? inArray(vocabEntry.bookId, bookIds) : undefined,
        inArray(book.language, ['en', 'es']),
        missingDefinition
      )
    )
    .all()

  let defined = 0
  const queue = [...rows]
  const worker = async () => {
    for (let row = queue.shift(); row; row = queue.shift()) {
      const entry = await lookup(row.term, row.language === 'es' ? 'es' : 'en')
      if (!entry) continue
      db.update(vocabEntry)
        .set({
          definition: entry.definition,
          definitionBy: 'dictionary',
          ...(!row.partOfSpeech && entry.partOfSpeech && { partOfSpeech: entry.partOfSpeech }),
          ...(!row.example && entry.example && { example: entry.example }),
          ...(!row.translation &&
            entry.translation && {
              translation: entry.translation,
              translationBy: 'dictionary' as const,
            }),
        })
        .where(and(eq(vocabEntry.id, row.id), missingDefinition))
        .run()
      defined++
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker))
  return { defined, notFound: rows.length - defined }
}
