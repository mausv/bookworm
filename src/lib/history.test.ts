import { describe, expect, it } from 'vitest'
import { setupTestDb } from '@/test/db'

const { db, schema, insertBook, insertHighlight, insertUser } = await setupTestDb()
const userId = insertUser().id
const { recordReviews, studySummary } = await import('./history')
const { answerQuiz, buildQuiz } = await import('./quiz')
const { ensureVocab, listVocab, setVocabStatus, updateVocab } = await import('./vocab')
const { getHighlight } = await import('./highlights')

const DAY = 24 * 60 * 60 * 1000
const now = Date.parse('2026-10-24T15:00:00Z')

const book = insertBook(userId, { title: 'Mistborn' })
const other = insertBook(userId, { title: 'Elantris' })

function addWord(bookId: string, text: string) {
  const h = insertHighlight(bookId, { text, type: 'vocab' })
  ensureVocab(h.id)
  const vocabId = getHighlight(userId, h.id)?.vocabId
  if (!vocabId) throw new Error('vocab not created')
  updateVocab(userId, vocabId, { definition: `${text} meaning` })
  return vocabId
}

function review(vocabId: string, correct: boolean, daysAgo: number, mode = 'card' as const) {
  db.insert(schema.quizAttempt)
    .values({ vocabId, mode, correct, createdAt: new Date(now - daysAgo * DAY) })
    .run()
}

const ash = addWord(book.id, 'ash')
const mist = addWord(book.id, 'mist')
const pewter = addWord(book.id, 'pewter')
addWord(book.id, 'tin')
const shaod = addWord(other.id, 'Shaod')

review(ash, true, 0)
review(ash, false, 1)
review(mist, true, 1)
review(mist, true, 0)
review(pewter, true, 20)
setVocabStatus(userId, [pewter], 'learning')
review(shaod, true, 3)

describe('recordReviews', () => {
  it("records reviews only for the user's own words", () => {
    const stranger = insertUser().id
    expect(recordReviews(stranger, [{ vocabId: ash, mode: 'match', correct: true }])).toEqual({
      recorded: 0,
    })
    const word = addWord(other.id, 'aon')
    expect(
      recordReviews(userId, [
        { vocabId: word, mode: 'match', correct: true },
        { vocabId: 'nope', mode: 'card', correct: false },
      ])
    ).toEqual({ recorded: 1 })
  })
})

describe('studySummary', () => {
  it('counts reviews, accuracy, words and the streak within the scope', () => {
    expect(studySummary(userId, { bookId: book.id }, { now })).toEqual({
      reviews: 5,
      correct: 4,
      words: 3,
      streak: 2,
      today: '2026-10-24',
      days: [
        { day: '2026-10-04', reviews: 1, correct: 1 },
        { day: '2026-10-23', reviews: 2, correct: 1 },
        { day: '2026-10-24', reviews: 2, correct: 2 },
      ],
    })
  })

  it('keeps only the last 30 days and shifts days to the local time zone', () => {
    const summary = studySummary(userId, { bookId: book.id }, { now, days: 2, tzOffset: 16 * 60 })
    expect(summary.today).toBe('2026-10-23')
    expect(summary.days.map((d) => d.day)).toEqual(['2026-10-22', '2026-10-23'])
  })

  it('keeps a streak alive until the day is over and breaks it on a gap', () => {
    const lone = insertBook(userId, { title: 'Warbreaker' })
    review(addWord(lone.id, 'lifeless'), true, 3)
    expect(studySummary(userId, { bookId: lone.id }, { now }).streak).toBe(0)
    expect(studySummary(userId, { bookId: book.id }, { now: now + DAY }).streak).toBe(2)
    expect(studySummary(userId, { bookId: book.id }, { now: now + 2 * DAY }).streak).toBe(0)
  })
})

describe('listVocab study filters', () => {
  it('lists studied words with their counts', () => {
    const items = listVocab(userId, { bookId: book.id, studied: true, sort: 'most' }).items
    expect(items.map((v) => [v.term, v.reviews, v.reviewsRight])).toEqual([
      ['ash', 2, 1],
      ['mist', 2, 2],
      ['pewter', 1, 1],
    ])
    expect(items.map((v) => v.term)).not.toContain('tin')
  })

  it('needs revision after a recent miss or two weeks away while learning', () => {
    const items = listVocab(userId, { bookId: book.id, revise: true, sort: 'revise' }).items
    expect(items.map((v) => v.term)).toEqual(['ash', 'pewter'])
  })

  it('quizzes only the words that need revision', () => {
    const ids = buildQuiz(userId, { bookId: book.id, revise: true }).map((q) => q.vocabId)
    expect(ids.sort()).toEqual([ash, pewter].sort())
  })

  it('sorts by most recently studied', () => {
    const items = listVocab(userId, { studied: true, sort: 'recent' }).items
    expect(items.at(-1)?.term).toBe('pewter')
  })
})

describe('quiz status', () => {
  it('only counts quiz answers towards known', () => {
    const word = addWord(other.id, 'koloss')
    const answer = () =>
      answerQuiz(userId, { vocabId: word, mode: 'typed', direction: 'term', answer: 'koloss' })
    expect(answer()).toMatchObject({ status: 'learning' })
    recordReviews(userId, [
      { vocabId: word, mode: 'card', correct: true },
      { vocabId: word, mode: 'match', correct: true },
    ])
    expect(answer()).toMatchObject({ status: 'learning' })
    expect(answer()).toMatchObject({ status: 'known' })
  })
})
