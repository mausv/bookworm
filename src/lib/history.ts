import { desc, eq, sql } from 'drizzle-orm'
import { db } from '@/db'
import { book, quizAttempt, vocabEntry } from '@/db/schema'
import { ownedVocabIds } from './access'
import { vocabConditions } from './vocab'

const DAY_MS = 24 * 60 * 60 * 1000

export interface Review {
  vocabId: string
  mode: 'card' | 'match'
  correct: boolean
}

export function recordReviews(userId: string, reviews: Review[]) {
  const owned = new Set(ownedVocabIds(userId, [...new Set(reviews.map((r) => r.vocabId))]))
  const rows = reviews.filter((r) => owned.has(r.vocabId))
  if (rows.length) db.insert(quizAttempt).values(rows).run()
  return { recorded: rows.length }
}

function localDay(ms: number, tzOffset: number) {
  return new Date(ms - tzOffset * 60_000).toISOString().slice(0, 10)
}

// Consecutive days with a review ending today, or yesterday so a streak survives until the day
// is over. `days` is sorted newest first.
function streakOf(days: string[], today: string) {
  let expected = days[0] === today ? today : previousDay(today)
  let streak = 0
  for (const day of days) {
    if (day !== expected) break
    streak++
    expected = previousDay(expected)
  }
  return streak
}

function previousDay(day: string) {
  return new Date(Date.parse(`${day}T00:00:00Z`) - DAY_MS).toISOString().slice(0, 10)
}

export function studySummary(
  userId: string,
  scope: { bookId?: string; chapterId?: string },
  {
    tzOffset = 0,
    days = 30,
    now = Date.now(),
  }: { tzOffset?: number; days?: number; now?: number } = {}
) {
  const day = sql<string>`date(${quizAttempt.createdAt} / 1000, 'unixepoch', ${`${-tzOffset} minutes`})`
  const counts = {
    reviews: sql<number>`count(*)`,
    correct: sql<number>`coalesce(sum(${quizAttempt.correct}), 0)`,
  }
  const totals = db
    .select({ ...counts, words: sql<number>`count(distinct ${quizAttempt.vocabId})` })
    .from(quizAttempt)
    .innerJoin(vocabEntry, eq(vocabEntry.id, quizAttempt.vocabId))
    .innerJoin(book, eq(book.id, vocabEntry.bookId))
    .where(vocabConditions(userId, scope))
    .get()
  const perDay = db
    .select({ day, ...counts })
    .from(quizAttempt)
    .innerJoin(vocabEntry, eq(vocabEntry.id, quizAttempt.vocabId))
    .innerJoin(book, eq(book.id, vocabEntry.bookId))
    .where(vocabConditions(userId, scope))
    .groupBy(day)
    .orderBy(desc(day))
    .all()
  const today = localDay(now, tzOffset)
  const since = localDay(now - (days - 1) * DAY_MS, tzOffset)
  return {
    reviews: totals?.reviews ?? 0,
    correct: totals?.correct ?? 0,
    words: totals?.words ?? 0,
    streak: streakOf(
      perDay.map((d) => d.day),
      today
    ),
    today,
    days: perDay.filter((d) => d.day >= since).reverse(),
  }
}
