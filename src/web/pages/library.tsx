import { useQuery } from '@tanstack/react-query'
import { Plus, Upload } from 'lucide-react'
import { useState } from 'react'
import { Link, useOutletContext } from 'react-router'
import { Button } from '@/components/ui/button'
import { AddHighlightDialog } from '@/web/components/add-highlight-dialog'
import type { ShellContext } from '@/web/components/app-shell'
import { LibraryMissing, missingTotal } from '@/web/components/library-missing'
import { TypeCounts, TypeSpine } from '@/web/components/type-counts'
import { api } from '@/web/lib/api'
import { useT } from '@/web/lib/i18n'
import type { Book } from '@/web/lib/types'

export function LibraryPage() {
  const t = useT()
  const { openImport } = useOutletContext<ShellContext>()
  const [adding, setAdding] = useState(false)
  const { data, error, isPending } = useQuery({
    queryKey: ['books'],
    queryFn: () => api<{ books: Book[] }>('/books'),
  })

  if (isPending) return null
  if (error) return <p className="text-destructive">{error.message}</p>

  const books = [...data.books].sort((a, b) => a.title.localeCompare(b.title))
  const dialog = <AddHighlightDialog open={adding} onOpenChange={setAdding} />

  if (!books.length) {
    return (
      <>
        <EmptyLibrary onImport={openImport} onAdd={() => setAdding(true)} />
        {dialog}
      </>
    )
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6 flex items-center justify-between gap-3">
        <h1 className="text-3xl sm:text-4xl">{t('library.title')}</h1>
        <Button variant="outline" onClick={() => setAdding(true)}>
          <Plus />
          {t('add.button')}
        </Button>
      </div>
      <LibraryMissing books={books} />
      <ul className="divide-y">
        {books.map((book) => (
          <li key={book.id}>
            <Link
              to={`/books/${book.id}`}
              className="group flex gap-4 rounded-md py-4 focus-visible:outline-offset-4"
            >
              <TypeSpine counts={book.counts} className="self-stretch" />
              <div className="min-w-0 flex-1 space-y-1">
                <p className="font-heading text-xl leading-snug group-hover:underline group-hover:decoration-1 group-hover:underline-offset-4">
                  {book.title}
                </p>
                {book.author && <p className="text-muted-foreground italic">{book.author}</p>}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-1">
                  <TypeCounts counts={book.counts} />
                  {missingTotal(book) > 0 && (
                    <span className="text-sm text-muted-foreground tabular-nums">
                      {t('missing.badge', { count: missingTotal(book) })}
                    </span>
                  )}
                </div>
              </div>
            </Link>
          </li>
        ))}
      </ul>
      {dialog}
    </div>
  )
}

function EmptyLibrary({ onImport, onAdd }: { onImport: () => void; onAdd: () => void }) {
  const t = useT()
  const origin = window.location.origin
  return (
    <div className="mx-auto max-w-xl space-y-8">
      <div className="space-y-3">
        <h1 className="text-3xl sm:text-4xl">{t('library.emptyTitle')}</h1>
        <p className="text-lg text-muted-foreground">{t('library.emptyBody')}</p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <Button size="lg" onClick={onImport}>
            <Upload />
            {t('import.title')}
          </Button>
          <Button size="lg" variant="ghost" onClick={onAdd}>
            <Plus />
            {t('library.orAddByHand')}
          </Button>
        </div>
      </div>
      <dl className="space-y-5">
        <div className="space-y-1">
          <dt className="font-heading text-lg">{t('library.fromApp')}</dt>
          <dd className="text-muted-foreground">{t('library.fromAppSteps')}</dd>
        </div>
        <div className="space-y-1">
          <dt className="font-heading text-lg">{t('library.fromDevice')}</dt>
          <dd className="text-muted-foreground">
            {t('library.fromDeviceBefore')}{' '}
            <code className="font-mono text-sm">My Clippings.txt</code>{' '}
            {t('library.fromDeviceAfter')}
          </dd>
        </div>
        <div className="space-y-1">
          <dt className="font-heading text-lg">{t('library.fromScript')}</dt>
          <dd className="space-y-2 text-muted-foreground">
            <p>{t('library.fromScriptSteps')}</p>
            <code className="block rounded-md bg-muted p-3 font-mono text-xs break-all text-foreground">
              {`curl -H "Authorization: Bearer <key>" --data-binary @"My Clippings.txt" ${origin}/api/import`}
            </code>
          </dd>
        </div>
      </dl>
    </div>
  )
}
