import { useQuery } from '@tanstack/react-query'
import { Upload } from 'lucide-react'
import { Link, useOutletContext } from 'react-router'
import { Button } from '@/components/ui/button'
import type { ShellContext } from '@/web/components/app-shell'
import { TypeCounts, TypeSpine } from '@/web/components/type-counts'
import { api } from '@/web/lib/api'
import type { Book } from '@/web/lib/types'

export function LibraryPage() {
  const { openImport } = useOutletContext<ShellContext>()
  const { data, error, isPending } = useQuery({
    queryKey: ['books'],
    queryFn: () => api<{ books: Book[] }>('/books'),
  })

  if (isPending) return null
  if (error) return <p className="text-destructive">{error.message}</p>

  const books = [...data.books].sort((a, b) => a.title.localeCompare(b.title))
  if (!books.length) return <EmptyLibrary onImport={openImport} />

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-6 text-3xl sm:text-4xl">Library</h1>
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
                <TypeCounts counts={book.counts} className="pt-1" />
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

function EmptyLibrary({ onImport }: { onImport: () => void }) {
  const origin = window.location.origin
  return (
    <div className="mx-auto max-w-xl space-y-8">
      <div className="space-y-3">
        <h1 className="text-3xl sm:text-4xl">Your shelf is empty</h1>
        <p className="text-lg text-muted-foreground">
          Bring in your Kindle highlights and they’ll be sorted into vocabulary, quotes and lore by
          the colors you used.
        </p>
        <Button size="lg" onClick={onImport}>
          <Upload />
          Import highlights
        </Button>
      </div>
      <dl className="space-y-5">
        <div className="space-y-1">
          <dt className="font-heading text-lg">From the Kindle app</dt>
          <dd className="text-muted-foreground">
            Open a book, tap Notebook, then Share, Export notebook and choose HTML. Import the file
            you get.
          </dd>
        </div>
        <div className="space-y-1">
          <dt className="font-heading text-lg">From a Kindle device</dt>
          <dd className="text-muted-foreground">
            Connect it over USB and copy <code className="font-mono text-sm">My Clippings.txt</code>{' '}
            from the documents folder. Clippings have no colors, so they land in Triage.
          </dd>
        </div>
        <div className="space-y-1">
          <dt className="font-heading text-lg">From a script</dt>
          <dd className="space-y-2 text-muted-foreground">
            <p>Create an API key in Settings, then:</p>
            <code className="block rounded-md bg-muted p-3 font-mono text-xs break-all text-foreground">
              {`curl -H "Authorization: Bearer <key>" --data-binary @"My Clippings.txt" ${origin}/api/import`}
            </code>
          </dd>
        </div>
      </dl>
    </div>
  )
}
