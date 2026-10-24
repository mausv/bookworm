import { and, desc, eq, inArray, isNotNull, ne, sql } from 'drizzle-orm'
import { db } from '@/db'
import { quizAttempt, vocabEntry } from '@/db/schema'
import type { VocabStatus } from '@/shared/types'
import { ownedVocabIds } from './access'
import { selectVocab, vocabConditions } from './vocab'

export type QuizMode = 'choice' | 'typed'
export type QuizDirection = 'term' | 'definition'
export type MatchPair = 'definition' | 'translation'

export interface QuizQuestion {
  vocabId: string
  mode: QuizMode
  direction: QuizDirection
  prompt: string
  context: string | null
  options: string[] | null
}

export interface QuizScope {
  bookId?: string
  chapterId?: string
  revise?: boolean
}

export function normalizeAnswer(text: string) {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[\p{P}\p{S}]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function editDistance(a: string, b: string) {
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const row = [i]
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
    prev = row
  }
  return prev[b.length]
}

function shuffle<T>(items: T[], random: () => number) {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

// Blanks out the term and its inflections (heap → heaps, saunter → sauntering) by matching
// words that start with each term word's stem; short words only count in single-word terms.
export function maskTerm(text: string, term: string) {
  const words = term.split(/[^\p{L}\p{N}]+/u).filter(Boolean)
  const stems = words
    .filter((w) => words.length === 1 || w.length >= 4)
    .map((w) => w.slice(0, w.length >= 4 ? Math.max(4, w.length - 3) : w.length))
  if (!stems.length) return text
  return text.replace(
    new RegExp(`(?<![\\p{L}\\p{N}])(?:${stems.join('|')})[\\p{L}\\p{N}]*`, 'giu'),
    '____'
  )
}

function exampleLines(example: string | null) {
  return (example ?? '')
    .split(/\r?\n/)
    .map((e) => e.trim())
    .filter(Boolean)
}

type TextColumn = typeof vocabEntry.definition | typeof vocabEntry.translation

function filled(column: TextColumn) {
  return and(isNotNull(column), ne(column, ''))
}

function scopedVocab(userId: string, scope: QuizScope, column: TextColumn = vocabEntry.definition) {
  return selectVocab()
    .where(and(vocabConditions(userId, scope), filled(column)))
    .all()
}

const STATUS_ORDER = { new: 0, learning: 0, known: 1 }

export function buildQuiz(
  userId: string,
  scope: QuizScope,
  { count = 10, mode = 'mixed' }: { count?: number; mode?: QuizMode | 'mixed' } = {},
  random = Math.random
): QuizQuestion[] {
  const inScope = scopedVocab(userId, scope)
  const pool = inScope.length >= 4 ? inScope : scopedVocab(userId, {})
  const picked = shuffle(inScope, random)
    .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status])
    .slice(0, count)

  return picked.map((v) => {
    const direction: QuizDirection = random() < 0.5 ? 'definition' : 'term'
    const answerOf = (e: typeof v) => (direction === 'term' ? e.term : (e.definition ?? ''))
    const answer = answerOf(v)
    const seen = new Set([normalizeAnswer(answer)])
    const distractors = shuffle(pool, random)
      .map(answerOf)
      .filter((d) => {
        const key = normalizeAnswer(d)
        if (!key || seen.has(key)) return false
        seen.add(key)
        return true
      })
      .slice(0, 3)
    const wanted: QuizMode = mode === 'mixed' ? (random() < 0.5 ? 'choice' : 'typed') : mode
    const questionMode = wanted === 'choice' && distractors.length < 3 ? 'typed' : wanted
    const hint =
      normalizeAnswer(v.context) !== normalizeAnswer(v.term)
        ? v.context
        : (exampleLines(v.example)[0] ?? null)

    return {
      vocabId: v.id,
      mode: questionMode,
      direction,
      prompt: direction === 'term' ? maskTerm(v.definition ?? '', v.term) : v.term,
      context: hint && direction === 'term' ? maskTerm(hint, v.term) : hint,
      options: questionMode === 'choice' ? shuffle([answer, ...distractors], random) : null,
    }
  })
}

export function buildMatch(
  userId: string,
  scope: QuizScope,
  { count = 10, pair = 'definition' }: { count?: number; pair?: MatchPair } = {},
  random = Math.random
) {
  const column = pair === 'translation' ? vocabEntry.translation : vocabEntry.definition
  const seen = new Set<string>()
  return shuffle(scopedVocab(userId, scope, column), random)
    .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status])
    .flatMap((v) => {
      const answer = (pair === 'translation' ? v.translation : v.definition) ?? ''
      const keys = [normalizeAnswer(v.term), normalizeAnswer(answer)]
      if (keys.some((k) => seen.has(k))) return []
      seen.add(keys[0])
      seen.add(keys[1])
      return [{ vocabId: v.id, term: v.term, answer: maskTerm(answer, v.term) }]
    })
    .slice(0, count)
}

function isCorrect(
  answer: string,
  expected: string,
  mode: QuizMode,
  direction: QuizDirection,
  translation: string | null
) {
  const given = normalizeAnswer(answer)
  const meanings = [expected, ...(translation ? [translation] : [])]
  const candidates = [
    expected,
    ...(direction === 'definition' ? meanings.flatMap((m) => [m, ...m.split(/[,;/]/)]) : []),
  ]
    .map(normalizeAnswer)
    .filter(Boolean)
  if (candidates.includes(given)) return { correct: true, close: false }
  if (mode === 'choice' || !given) return { correct: false, close: false }
  const close = candidates.some(
    (c) => editDistance(given, c) <= Math.max(1, Math.floor(c.length / 6))
  )
  return { correct: close, close }
}

function nextStatus(vocabId: string, current: VocabStatus, correct: boolean): VocabStatus {
  if (!correct) return 'learning'
  if (current === 'new') return 'learning'
  if (current === 'known') return 'known'
  const recent = db
    .select({ correct: quizAttempt.correct })
    .from(quizAttempt)
    .where(and(eq(quizAttempt.vocabId, vocabId), inArray(quizAttempt.mode, ['choice', 'typed'])))
    .orderBy(desc(quizAttempt.createdAt), desc(sql`rowid`))
    .limit(2)
    .all()
  return recent.length === 2 && recent.every((r) => r.correct) ? 'known' : 'learning'
}

export interface QuizAnswer {
  vocabId: string
  mode: QuizMode
  direction: QuizDirection
  answer: string
}

export function answerQuiz(userId: string, { vocabId, mode, direction, answer }: QuizAnswer) {
  const entry = ownedVocabIds(userId, [vocabId]).length
    ? db.select().from(vocabEntry).where(eq(vocabEntry.id, vocabId)).get()
    : undefined
  if (!entry) return { error: 'Vocab entry not found' }
  const expected = direction === 'term' ? entry.term : (entry.definition ?? '')
  const { correct, close } = isCorrect(answer, expected, mode, direction, entry.translation)
  return db.transaction(() => {
    const status = nextStatus(vocabId, entry.status, correct)
    db.insert(quizAttempt).values({ vocabId, mode, correct }).run()
    if (status !== entry.status) {
      db.update(vocabEntry).set({ status }).where(eq(vocabEntry.id, vocabId)).run()
    }
    return {
      correct,
      close,
      expected,
      status,
      examples: exampleLines(entry.example),
      synonyms: entry.synonyms || null,
      antonyms: entry.antonyms || null,
    }
  })
}
