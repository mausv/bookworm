import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { Flame, Layers, ListChecks } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import type { VocabSort } from '@/shared/types'
import { api } from '@/web/lib/api'
import { type MessageKey, useLocale, useT } from '@/web/lib/i18n'
import { timeAgo } from '@/web/lib/time'
import type { Page, StudySummary, Vocab } from '@/web/lib/types'
import { withQuery } from '@/web/lib/url'
import { cn } from '@/web/lib/utils'
import type { Scope } from '@/web/pages/review'
import { StatusChip } from './vocab-list'

const DAYS = 30
const DAY_MS = 24 * 60 * 60 * 1000

const SORTS: { value: Exclude<VocabSort, 'reading'>; label: MessageKey }[] = [
  { value: 'revise', label: 'history.revise' },
  { value: 'most', label: 'history.most' },
  { value: 'recent', label: 'history.recent' },
]

function lastDays(today: string) {
  const end = Date.parse(`${today}T00:00:00Z`)
  return Array.from({ length: DAYS }, (_, i) =>
    new Date(end - (DAYS - 1 - i) * DAY_MS).toISOString().slice(0, 10)
  )
}

function percent(right: number, total: number) {
  return total ? Math.round((right / total) * 100) : 0
}

export function History({
  scope,
  onPractice,
}: {
  scope: Scope
  onPractice: (mode: 'quiz' | 'cards') => void
}) {
  const t = useT()
  const summary = useQuery({
    queryKey: ['history', scope],
    queryFn: () =>
      api<StudySummary>(withQuery('/history', { ...scope, tz: new Date().getTimezoneOffset() })),
  })

  if (summary.isPending) return null
  if (summary.error) return <p className="text-destructive">{summary.error.message}</p>

  const s = summary.data
  if (!s.reviews) {
    return (
      <div className="space-y-2 py-6">
        <p className="font-heading text-2xl">{t('history.emptyTitle')}</p>
        <p className="text-muted-foreground">{t('history.emptyBody')}</p>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label={t('history.reviews')} value={s.reviews} />
        <Stat label={t('history.accuracy')} value={`${percent(s.correct, s.reviews)}%`} />
        <Stat label={t('history.words')} value={s.words} />
        <Stat
          label={t('history.streak')}
          value={t('history.days', { count: s.streak })}
          icon={s.streak > 0 ? <Flame aria-hidden className="size-4 text-quote" /> : undefined}
        />
      </dl>
      <DailyChart summary={s} />
      <WordHistory scope={scope} onPractice={onPractice} />
    </div>
  )
}

function Stat({
  label,
  value,
  icon,
}: {
  label: string
  value: string | number
  icon?: React.ReactNode
}) {
  return (
    <div className="space-y-1 rounded-xl bg-muted/60 px-3 py-2.5">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="flex items-center gap-1.5 font-heading text-2xl tabular-nums">
        {icon}
        {value}
      </dd>
    </div>
  )
}

function DailyChart({ summary }: { summary: StudySummary }) {
  const t = useT()
  const byDay = new Map(summary.days.map((d) => [d.day, d]))
  const days = lastDays(summary.today)
  const max = Math.max(1, ...summary.days.map((d) => d.reviews))
  const total = summary.days.reduce((sum, d) => sum + d.reviews, 0)

  return (
    <figure className="space-y-2">
      <figcaption className="text-sm text-muted-foreground">
        {t('history.lastDays', { count: total })}
      </figcaption>
      <div
        role="img"
        aria-label={t('history.lastDays', { count: total })}
        className="flex h-24 items-end gap-0.5"
      >
        {days.map((day) => {
          const d = byDay.get(day)
          return (
            <div
              key={day}
              title={`${day}: ${d?.reviews ?? 0}`}
              className={cn(
                'flex-1 rounded-t-sm',
                d ? 'bg-vocab' : 'bg-border',
                day === summary.today && 'ring-1 ring-foreground/40'
              )}
              style={{ height: d ? `${Math.max(8, (d.reviews / max) * 100)}%` : '4%' }}
            />
          )
        })}
      </div>
      <div className="flex justify-between text-xs text-muted-foreground tabular-nums">
        <span>{days[0]}</span>
        <span>{t('history.today')}</span>
      </div>
    </figure>
  )
}

function WordHistory({
  scope,
  onPractice,
}: {
  scope: Scope
  onPractice: (mode: 'quiz' | 'cards') => void
}) {
  const t = useT()
  const { locale } = useLocale()
  const [sort, setSort] = useState<Exclude<VocabSort, 'reading'>>('revise')

  const words = useInfiniteQuery({
    queryKey: ['vocab', 'history', scope, sort],
    queryFn: ({ pageParam }) =>
      api<Page<Vocab>>(
        withQuery('/vocab', {
          ...scope,
          studied: true,
          revise: sort === 'revise',
          sort,
          limit: 50,
          cursor: pageParam,
        })
      ),
    initialPageParam: '',
    getNextPageParam: (last) => last.nextCursor,
  })

  const items = words.data?.pages.flatMap((p) => p.items) ?? []

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-2xl">{t('history.wordsTitle')}</h2>
        <div
          role="radiogroup"
          aria-label={t('history.sortBy')}
          className="flex gap-1 rounded-full bg-muted p-1"
        >
          {SORTS.map((s) => (
            <button
              key={s.value}
              type="button"
              role="radio"
              aria-checked={sort === s.value}
              onClick={() => setSort(s.value)}
              className={cn(
                'h-10 rounded-full px-3 text-sm transition-colors sm:h-8',
                sort === s.value
                  ? 'bg-background font-medium shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {t(s.label)}
            </button>
          ))}
        </div>
      </div>

      {sort === 'revise' && items.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => onPractice('quiz')}>
            <ListChecks aria-hidden />
            {t('history.practiceQuiz')}
          </Button>
          <Button variant="outline" onClick={() => onPractice('cards')}>
            <Layers aria-hidden />
            {t('history.practiceCards')}
          </Button>
        </div>
      )}

      {words.error && <p className="text-destructive">{words.error.message}</p>}
      {words.isSuccess && !items.length && (
        <p className="py-6 text-muted-foreground">
          {sort === 'revise' ? t('history.nothingToRevise') : t('history.emptyTitle')}
        </p>
      )}

      <ul className="divide-y">
        {items.map((v) => (
          <li key={v.id} className="flex items-start justify-between gap-3 py-3">
            <div className="min-w-0 space-y-0.5">
              <p className="font-serif text-lg font-semibold">{v.term}</p>
              {!scope.bookId && (
                <p className="truncate text-sm text-muted-foreground italic">{v.bookTitle}</p>
              )}
            </div>
            <div className="shrink-0 space-y-1 text-right text-sm">
              <p className="tabular-nums">
                {t('history.wordStats', {
                  count: v.reviews,
                  percent: percent(v.reviewsRight, v.reviews),
                })}
              </p>
              <p className="flex items-center justify-end gap-2 text-muted-foreground">
                {v.lastReviewed !== null && timeAgo(v.lastReviewed, locale)}
                <StatusChip status={v.status} />
              </p>
            </div>
          </li>
        ))}
      </ul>

      {words.hasNextPage && (
        <Button
          variant="outline"
          className="w-full"
          disabled={words.isFetchingNextPage}
          onClick={() => void words.fetchNextPage()}
        >
          {t('history.more')}
        </Button>
      )}
    </section>
  )
}
