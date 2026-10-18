import {
  keepPreviousData,
  type QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { Redo2, Sparkles, Undo2 } from 'lucide-react'
import { type PointerEvent, useEffect, useEffectEvent, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { NativeSelect } from '@/components/ui/native-select'
import type { HighlightType } from '@/shared/types'
import { TYPE_BG } from '@/web/components/type-style'
import { api } from '@/web/lib/api'
import { locationLabel } from '@/web/lib/highlights'
import { useT } from '@/web/lib/i18n'
import { invalidateReading } from '@/web/lib/queries'
import { swipeAction, type TriageAction, triageKey } from '@/web/lib/triage'
import type { Book, Highlight, Page } from '@/web/lib/types'
import { withQuery } from '@/web/lib/url'
import { cn } from '@/web/lib/utils'

type Target = Extract<TriageAction, { kind: 'classify' }>['type']

const TARGETS: { type: Target; keys: string }[] = [
  { type: 'vocab', keys: '1 V' },
  { type: 'quote', keys: '2 Q' },
  { type: 'lore', keys: '3 L' },
]

interface Step {
  highlight: Highlight
  type: Target | null
}

function shiftCounts(
  queryClient: QueryClient,
  bookId: string,
  from: HighlightType,
  to: HighlightType
) {
  queryClient.setQueryData<{ books: Book[] }>(['books'], (data) =>
    data
      ? {
          books: data.books.map((b) =>
            b.id === bookId
              ? {
                  ...b,
                  counts: { ...b.counts, [from]: b.counts[from] - 1, [to]: b.counts[to] + 1 },
                }
              : b
          ),
        }
      : data
  )
}

export function TriagePage() {
  const t = useT()
  const [params, setParams] = useSearchParams()
  const bookId = params.get('bookId') ?? undefined
  const books = useQuery({
    queryKey: ['books'],
    queryFn: () => api<{ books: Book[] }>('/books'),
  })

  const withUnclassified = (books.data?.books ?? []).filter(
    (b) => b.counts.unclassified > 0 || b.id === bookId
  )
  const total = (books.data?.books ?? [])
    .filter((b) => !bookId || b.id === bookId)
    .reduce((sum, b) => sum + b.counts.unclassified, 0)

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-3xl sm:text-4xl">{t('nav.triage')}</h1>
        <NativeSelect
          aria-label={t('common.book')}
          className="w-full sm:w-64"
          value={bookId ?? ''}
          onChange={(e) => setParams(e.target.value ? { bookId: e.target.value } : {})}
        >
          <option value="">{t('common.allBooks')}</option>
          {withUnclassified.map((b) => (
            <option key={b.id} value={b.id}>
              {b.title}
            </option>
          ))}
        </NativeSelect>
      </div>
      {books.data && <Triage key={bookId ?? ''} bookId={bookId} total={total} />}
    </div>
  )
}

function Triage({ bookId, total }: { bookId?: string; total: number }) {
  const t = useT()
  const queryClient = useQueryClient()
  const [skipped, setSkipped] = useState<string[]>([])
  const [classified, setClassified] = useState<string[]>([])
  const [history, setHistory] = useState<Step[]>([])
  const [revisit, setRevisit] = useState<Highlight>()

  const queue = useQuery({
    queryKey: ['triage', bookId ?? null, skipped.length],
    queryFn: () =>
      api<Page<Highlight>>(
        withQuery('/highlights', {
          type: 'unclassified',
          bookId,
          limit: 30,
          cursor: skipped.length || undefined,
        })
      ),
    placeholderData: keepPreviousData,
  })

  const pending = (queue.data?.items ?? []).filter(
    (h) => !classified.includes(h.id) && !skipped.includes(h.id)
  )
  const current = revisit ?? pending[0]
  const left = Math.max(0, total - skipped.length)

  const classify = useMutation({
    mutationFn: ({ id, type }: { id: string; type: HighlightType; bookId: string }) =>
      api('/highlights/classify', { method: 'POST', json: { ids: [id], type } }),
    onMutate: ({ type, bookId }) => {
      if (type !== 'unclassified') shiftCounts(queryClient, bookId, 'unclassified', type)
    },
    onError: (error, { id }) => {
      toast.error(error.message)
      setClassified((ids) => ids.filter((i) => i !== id))
    },
    onSettled: () => invalidateReading(queryClient),
  })

  function apply(type: Target) {
    if (!current) return
    setHistory((h) => [...h, { highlight: current, type }])
    setClassified((ids) => [...ids, current.id])
    setRevisit(undefined)
    classify.mutate({ id: current.id, type, bookId: current.bookId })
  }

  function skip() {
    if (!current) return
    setHistory((h) => [...h, { highlight: current, type: null }])
    setSkipped((ids) => [...ids, current.id])
    setRevisit(undefined)
  }

  function undo() {
    const last = history.at(-1)
    if (!last) return
    const { highlight, type } = last
    setHistory((h) => h.slice(0, -1))
    if (type) {
      setClassified((ids) => ids.filter((i) => i !== highlight.id))
      shiftCounts(queryClient, highlight.bookId, type, 'unclassified')
      classify.mutate(
        { id: highlight.id, type: 'unclassified', bookId: highlight.bookId },
        { onSuccess: () => toast(t('triage.movedBack')) }
      )
    } else {
      setSkipped((ids) => ids.filter((i) => i !== highlight.id))
    }
    setRevisit(highlight)
  }

  function accept() {
    const suggestion = current?.suggestedType
    if (suggestion && suggestion !== 'unclassified') apply(suggestion)
  }

  const onKey = useEffectEvent((event: KeyboardEvent) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return
    if (event.target instanceof HTMLElement && event.target.closest('input, textarea, select')) {
      return
    }
    const action = triageKey(event.key)
    if (!action) return
    event.preventDefault()
    if (action.kind === 'classify') apply(action.type)
    else if (action.kind === 'skip') skip()
    else undo()
  })

  useEffect(() => {
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (queue.isPending) return null
  if (queue.error) return <p className="text-destructive">{queue.error.message}</p>

  if (!current) {
    return (
      <div className="space-y-4 py-10 text-center">
        <p className="font-heading text-2xl">
          {skipped.length ? t('triage.onlySkipped') : t('triage.allSorted')}
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          {history.length > 0 && (
            <Button variant="outline" onClick={undo}>
              <Undo2 />
              {t('triage.undoLast')}
            </Button>
          )}
          {skipped.length > 0 ? (
            <Button
              onClick={() => {
                setSkipped([])
                setHistory([])
              }}
            >
              <Redo2 />
              {t('triage.skippedAgain')}
            </Button>
          ) : (
            <Button nativeButton={false} render={<Link to="/" />}>
              {t('common.backToLibrary')}
            </Button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {t('triage.left', { count: left })}
        {skipped.length > 0 && t('triage.skipped', { count: skipped.length })}
      </p>
      <TriageCard key={current.id} highlight={current} onSkip={skip} onAccept={accept} />
      <div className="grid grid-cols-3 gap-2">
        {TARGETS.map(({ type, keys }) => (
          <button
            key={type}
            type="button"
            onClick={() => apply(type)}
            className={cn(
              'flex min-h-20 flex-col items-center justify-center gap-1 rounded-xl border bg-card px-2 py-3 transition-colors hover:bg-muted',
              current.suggestedType === type && 'border-foreground/50'
            )}
          >
            <span className="flex items-center gap-2 font-medium">
              <span aria-hidden className={cn('size-3 rounded-full', TYPE_BG[type])} />
              {t(`type.${type}`)}
            </span>
            <span className="text-center text-xs text-muted-foreground">
              {t(`typeHint.${type}`)}
            </span>
            <kbd className="hidden font-sans text-xs text-muted-foreground pointer-fine:inline">
              {keys}
            </kbd>
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <Button variant="outline" className="flex-1" onClick={undo} disabled={!history.length}>
          <Undo2 />
          {t('triage.undo')}
          <kbd className="hidden font-sans text-xs text-muted-foreground pointer-fine:inline">
            U
          </kbd>
        </Button>
        <Button variant="outline" className="flex-1" onClick={skip}>
          {t('triage.skip')}
          <kbd className="hidden font-sans text-xs text-muted-foreground pointer-fine:inline">
            S
          </kbd>
        </Button>
      </div>
      <p className="text-center text-sm text-muted-foreground pointer-fine:hidden">
        {current.suggestedType ? t('triage.swipeBoth') : t('triage.swipeSkip')}
      </p>
    </div>
  )
}

function TriageCard({
  highlight,
  onSkip,
  onAccept,
}: {
  highlight: Highlight
  onSkip: () => void
  onAccept: () => void
}) {
  const t = useT()
  const start = useRef<{ x: number; y: number }>(null)
  const [dx, setDx] = useState(0)
  const location = locationLabel(highlight, t)
  const long = highlight.text.length > 280

  function onPointerDown(event: PointerEvent) {
    if (event.pointerType === 'mouse') return
    start.current = { x: event.clientX, y: event.clientY }
  }

  function onPointerMove(event: PointerEvent) {
    if (start.current) setDx(event.clientX - start.current.x)
  }

  function onPointerUp(event: PointerEvent) {
    if (!start.current) return
    const action = swipeAction(
      event.clientX - start.current.x,
      event.clientY - start.current.y,
      highlight.suggestedType
    )
    start.current = null
    setDx(0)
    if (action === 'skip') onSkip()
    if (action === 'accept') onAccept()
  }

  return (
    <article
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => {
        start.current = null
        setDx(0)
      }}
      style={{ transform: dx ? `translateX(${dx}px) rotate(${dx / 40}deg)` : undefined }}
      className={cn(
        'animate-in touch-pan-y space-y-5 rounded-2xl border border-l-4 border-l-unclassified bg-card p-5 duration-200 fade-in-0 select-none slide-in-from-right-6 sm:p-7',
        !dx && 'transition-transform'
      )}
    >
      <p className="text-sm text-muted-foreground">
        <span className="italic">{highlight.bookTitle}</span>
        {highlight.chapter && `, ${highlight.chapter}`}
        {location && `, ${location}`}
      </p>
      <blockquote
        className={cn(
          'font-serif text-pretty',
          long ? 'text-xl/relaxed' : 'text-2xl/snug sm:text-3xl/snug'
        )}
      >
        {highlight.text}
      </blockquote>
      {highlight.note && <p className="text-sm whitespace-pre-line">{highlight.note}</p>}
      {highlight.suggestedType && (
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Sparkles aria-hidden className="size-4" />
          {t(`looksLike.${highlight.suggestedType}`)}
        </p>
      )}
    </article>
  )
}
