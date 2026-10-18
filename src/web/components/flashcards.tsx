import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Sparkles } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { NativeSelect } from '@/components/ui/native-select'
import type { VocabStatus } from '@/shared/types'
import { api } from '@/web/lib/api'
import { type CardGrade, nextStatus, splitTerm } from '@/web/lib/review'
import type { Page, Vocab } from '@/web/lib/types'
import { withQuery } from '@/web/lib/url'
import type { Scope } from '@/web/pages/review'
import { StatusChip } from './vocab-list'

const FILTERS = {
  due: { label: 'New and learning', statuses: ['new', 'learning'] },
  new: { label: 'New', statuses: ['new'] },
  learning: { label: 'Learning', statuses: ['learning'] },
  known: { label: 'Known', statuses: ['known'] },
  all: { label: 'All words', statuses: [undefined] },
} satisfies Record<string, { label: string; statuses: (VocabStatus | undefined)[] }>

type Filter = keyof typeof FILTERS

const GRADES: { grade: CardGrade; label: string }[] = [
  { grade: 'again', label: 'Again' },
  { grade: 'good', label: 'Got it' },
  { grade: 'known', label: 'Known' },
]

export function Flashcards({ scope }: { scope: Scope }) {
  const queryClient = useQueryClient()
  const [filter, setFilter] = useState<Filter>('due')
  const [index, setIndex] = useState(0)
  const [revealed, setRevealed] = useState(false)

  const deck = useQuery({
    queryKey: ['flashcards', scope, filter],
    queryFn: async () => {
      const pages = await Promise.all(
        FILTERS[filter].statuses.map((status) =>
          api<Page<Vocab>>(withQuery('/vocab', { ...scope, status, limit: 200 }))
        )
      )
      return pages.flatMap((p) => p.items)
    },
    staleTime: Infinity,
    gcTime: 0,
    refetchOnWindowFocus: false,
  })

  const grade = useMutation({
    mutationFn: ({ id, status }: { id: string; status: VocabStatus }) =>
      api(`/vocab/${id}`, { method: 'PATCH', json: { status } }),
    onError: (error) => toast.error(error.message),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['vocab'] }),
  })

  function restart(next: Filter = filter) {
    setFilter(next)
    setIndex(0)
    setRevealed(false)
    void queryClient.invalidateQueries({ queryKey: ['flashcards'] })
  }

  const filterSelect = (
    <NativeSelect
      aria-label="Which words"
      className="w-full sm:w-56"
      value={filter}
      onChange={(e) => {
        const next = Object.keys(FILTERS).find((f): f is Filter => f === e.target.value)
        if (next) restart(next)
      }}
    >
      {Object.entries(FILTERS).map(([value, { label }]) => (
        <option key={value} value={value}>
          {label}
        </option>
      ))}
    </NativeSelect>
  )

  if (deck.isPending) return filterSelect
  if (deck.error) return <p className="text-destructive">{deck.error.message}</p>

  const cards = deck.data
  const card = cards.at(index)

  if (!cards.length) {
    return (
      <div className="space-y-6">
        {filterSelect}
        <div className="space-y-2 py-6">
          <p className="font-heading text-2xl">No words to review here.</p>
          <p className="text-muted-foreground">
            Mark highlights as vocab in a book or in Triage, or pick a different set of words.
          </p>
        </div>
      </div>
    )
  }

  if (!card) {
    return (
      <div className="space-y-4 py-10 text-center">
        <p className="font-heading text-2xl">You went through all {cards.length} cards.</p>
        <Button onClick={() => restart()}>Start again</Button>
      </div>
    )
  }

  function answer(g: CardGrade) {
    if (!card) return
    const status = nextStatus(g, card.status)
    if (status !== card.status) grade.mutate({ id: card.id, status })
    setIndex((i) => i + 1)
    setRevealed(false)
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {filterSelect}
        <p className="text-sm text-muted-foreground tabular-nums" aria-live="polite">
          {index + 1} of {cards.length}
        </p>
      </div>

      <article
        key={card.id}
        className="min-h-72 animate-in space-y-5 rounded-2xl border border-l-4 border-l-vocab bg-card p-5 duration-200 fade-in-0 sm:p-7"
      >
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm text-muted-foreground italic">{card.bookTitle}</p>
          <StatusChip status={card.status} />
        </div>
        <h2 className="font-serif text-3xl font-semibold sm:text-4xl">
          {card.term}
          {card.partOfSpeech && (
            <span className="ml-2 text-xl font-normal text-muted-foreground italic">
              {card.partOfSpeech}
            </span>
          )}
        </h2>
        {revealed ? (
          <div className="space-y-4">
            {card.definition ? (
              <p className="text-lg">{card.definition}</p>
            ) : (
              <p className="text-muted-foreground">
                No definition yet. Ask Claude to define your new words through the Bookworm
                connector, or add one in the book.
              </p>
            )}
            {card.definitionBy === 'claude' && (
              <p className="flex items-center gap-1 text-sm text-muted-foreground">
                <Sparkles aria-hidden className="size-3.5" />
                Defined by Claude
              </p>
            )}
            <Context text={card.context} term={card.term} />
            {card.example && (
              <p className="font-serif text-base/relaxed text-muted-foreground italic">
                {card.example}
              </p>
            )}
          </div>
        ) : (
          <Button
            variant="secondary"
            size="lg"
            className="w-full"
            onClick={() => setRevealed(true)}
          >
            Show definition
          </Button>
        )}
      </article>

      {revealed && (
        <div className="grid grid-cols-3 gap-2">
          {GRADES.map(({ grade: g, label }) => (
            <Button
              key={g}
              variant={g === 'good' ? 'default' : 'outline'}
              size="lg"
              onClick={() => answer(g)}
            >
              {label}
            </Button>
          ))}
        </div>
      )}
    </div>
  )
}

export function Context({ text, term }: { text: string; term: string }) {
  if (text.trim() === term) return null
  const [before, match, after] = splitTerm(text, term)
  return (
    <p className="border-l-2 pl-3 font-serif text-base/relaxed text-muted-foreground">
      {before}
      {match !== undefined && <mark className="bg-vocab/30 text-foreground">{match}</mark>}
      {after}
    </p>
  )
}
