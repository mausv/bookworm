import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router'
import { NativeSelect } from '@/components/ui/native-select'
import { Flashcards } from '@/web/components/flashcards'
import { MatchGame } from '@/web/components/match-game'
import { Quiz } from '@/web/components/quiz'
import { api } from '@/web/lib/api'
import { useT } from '@/web/lib/i18n'
import type { Book, BookDetail } from '@/web/lib/types'
import { cn } from '@/web/lib/utils'

export interface Scope {
  bookId?: string
  chapterId?: string
}

const MODES = [
  { value: 'cards', label: 'review.cards' },
  { value: 'quiz', label: 'review.quiz' },
  { value: 'match', label: 'review.match' },
] as const

export function ReviewPage() {
  const t = useT()
  const [params, setParams] = useSearchParams()
  const bookId = params.get('bookId') ?? undefined
  const chapterId = params.get('chapterId') ?? undefined
  const mode = MODES.find((m) => m.value === params.get('mode'))?.value ?? 'cards'

  const books = useQuery({
    queryKey: ['books'],
    queryFn: () => api<{ books: Book[] }>('/books'),
  })
  const book = useQuery({
    queryKey: ['book', bookId],
    queryFn: () => api<{ book: BookDetail }>(`/books/${bookId}`),
    enabled: !!bookId,
  })

  function update(changes: Record<string, string | undefined>) {
    const next = new URLSearchParams(params)
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value)
      else next.delete(key)
    }
    setParams(next, { replace: true })
  }

  const withVocab = (books.data?.books ?? []).filter((b) => b.counts.vocab > 0)
  const chapters = (book.data?.book.chapters ?? []).filter((c) => c.counts.vocab > 0)
  const scope: Scope = { bookId, chapterId }
  const scopeKey = `${bookId}-${chapterId}`

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-3xl sm:text-4xl">{t('nav.review')}</h1>
        <div
          role="radiogroup"
          aria-label={t('review.mode')}
          className="flex gap-1 rounded-full bg-muted p-1"
        >
          {MODES.map((m) => (
            <button
              key={m.value}
              type="button"
              role="radio"
              aria-checked={mode === m.value}
              onClick={() => update({ mode: m.value === 'cards' ? undefined : m.value })}
              className={cn(
                'h-10 rounded-full px-4 text-sm transition-colors sm:h-8',
                mode === m.value
                  ? 'bg-background font-medium shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {t(m.label)}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <NativeSelect
          aria-label={t('common.book')}
          className="w-full sm:flex-1"
          value={bookId ?? ''}
          onChange={(e) => update({ bookId: e.target.value || undefined, chapterId: undefined })}
        >
          <option value="">{t('common.allBooks')}</option>
          {withVocab.map((b) => (
            <option key={b.id} value={b.id}>
              {b.title}
            </option>
          ))}
        </NativeSelect>
        {bookId && chapters.length > 0 && (
          <NativeSelect
            aria-label={t('common.chapter')}
            className="w-full sm:flex-1"
            value={chapterId ?? ''}
            onChange={(e) => update({ chapterId: e.target.value || undefined })}
          >
            <option value="">{t('review.allChapters')}</option>
            {chapters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </NativeSelect>
        )}
      </div>

      {mode === 'quiz' && <Quiz key={scopeKey} scope={scope} />}
      {mode === 'match' && <MatchGame key={scopeKey} scope={scope} />}
      {mode === 'cards' && <Flashcards key={scopeKey} scope={scope} />}
    </div>
  )
}
