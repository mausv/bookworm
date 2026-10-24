import { useQuery } from '@tanstack/react-query'
import { Check } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { api } from '@/web/lib/api'
import { type MessageKey, useT } from '@/web/lib/i18n'
import type { MatchCard } from '@/web/lib/types'
import { withQuery } from '@/web/lib/url'
import { cn } from '@/web/lib/utils'
import type { Scope } from '@/web/pages/review'

type Pair = 'definition' | 'translation'

const PAIRS: { value: Pair; label: MessageKey }[] = [
  { value: 'definition', label: 'match.definitions' },
  { value: 'translation', label: 'match.translations' },
]

function shuffle<T>(items: T[]) {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

function formatTime(ms: number) {
  const seconds = Math.round(ms / 1000)
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

function elapsedSince(start: number) {
  return Date.now() - start
}

function swapBest(key: string, ms: number) {
  try {
    const previous = Number(localStorage.getItem(key)) || undefined
    if (!previous || ms < previous) localStorage.setItem(key, String(ms))
    return previous
  } catch {
    return undefined
  }
}

export function MatchGame({ scope }: { scope: Scope }) {
  const t = useT()
  const [pair, setPair] = useState<Pair>('definition')
  const [round, setRound] = useState(0)

  return (
    <div className="space-y-5">
      <div
        role="radiogroup"
        aria-label={t('match.pairWith')}
        className="flex w-fit gap-1 rounded-full bg-muted p-1"
      >
        {PAIRS.map((p) => (
          <button
            key={p.value}
            type="button"
            role="radio"
            aria-checked={pair === p.value}
            onClick={() => setPair(p.value)}
            className={cn(
              'h-10 rounded-full px-4 text-sm transition-colors sm:h-8',
              pair === p.value
                ? 'bg-background font-medium shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {t(p.label)}
          </button>
        ))}
      </div>
      <MatchRound
        key={`${pair}-${round}`}
        scope={scope}
        pair={pair}
        round={round}
        onAgain={() => setRound((r) => r + 1)}
      />
    </div>
  )
}

function MatchRound({
  scope,
  pair,
  round,
  onAgain,
}: {
  scope: Scope
  pair: Pair
  round: number
  onAgain: () => void
}) {
  const t = useT()
  const [term, setTerm] = useState<string>()
  const [answer, setAnswer] = useState<string>()
  const [matched, setMatched] = useState<string[]>([])
  const [wrong, setWrong] = useState<{ term: string; answer: string }>()
  const [mistakes, setMistakes] = useState(0)
  const [missed, setMissed] = useState<string[]>([])
  const [result, setResult] = useState<{ ms: number; best?: number }>()

  const deal = useQuery({
    queryKey: ['match', scope, pair, round],
    queryFn: async () => {
      const { pairs } = await api<{ pairs: MatchCard[] }>(
        withQuery('/quiz/match', { ...scope, pair })
      )
      return { terms: pairs, answers: shuffle(pairs), startedAt: Date.now() }
    },
    staleTime: Infinity,
    gcTime: 0,
    refetchOnWindowFocus: false,
  })

  if (deal.isPending) return <p className="text-muted-foreground">{t('quiz.picking')}</p>
  if (deal.error) return <p className="text-destructive">{deal.error.message}</p>

  const { terms, answers, startedAt } = deal.data
  if (terms.length < 2) {
    return (
      <div className="space-y-3 py-6">
        <p className="font-heading text-2xl">
          {pair === 'translation' ? t('match.emptyTranslations') : t('quiz.emptyTitle')}
        </p>
        <p className="text-muted-foreground">
          {pair === 'translation' ? t('match.emptyTranslationsBody') : t('quiz.emptyBody')}
        </p>
      </div>
    )
  }

  function pick(side: 'term' | 'answer', id: string) {
    if (wrong || matched.includes(id)) return
    const nextTerm = side === 'term' ? id : term
    const nextAnswer = side === 'answer' ? id : answer
    if (!nextTerm || !nextAnswer) {
      setTerm(nextTerm)
      setAnswer(nextAnswer)
      return
    }
    setTerm(undefined)
    setAnswer(undefined)
    if (nextTerm !== nextAnswer) {
      setMistakes((m) => m + 1)
      setMissed((ids) => [...ids, nextTerm, nextAnswer])
      setWrong({ term: nextTerm, answer: nextAnswer })
      setTimeout(() => setWrong(undefined), 600)
      return
    }
    const next = [...matched, nextTerm]
    setMatched(next)
    if (next.length === terms.length) {
      const ms = elapsedSince(startedAt)
      const key = `bookworm.match.${pair}.${scope.bookId ?? 'all'}.${scope.chapterId ?? 'all'}`
      setResult({ ms, best: swapBest(key, ms) })
      const reviews = terms.map((c) => ({
        vocabId: c.vocabId,
        mode: 'match',
        correct: !missed.includes(c.vocabId),
      }))
      api('/reviews', { method: 'POST', json: { reviews } }).catch((error: Error) =>
        toast.error(error.message)
      )
    }
  }

  function cardClass(id: string, selected: boolean, isWrong: boolean) {
    return cn(
      'flex min-h-11 w-full items-center gap-2 rounded-lg border bg-card px-3 py-2 text-left transition-all',
      matched.includes(id)
        ? 'border-lore/40 bg-lore/15 text-muted-foreground opacity-60'
        : 'hover:border-foreground/40',
      selected && 'border-foreground ring-2 ring-foreground/15',
      isWrong && 'animate-shake border-destructive bg-destructive/10'
    )
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground tabular-nums" aria-live="polite">
        {t('match.progress', { n: matched.length, total: terms.length, mistakes })}
      </p>

      {result && (
        <div role="status" className="space-y-3 rounded-xl bg-lore/15 p-4 text-center">
          <p className="font-heading text-3xl tabular-nums">{formatTime(result.ms)}</p>
          <p className="text-muted-foreground">
            {mistakes === 0 ? t('match.noMistakes') : t('match.mistakes', { count: mistakes })}
            {' · '}
            {!result.best || result.ms < result.best
              ? t('match.newBest')
              : t('match.best', { time: formatTime(result.best) })}
          </p>
          <Button size="lg" onClick={onAgain} autoFocus>
            {t('match.again')}
          </Button>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <ul className="flex flex-wrap gap-2 sm:flex-col">
          {terms.map((c) => (
            <li key={c.vocabId} className="sm:w-full">
              <button
                type="button"
                aria-pressed={term === c.vocabId}
                disabled={matched.includes(c.vocabId)}
                onClick={() => pick('term', c.vocabId)}
                className={cardClass(c.vocabId, term === c.vocabId, wrong?.term === c.vocabId)}
              >
                {matched.includes(c.vocabId) && <Check aria-hidden className="size-4 shrink-0" />}
                <span className="font-serif text-lg font-semibold">{c.term}</span>
              </button>
            </li>
          ))}
        </ul>
        <ul className="space-y-2">
          {answers.map((c) => (
            <li key={c.vocabId}>
              <button
                type="button"
                aria-pressed={answer === c.vocabId}
                disabled={matched.includes(c.vocabId)}
                onClick={() => pick('answer', c.vocabId)}
                className={cardClass(c.vocabId, answer === c.vocabId, wrong?.answer === c.vocabId)}
              >
                {matched.includes(c.vocabId) && <Check aria-hidden className="size-4 shrink-0" />}
                <span className="text-sm/snug sm:text-base/snug">{c.answer}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
