import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Download, EllipsisVertical, Pencil, Trash2 } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { api } from '@/web/lib/api'
import { invalidateReading } from '@/web/lib/queries'
import type { BookDetail } from '@/web/lib/types'
import { ConfirmDialog } from './confirm-dialog'

export function BookHeader({ book }: { book: BookDetail }) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [editing, setEditing] = useState(false)
  const [confirming, setConfirming] = useState(false)

  const remove = useMutation({
    mutationFn: () => api(`/books/${book.id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      toast.success(`Deleted ${book.title}`)
      navigate('/', { replace: true })
      await invalidateReading(queryClient)
    },
    onError: (error) => toast.error(error.message),
  })

  if (editing) return <BookDetailsForm book={book} onDone={() => setEditing(false)} />

  return (
    <header className="flex items-start gap-3">
      <div className="min-w-0 flex-1 space-y-1">
        <h1 className="text-3xl leading-tight text-balance sm:text-4xl">{book.title}</h1>
        <p className="text-lg text-muted-foreground">
          {book.author && <span className="italic">{book.author}</span>}
          {book.author && ', '}
          <span>{languageName(book.language)}</span>
        </p>
      </div>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Edit details"
        onClick={() => setEditing(true)}
      >
        <Pencil />
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="ghost" size="icon" aria-label="More actions" />}
        >
          <EllipsisVertical />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem render={<a href={`/api/export/books/${book.id}/markdown`} download />}>
            <Download />
            Markdown for Obsidian
          </DropdownMenuItem>
          <DropdownMenuItem
            render={<a href={`/api/export/vocab.tsv?bookId=${book.id}`} download />}
          >
            <Download />
            Vocab for Anki
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={() => setConfirming(true)}>
            <Trash2 />
            Delete book
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Delete ${book.title}?`}
        description="All of its highlights, vocabulary and lore are removed."
        confirmLabel="Delete book"
        pending={remove.isPending}
        onConfirm={() => remove.mutate()}
      />
    </header>
  )
}

function languageName(code: string) {
  try {
    return new Intl.DisplayNames(['en'], { type: 'language' }).of(code) ?? code
  } catch {
    return code
  }
}

function BookDetailsForm({ book, onDone }: { book: BookDetail; onDone: () => void }) {
  const queryClient = useQueryClient()
  const [title, setTitle] = useState(book.title)
  const [author, setAuthor] = useState(book.author ?? '')
  const [language, setLanguage] = useState(book.language)

  const save = useMutation({
    mutationFn: () =>
      api(`/books/${book.id}`, {
        method: 'PATCH',
        json: { title: title.trim(), author: author.trim() || null, language: language.trim() },
      }),
    onSuccess: async () => {
      await invalidateReading(queryClient)
      onDone()
    },
    onError: (error) => toast.error(error.message),
  })

  function submit(event: FormEvent) {
    event.preventDefault()
    save.mutate()
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="book-title">Title</Label>
        <Input
          id="book-title"
          className="font-heading text-xl"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
        <div className="space-y-1.5">
          <Label htmlFor="book-author">Author</Label>
          <Input id="book-author" value={author} onChange={(e) => setAuthor(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="book-language">Language code</Label>
          <Input
            id="book-language"
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            placeholder="en"
            required
          />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={save.isPending || !title.trim() || !language.trim()}>
          {save.isPending ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </form>
  )
}
