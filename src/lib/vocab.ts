import { and, asc, desc, eq, inArray, isNull, ne, sql, type SQL } from 'drizzle-orm'
import { db } from '@/db'
import { book, chapter, highlight, vocabEntry } from '@/db/schema'
import { normalizeText, vocabTerm } from '@/importers/text'
import type { VocabSort, VocabStatus } from '@/shared/types'
import { ownedVocabIds } from './access'
import { page, type PageInput } from './page'

export function termKey(term: string) {
  return normalizeText(term)
}

// Repeated highlights of the same word in a book share one entry; the first note seen becomes
// the definition if the entry has none yet.
export function ensureVocab(highlightId: string) {
  const row = db
    .select({
      text: highlight.text,
      note: highlight.note,
      vocabId: highlight.vocabId,
      bookId: highlight.bookId,
      language: book.language,
    })
    .from(highlight)
    .innerJoin(book, eq(book.id, highlight.bookId))
    .where(eq(highlight.id, highlightId))
    .get()
  if (!row || row.vocabId) return
  const term = vocabTerm(row.text)
  const key = termKey(term)
  db.insert(vocabEntry)
    .values({ bookId: row.bookId, term, termKey: key, language: row.language })
    .onConflictDoNothing()
    .run()
  const entry = db
    .select({ id: vocabEntry.id, definition: vocabEntry.definition })
    .from(vocabEntry)
    .where(and(eq(vocabEntry.bookId, row.bookId), eq(vocabEntry.termKey, key)))
    .get()
  if (!entry) return
  if (!entry.definition && row.note) {
    db.update(vocabEntry)
      .set({ definition: row.note, definitionBy: 'me' })
      .where(eq(vocabEntry.id, entry.id))
      .run()
  }
  db.update(highlight).set({ vocabId: entry.id }).where(eq(highlight.id, highlightId)).run()
}

export interface VocabFilter extends PageInput {
  bookId?: string
  chapterId?: string
  status?: VocabStatus
  missingDefinition?: boolean
  missingTranslation?: boolean
  missingSynonyms?: boolean
  studied?: boolean
  revise?: boolean
  sort?: VocabSort
}

const REVISE_AFTER_MS = 14 * 24 * 60 * 60 * 1000

const reviews = sql<number>`(select count(*) from quiz_attempt qa where qa.vocab_id = ${vocabEntry.id})`
const reviewsRight = sql<number>`(
  select count(*) from quiz_attempt qa where qa.vocab_id = ${vocabEntry.id} and qa.correct = 1
)`
const lastReviewed = sql<number | null>`(
  select max(qa.created_at) from quiz_attempt qa where qa.vocab_id = ${vocabEntry.id}
)`

function recentResult(offset: number) {
  return sql`(
    select qa.correct from quiz_attempt qa where qa.vocab_id = ${vocabEntry.id}
    order by qa.created_at desc, qa.rowid desc limit 1 offset ${offset}
  )`
}

// A miss in either of the last two reviews, or a word still being learned that hasn't been
// reviewed for two weeks.
function needsRevision(now: number) {
  return sql`(
    ${recentResult(0)} = 0 or ${recentResult(1)} = 0
    or (${vocabEntry.status} = 'learning' and ${lastReviewed} < ${now - REVISE_AFTER_MS})
  )`
}

const firstOccurrence = sql`(
  select h2.id from highlight h2 left join chapter c2 on c2.id = h2.chapter_id
  where h2.vocab_id = ${vocabEntry.id} and h2.type = 'vocab'
  order by c2.position is null, c2.position, h2.loc_start, h2.created_at limit 1
)`

export const vocabColumns = {
  id: vocabEntry.id,
  term: vocabEntry.term,
  definition: vocabEntry.definition,
  partOfSpeech: vocabEntry.partOfSpeech,
  language: vocabEntry.language,
  example: vocabEntry.example,
  status: vocabEntry.status,
  definitionBy: vocabEntry.definitionBy,
  translation: vocabEntry.translation,
  translationBy: vocabEntry.translationBy,
  reviews,
  reviewsRight,
  lastReviewed,
  synonyms: vocabEntry.synonyms,
  antonyms: vocabEntry.antonyms,
  occurrences: sql<number>`(
    select count(*) from highlight h3 where h3.vocab_id = ${vocabEntry.id} and h3.type = 'vocab'
  )`,
  context: highlight.text,
  note: highlight.note,
  bookId: vocabEntry.bookId,
  bookTitle: book.title,
  chapterId: highlight.chapterId,
  chapter: chapter.title,
}

export function vocabConditions(userId: string, filter: VocabFilter) {
  const conditions: SQL[] = [eq(book.userId, userId)]
  if (filter.bookId) conditions.push(eq(vocabEntry.bookId, filter.bookId))
  if (filter.chapterId) {
    const inChapter =
      filter.chapterId === 'none'
        ? sql`h4.chapter_id is null`
        : sql`h4.chapter_id = ${filter.chapterId}`
    conditions.push(
      sql`exists (select 1 from highlight h4 where h4.vocab_id = ${vocabEntry.id} and h4.type = 'vocab' and ${inChapter})`
    )
  }
  if (filter.status) conditions.push(eq(vocabEntry.status, filter.status))
  if (filter.missingDefinition) {
    conditions.push(sql`(${vocabEntry.definition} is null or ${vocabEntry.definition} = '')`)
  }
  if (filter.missingTranslation) {
    conditions.push(sql`(${vocabEntry.translation} is null or ${vocabEntry.translation} = '')`)
  }
  if (filter.missingSynonyms) conditions.push(isNull(vocabEntry.synonyms))
  if (filter.studied) conditions.push(sql`${reviews} > 0`)
  if (filter.revise) conditions.push(needsRevision(Date.now()))
  return and(...conditions)
}

export function selectVocab() {
  return db
    .select(vocabColumns)
    .from(vocabEntry)
    .innerJoin(book, eq(book.id, vocabEntry.bookId))
    .innerJoin(highlight, eq(highlight.id, firstOccurrence))
    .leftJoin(chapter, eq(chapter.id, highlight.chapterId))
}

function vocabOrder(sort: VocabSort = 'reading') {
  const byTerm = asc(vocabEntry.term)
  if (sort === 'revise') return [sql`${reviewsRight} * 1.0 / ${reviews}`, asc(lastReviewed), byTerm]
  if (sort === 'most') return [desc(reviews), byTerm]
  if (sort === 'recent') return [desc(lastReviewed), byTerm]
  return [
    asc(book.title),
    sql`${chapter.position} is null`,
    asc(chapter.position),
    asc(highlight.locStart),
    byTerm,
  ]
}

export function listVocab(userId: string, filter: VocabFilter = {}) {
  return page(filter, (limit, offset) =>
    selectVocab()
      .where(vocabConditions(userId, filter))
      .orderBy(...vocabOrder(filter.sort))
      .limit(limit)
      .offset(offset)
      .all()
  )
}

export function getVocab(userId: string, id: string) {
  const entry = selectVocab()
    .where(and(eq(vocabEntry.id, id), eq(book.userId, userId)))
    .get()
  if (!entry) return undefined
  const contexts = db
    .select({
      highlightId: highlight.id,
      text: highlight.text,
      chapter: chapter.title,
      locStart: highlight.locStart,
      note: highlight.note,
    })
    .from(highlight)
    .leftJoin(chapter, eq(chapter.id, highlight.chapterId))
    .where(and(eq(highlight.vocabId, id), eq(highlight.type, 'vocab')))
    .orderBy(sql`${chapter.position} is null`, asc(chapter.position), asc(highlight.locStart))
    .all()
  return { ...entry, contexts }
}

export type VocabUpdate = Partial<
  Pick<
    typeof vocabEntry.$inferInsert,
    | 'term'
    | 'definition'
    | 'partOfSpeech'
    | 'language'
    | 'example'
    | 'status'
    | 'definitionBy'
    | 'translation'
    | 'translationBy'
    | 'synonyms'
    | 'antonyms'
  >
>

export function setVocabStatus(userId: string, ids: string[], status: VocabStatus) {
  const owned = ownedVocabIds(userId, ids)
  if (!owned.length) return { updated: 0 }
  const { changes } = db
    .update(vocabEntry)
    .set({ status })
    .where(inArray(vocabEntry.id, owned))
    .run()
  return { updated: changes }
}

export function updateVocab(userId: string, id: string, { term, ...values }: VocabUpdate) {
  if (!ownedVocabIds(userId, [id]).length) return { error: 'Vocab entry not found' }
  const renamed = term === undefined ? {} : { term, termKey: termKey(term) }
  if (renamed.termKey !== undefined) {
    const current = db
      .select({ bookId: vocabEntry.bookId })
      .from(vocabEntry)
      .where(eq(vocabEntry.id, id))
      .get()
    const clash = db
      .select({ id: vocabEntry.id })
      .from(vocabEntry)
      .where(
        and(
          eq(vocabEntry.bookId, current?.bookId ?? ''),
          eq(vocabEntry.termKey, renamed.termKey),
          ne(vocabEntry.id, id)
        )
      )
      .get()
    if (clash) return { error: `This book already has a vocab entry for "${term}"` }
  }
  db.update(vocabEntry)
    .set({ ...values, ...renamed })
    .where(eq(vocabEntry.id, id))
    .run()
  return { vocab: getVocab(userId, id) }
}
