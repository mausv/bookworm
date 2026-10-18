import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { setupTestDb } from '@/test/db'

const { db, schema, insertBook, insertHighlight } = await setupTestDb()
const { answerQuiz, buildQuiz, editDistance, normalizeAnswer } = await import('./quiz')
const { ensureVocab, listVocab, updateVocab } = await import('./vocab')

const book = insertBook({ title: 'Mistborn' })
const other = insertBook({ title: 'Elantris' })
const chapter = db
  .insert(schema.chapter)
  .values({ bookId: book.id, title: 'Chapter 1', position: 0 })
  .returning()
  .get()

function addWord(bookId: string, text: string, definition: string | null, chapterId?: string) {
  const h = insertHighlight(bookId, { text, type: 'vocab', chapterId })
  ensureVocab(h.id)
  const entry = listVocab({ bookId, limit: 200 }).items.find((v) => v.highlightId === h.id)
  if (!entry) throw new Error('vocab not created')
  updateVocab(entry.id, { definition })
  return entry.id
}

const ruddy = addWord(book.id, 'His ruddy face', 'reddish, healthy-looking', chapter.id)
updateVocab(ruddy, { term: 'ruddy' })
addWord(book.id, 'scuttled', 'ran with short quick steps', chapter.id)
addWord(book.id, 'soot', 'black powder from burning')
addWord(book.id, 'no definition', null)
addWord(other.id, 'Shaod', 'the Transformation')

function sequence(...values: number[]) {
  let i = 0
  return () => values[i++ % values.length]
}

describe('normalizeAnswer and editDistance', () => {
  it('ignores case, accents and punctuation', () => {
    expect(normalizeAnswer('  Cántaro, ¡sí!  ')).toBe('cantaro si')
  })

  it('counts edits', () => {
    expect(editDistance('ruddy', 'ruddy')).toBe(0)
    expect(editDistance('rudy', 'ruddy')).toBe(1)
    expect(editDistance('', 'abc')).toBe(3)
  })
})

describe('buildQuiz', () => {
  it('only quizzes vocab with a definition, within the scope', () => {
    const questions = buildQuiz({ bookId: book.id }, { count: 10 })
    expect(questions).toHaveLength(3)
    expect(buildQuiz({ chapterId: chapter.id })).toHaveLength(2)
  })

  it('builds a multiple choice question with four distinct options', () => {
    const [question] = buildQuiz(
      { chapterId: chapter.id },
      { count: 1, mode: 'choice' },
      sequence(0.9)
    )
    expect(question.mode).toBe('choice')
    expect(new Set(question.options)).toHaveLength(4)
  })

  it('asks for the term from the definition and masks it in the context', () => {
    const questions = buildQuiz({ bookId: book.id }, { mode: 'typed' }, sequence(0.7))
    const question = questions.find((q) => q.vocabId === ruddy)
    expect(question).toMatchObject({
      direction: 'term',
      prompt: 'reddish, healthy-looking',
      context: 'His ____ face',
      options: null,
    })
  })

  it('asks for the definition from the term, hiding context that equals the term', () => {
    const questions = buildQuiz({ bookId: book.id }, { mode: 'typed' }, sequence(0.1))
    expect(questions.find((q) => q.prompt === 'soot')).toMatchObject({
      direction: 'definition',
      context: null,
    })
  })

  it('falls back to typed when there are not enough distractors', () => {
    const [question] = buildQuiz({ bookId: other.id }, { mode: 'choice' })
    expect(question.mode).toBe('choice')
    db.delete(schema.highlight).where(eq(schema.highlight.bookId, book.id)).run()
    const [alone] = buildQuiz({ bookId: other.id }, { mode: 'choice' })
    expect(alone.mode).toBe('typed')
  })
})

describe('answerQuiz', () => {
  const word = addWord(other.id, 'quarry', 'target, prey')

  it('accepts a part of a multi-part definition and a near miss', () => {
    expect(
      answerQuiz({ vocabId: word, mode: 'typed', direction: 'definition', answer: 'Prey' })
    ).toMatchObject({ correct: true, close: false, expected: 'target, prey', status: 'learning' })
    expect(
      answerQuiz({ vocabId: word, mode: 'typed', direction: 'term', answer: 'quary' })
    ).toMatchObject({ correct: true, close: true })
  })

  it('marks known after three correct answers in a row and drops back on a miss', () => {
    expect(
      answerQuiz({ vocabId: word, mode: 'choice', direction: 'term', answer: 'quarry' })
    ).toMatchObject({ status: 'known' })
    const miss = answerQuiz({ vocabId: word, mode: 'choice', direction: 'term', answer: 'quary' })
    expect(miss).toMatchObject({ correct: false, close: false, status: 'learning' })
  })

  it('records every attempt', () => {
    const attempts = db
      .select()
      .from(schema.quizAttempt)
      .where(eq(schema.quizAttempt.vocabId, word))
      .all()
    expect(attempts.map((a) => a.correct)).toEqual([true, true, true, false])
  })

  it('reports a missing entry', () => {
    expect(answerQuiz({ vocabId: 'nope', mode: 'typed', direction: 'term', answer: 'x' })).toEqual({
      error: 'Vocab entry not found',
    })
  })
})
