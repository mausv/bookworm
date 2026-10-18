import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Sparkles } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { VOCAB_STATUSES, type VocabStatus } from '@/shared/types'
import { api } from '@/web/lib/api'
import { groupByChapter } from '@/web/lib/highlights'
import { invalidateReading } from '@/web/lib/queries'
import type { Page, Vocab } from '@/web/lib/types'
import { withQuery } from '@/web/lib/url'
import { cn } from '@/web/lib/utils'

const STATUS_LABEL: Record<VocabStatus, string> = {
  new: 'New',
  learning: 'Learning',
  known: 'Known',
}

export function VocabList({
  bookId,
  chapterId,
  grouped,
}: {
  bookId: string
  chapterId?: string
  grouped: boolean
}) {
  const query = useInfiniteQuery({
    queryKey: ['vocab', { bookId, chapterId }],
    queryFn: ({ pageParam }) =>
      api<Page<Vocab>>(withQuery('/vocab', { bookId, chapterId, cursor: pageParam })),
    initialPageParam: '',
    getNextPageParam: (last) => last.nextCursor,
  })

  if (query.isPending) return null
  if (query.error) return <p className="text-destructive">{query.error.message}</p>

  const items = query.data.pages.flatMap((p) => p.items)
  if (!items.length) return <p className="py-10 text-center text-muted-foreground">No words yet.</p>

  return (
    <div className="space-y-10">
      {(grouped ? groupByChapter(items) : [{ chapterId: null, chapter: null, items }]).map(
        (group, i) => (
          <section key={`${group.chapterId}-${i}`} className="space-y-6">
            {grouped && (
              <h2 className="text-lg text-muted-foreground italic">
                {group.chapter ?? 'No chapter'}
              </h2>
            )}
            <ol className="space-y-7">
              {group.items.map((v) => (
                <li key={v.id}>
                  <VocabItem vocab={v} />
                </li>
              ))}
            </ol>
          </section>
        )
      )}
      {query.hasNextPage && (
        <div className="flex justify-center">
          <Button
            variant="outline"
            disabled={query.isFetchingNextPage}
            onClick={() => query.fetchNextPage()}
          >
            {query.isFetchingNextPage ? 'Loading…' : 'Load more'}
          </Button>
        </div>
      )}
    </div>
  )
}

export function StatusChip({ status }: { status: VocabStatus }) {
  return (
    <span
      className={cn(
        'rounded-full px-2 py-0.5 text-xs',
        status === 'known' ? 'bg-foreground text-background' : 'bg-muted text-foreground',
        status === 'learning' && 'ring-1 ring-foreground/30'
      )}
    >
      {STATUS_LABEL[status]}
    </span>
  )
}

function VocabItem({ vocab }: { vocab: Vocab }) {
  const [editing, setEditing] = useState(false)

  return (
    <article className="border-l-[3px] border-vocab pl-4">
      <button
        type="button"
        aria-expanded={editing}
        onClick={() => setEditing(!editing)}
        className="-mx-2 block w-[calc(100%+1rem)] space-y-1 rounded-md px-2 py-1 text-left transition-colors hover:bg-muted/50"
      >
        <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="font-serif text-xl font-semibold">{vocab.term}</span>
          {vocab.partOfSpeech && (
            <span className="font-serif text-muted-foreground italic">{vocab.partOfSpeech}</span>
          )}
          <StatusChip status={vocab.status} />
        </span>
        {vocab.definition ? (
          <span className="block">{vocab.definition}</span>
        ) : (
          <span className="block text-muted-foreground italic">No definition yet</span>
        )}
      </button>
      <div className="mt-1 space-y-2 text-sm text-muted-foreground">
        {vocab.definitionBy === 'claude' && (
          <p className="flex items-center gap-1">
            <Sparkles aria-hidden className="size-3.5" />
            Defined by Claude
          </p>
        )}
        {vocab.context.trim() !== vocab.term && (
          <p className="font-serif text-base/relaxed">{vocab.context}</p>
        )}
        {vocab.example && <p className="font-serif text-base/relaxed italic">{vocab.example}</p>}
        {editing && <VocabEditor vocab={vocab} onDone={() => setEditing(false)} />}
      </div>
    </article>
  )
}

function VocabEditor({ vocab, onDone }: { vocab: Vocab; onDone: () => void }) {
  const queryClient = useQueryClient()
  const [term, setTerm] = useState(vocab.term)
  const [definition, setDefinition] = useState(vocab.definition ?? '')
  const [partOfSpeech, setPartOfSpeech] = useState(vocab.partOfSpeech ?? '')
  const [example, setExample] = useState(vocab.example ?? '')
  const [status, setStatus] = useState(vocab.status)
  const id = vocab.id

  const save = useMutation({
    mutationFn: () => {
      const nextDefinition = definition.trim() || null
      return api(`/vocab/${id}`, {
        method: 'PATCH',
        json: {
          term: term.trim(),
          definition: nextDefinition,
          partOfSpeech: partOfSpeech.trim() || null,
          example: example.trim() || null,
          status,
          ...(nextDefinition !== vocab.definition && {
            definitionBy: nextDefinition ? 'me' : null,
          }),
        },
      })
    },
    onSuccess: async () => {
      await invalidateReading(queryClient)
      onDone()
    },
    onError: (error) => toast.error(error.message),
  })

  return (
    <form
      className="space-y-4 rounded-lg bg-card p-3 text-foreground ring-1 ring-border sm:p-4"
      onSubmit={(e) => {
        e.preventDefault()
        save.mutate()
      }}
    >
      <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
        <div className="space-y-1.5">
          <Label htmlFor={`term-${id}`}>Term</Label>
          <Input
            id={`term-${id}`}
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`pos-${id}`}>Part of speech</Label>
          <Input
            id={`pos-${id}`}
            value={partOfSpeech}
            onChange={(e) => setPartOfSpeech(e.target.value)}
            placeholder="noun, verb…"
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`def-${id}`}>Definition</Label>
        <Textarea
          id={`def-${id}`}
          value={definition}
          onChange={(e) => setDefinition(e.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`example-${id}`}>Example</Label>
        <Textarea
          id={`example-${id}`}
          value={example}
          onChange={(e) => setExample(e.target.value)}
          placeholder="A sentence of your own"
        />
      </div>
      <div className="space-y-1.5">
        <p id={`status-${id}`} className="text-sm font-medium">
          Status
        </p>
        <div
          role="radiogroup"
          aria-labelledby={`status-${id}`}
          className="grid grid-cols-3 gap-1.5"
        >
          {VOCAB_STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={status === s}
              onClick={() => setStatus(s)}
              className={cn(
                'h-11 rounded-lg border text-sm sm:h-9',
                status === s
                  ? 'border-foreground/40 bg-background font-medium'
                  : 'border-transparent bg-muted/60 text-muted-foreground hover:text-foreground'
              )}
            >
              {STATUS_LABEL[s]}
            </button>
          ))}
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={save.isPending || !term.trim()}>
          {save.isPending ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </form>
  )
}
