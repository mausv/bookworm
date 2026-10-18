import { useQuery } from '@tanstack/react-query'
import { Search } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { HIGHLIGHT_TYPES, type HighlightType } from '@/shared/types'
import { BookHeader } from '@/web/components/book-header'
import { HighlightList } from '@/web/components/highlight-list'
import { LoreEntries } from '@/web/components/lore-entries'
import { TYPE_BG, TYPE_PLURAL } from '@/web/components/type-style'
import { VocabList } from '@/web/components/vocab-list'
import { useDebouncedValue } from '@/web/hooks/use-debounced-value'
import { api } from '@/web/lib/api'
import type { BookDetail } from '@/web/lib/types'
import { cn } from '@/web/lib/utils'

export function BookPage() {
  const { id = '' } = useParams()
  const book = useQuery({
    queryKey: ['book', id],
    queryFn: () => api<{ book: BookDetail }>(`/books/${id}`),
  })

  if (book.isPending) return null
  if (book.error) {
    return (
      <div className="mx-auto max-w-2xl space-y-2">
        <p className="text-destructive">{book.error.message}</p>
        <Link to="/" className="text-primary underline underline-offset-4">
          Back to the library
        </Link>
      </div>
    )
  }
  return <BookView book={book.data.book} />
}

function BookView({ book }: { book: BookDetail }) {
  const [params, setParams] = useSearchParams()
  const tab =
    HIGHLIGHT_TYPES.find((t) => t === params.get('tab')) ??
    HIGHLIGHT_TYPES.find((t) => book.counts[t] > 0) ??
    'vocab'
  const chapter = params.get('chapter') ?? undefined
  const tag = params.get('tag') ?? undefined
  const entries = tab === 'lore' && params.get('view') === 'entries'
  const [search, setSearch] = useState('')
  const q = useDebouncedValue(search.trim())

  function update(changes: Record<string, string | undefined>) {
    setParams(
      (current) => {
        const next = new URLSearchParams(current)
        for (const [key, value] of Object.entries(changes)) {
          if (value) next.set(key, value)
          else next.delete(key)
        }
        return next
      },
      { replace: true }
    )
  }

  const tags = useQuery({
    queryKey: ['tags', book.id],
    queryFn: () => api<{ tags: { tag: string; count: number }[] }>(`/books/${book.id}/tags`),
  })

  const chapterCount = (c: { counts: BookDetail['counts'] }) => c.counts[tab]
  const showSearch = tab !== 'vocab' && !entries

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <BookHeader book={book} />

      <nav aria-label="Highlight types" className="-mx-4 overflow-x-auto px-4">
        <ul className="flex min-w-max gap-1 border-b">
          {HIGHLIGHT_TYPES.map((t) => (
            <li key={t}>
              <button
                type="button"
                aria-current={t === tab ? 'page' : undefined}
                onClick={() => update({ tab: t, view: undefined })}
                className={cn(
                  'relative flex h-11 items-center gap-2 px-3 text-sm transition-colors',
                  t === tab
                    ? 'font-medium text-foreground after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:bg-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <span aria-hidden className={cn('size-2 rounded-full', TYPE_BG[t])} />
                {TYPE_PLURAL[t]}
                <span className="text-muted-foreground tabular-nums">{book.counts[t]}</span>
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <div className="space-y-4">
        {tab === 'lore' && (
          <div role="radiogroup" aria-label="Lore view" className="flex gap-1">
            {[
              { value: undefined, label: 'Highlights' },
              { value: 'entries', label: `Entries (${book.loreEntries})` },
            ].map((option) => (
              <button
                key={option.label}
                type="button"
                role="radio"
                aria-checked={(option.value === 'entries') === entries}
                onClick={() => update({ view: option.value })}
                className={cn(
                  'h-11 rounded-full px-4 text-sm sm:h-9',
                  (option.value === 'entries') === entries
                    ? 'bg-foreground text-background'
                    : 'bg-muted text-muted-foreground hover:text-foreground'
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        )}

        {!entries && (
          <div className="flex flex-col gap-2 sm:flex-row">
            {(book.chapters.length > 0 || book.unchaptered[tab] > 0) && (
              <NativeSelect
                aria-label="Chapter"
                className="w-full sm:w-64"
                value={chapter ?? ''}
                onChange={(e) => update({ chapter: e.target.value || undefined })}
              >
                <option value="">All chapters ({book.counts[tab]})</option>
                {book.chapters.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title} ({chapterCount(c)})
                  </option>
                ))}
                {book.chapters.length > 0 && book.unchaptered[tab] > 0 && (
                  <option value="none">No chapter ({book.unchaptered[tab]})</option>
                )}
              </NativeSelect>
            )}
            {showSearch && (
              <div className="relative flex-1">
                <Search
                  aria-hidden
                  className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                />
                <Input
                  type="search"
                  aria-label="Search highlights and notes"
                  placeholder="Search highlights and notes"
                  className="pl-9"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            )}
          </div>
        )}

        {showSearch && !!tags.data?.tags.length && (
          <ul aria-label="Filter by tag" className="flex flex-wrap gap-1.5">
            {tags.data.tags.map(({ tag: t, count }) => (
              <li key={t}>
                <button
                  type="button"
                  aria-pressed={tag === t}
                  onClick={() => update({ tag: tag === t ? undefined : t })}
                  className={cn(
                    'h-9 rounded-full px-3 text-sm transition-colors',
                    tag === t
                      ? 'bg-foreground text-background'
                      : 'bg-muted text-foreground hover:bg-muted/70'
                  )}
                >
                  {t} <span className="tabular-nums opacity-60">{count}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <TabContent book={book} tab={tab} entries={entries} chapter={chapter} q={q} tag={tag} />
    </div>
  )
}

function TabContent({
  book,
  tab,
  entries,
  chapter,
  q,
  tag,
}: {
  book: BookDetail
  tab: HighlightType
  entries: boolean
  chapter?: string
  q: string
  tag?: string
}) {
  if (entries) return <LoreEntries bookId={book.id} />
  const grouped = !chapter && book.chapters.length > 0
  if (tab === 'vocab') return <VocabList bookId={book.id} chapterId={chapter} grouped={grouped} />
  return (
    <HighlightList
      grouped={grouped}
      filter={{ bookId: book.id, type: tab, chapterId: chapter, q: q || undefined, tag }}
    />
  )
}
