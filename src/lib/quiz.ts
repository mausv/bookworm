import { and, desc, eq, isNotNull, ne, sql } from 'drizzle-orm'
import { db } from '@/db'
import { book, chapter, highlight, quizAttempt, vocabEntry } from '@/db/schema'
import type { VocabStatus } from '@/shared/types'
import { vocabColumns, vocabConditions } from './vocab'

export type QuizMode = 'choice' | 'typed'
export type QuizDirection = 'term' | 'definition'

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

function maskTerm(context: string, term: string) {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return context.replace(new RegExp(escaped, 'giu'), '____')
}

function defined() {
  return and(isNotNull(vocabEntry.definition), ne(vocabEntry.definition, ''))
}

function scopedVocab(scope: QuizScope) {
  return db
    .select(vocabColumns)
    .from(vocabEntry)
    .innerJoin(highlight, eq(highlight.id, vocabEntry.highlightId))
    .innerJoin(book, eq(book.id, highlight.bookId))
    .leftJoin(chapter, eq(chapter.id, highlight.chapterId))
    .where(and(vocabConditions(scope), defined()))
    .all()
}

export function buildQuiz(
  scope: QuizScope,
  { count = 10, mode = 'mixed' }: { count?: number; mode?: QuizMode | 'mixed' } = {},
  random = Math.random
): QuizQuestion[] {
  const inScope = scopedVocab(scope)
  const pool = inScope.length >= 4 ? inScope : scopedVocab({})
  const order = { new: 0, learning: 0, known: 1 }
  const picked = shuffle(inScope, random)
    .sort((a, b) => order[a.status] - order[b.status])
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
    const showsContext = normalizeAnswer(v.context) !== normalizeAnswer(v.term)

    return {
      vocabId: v.id,
      mode: questionMode,
      direction,
      prompt: direction === 'term' ? (v.definition ?? '') : v.term,
      context: showsContext
        ? direction === 'term'
          ? maskTerm(v.context, v.term)
          : v.context
        : null,
      options: questionMode === 'choice' ? shuffle([answer, ...distractors], random) : null,
    }
  })
}

function isCorrect(answer: string, expected: string, mode: QuizMode, direction: QuizDirection) {
  const given = normalizeAnswer(answer)
  const candidates = [expected, ...(direction === 'definition' ? expected.split(/[,;/]/) : [])]
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
    .where(eq(quizAttempt.vocabId, vocabId))
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

export function answerQuiz({ vocabId, mode, direction, answer }: QuizAnswer) {
  const entry = db.select().from(vocabEntry).where(eq(vocabEntry.id, vocabId)).get()
  if (!entry) return { error: 'Vocab entry not found' }
  const expected = direction === 'term' ? entry.term : (entry.definition ?? '')
  const { correct, close } = isCorrect(answer, expected, mode, direction)
  return db.transaction(() => {
    const status = nextStatus(vocabId, entry.status, correct)
    db.insert(quizAttempt).values({ vocabId, mode, correct }).run()
    if (status !== entry.status) {
      db.update(vocabEntry).set({ status }).where(eq(vocabEntry.id, vocabId)).run()
    }
    return { correct, close, expected, status }
  })
}
