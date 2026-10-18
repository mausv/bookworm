import { useQuery } from '@tanstack/react-query'
import { Plus, Search } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { HIGHLIGHT_TYPES, type HighlightType } from '@/shared/types'
import { AddHighlightDialog } from '@/web/components/add-highlight-dialog'
import { BookHeader } from '@/web/components/book-header'
import { HighlightList } from '@/web/components/highlight-list'
import { LoreEntries } from '@/web/components/lore-entries'
import { TYPE_BG } from '@/web/components/type-style'
import { VocabList } from '@/web/components/vocab-list'
import { useDebouncedValue } from '@/web/hooks/use-debounced-value'
import { api } from '@/web/lib/api'
import { useT } from '@/web/lib/i18n'
import type { BookDetail } from '@/web/lib/types'
import { cn } from '@/web/lib/utils'

export function BookPage() {
  const t = useT()
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
          {t('common.backToLibrary')}
        </Link>
      </div>
    )
  }
  return <BookView book={book.data.book} />
}

function BookView({ book }: { book: BookDetail }) {
  const t = useT()
  const [adding, setAdding] = useState(false)
  const [params, setParams] = useSearchParams()
  const tab =
    HIGHLIGHT_TYPES.find((type) => type === params.get('tab')) ??
    HIGHLIGHT_TYPES.find((type) => book.counts[type] > 0) ??
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

      <nav aria-label={t('book.types')} className="-mx-4 overflow-x-auto px-4">
        <ul className="flex min-w-max gap-1 border-b">
          {HIGHLIGHT_TYPES.map((type) => (
            <li key={type}>
              <button
                type="button"
                aria-current={type === tab ? 'page' : undefined}
                onClick={() => update({ tab: type, view: undefined })}
                className={cn(
                  'relative flex h-11 items-center gap-2 px-3 text-sm transition-colors',
                  type === tab
                    ? 'font-medium text-foreground after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:bg-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <span aria-hidden className={cn('size-2 rounded-full', TYPE_BG[type])} />
                {t(`types.${type}`)}
                <span className="text-muted-foreground tabular-nums">{book.counts[type]}</span>
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          {tab === 'lore' && (
            <div role="radiogroup" aria-label={t('book.loreView')} className="flex gap-1">
              {[
                { value: undefined, label: t('book.loreHighlights') },
                { value: 'entries', label: t('book.loreEntries', { count: book.loreEntries }) },
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
          <Button variant="outline" className="ml-auto" onClick={() => setAdding(true)}>
            <Plus />
            {t('add.button')}
          </Button>
        </div>

        {!entries && (
          <div className="flex flex-col gap-2 sm:flex-row">
            {(book.chapters.length > 0 || book.unchaptered[tab] > 0) && (
              <NativeSelect
                aria-label={t('common.chapter')}
                className="w-full sm:w-64"
                value={chapter ?? ''}
                onChange={(e) => update({ chapter: e.target.value || undefined })}
              >
                <option value="">{t('book.allChapters', { count: book.counts[tab] })}</option>
                {book.chapters.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title} ({chapterCount(c)})
                  </option>
                ))}
                {book.chapters.length > 0 && book.unchaptered[tab] > 0 && (
                  <option value="none">
                    {t('book.noChapter', { count: book.unchaptered[tab] })}
                  </option>
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
                  aria-label={t('book.search')}
                  placeholder={t('book.search')}
                  className="pl-9"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            )}
          </div>
        )}

        {showSearch && !!tags.data?.tags.length && (
          <ul aria-label={t('book.filterByTag')} className="flex flex-wrap gap-1.5">
            {tags.data.tags.map(({ tag: name, count }) => (
              <li key={name}>
                <button
                  type="button"
                  aria-pressed={tag === name}
                  onClick={() => update({ tag: tag === name ? undefined : name })}
                  className={cn(
                    'h-9 rounded-full px-3 text-sm transition-colors',
                    tag === name
                      ? 'bg-foreground text-background'
                      : 'bg-muted text-foreground hover:bg-muted/70'
                  )}
                >
                  {name} <span className="tabular-nums opacity-60">{count}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <TabContent book={book} tab={tab} entries={entries} chapter={chapter} q={q} tag={tag} />

      <AddHighlightDialog open={adding} onOpenChange={setAdding} book={book} defaultType={tab} />
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
