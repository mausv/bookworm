import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { type FormEvent, type RefObject, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'
import type { HighlightType } from '@/shared/types'
import { api } from '@/web/lib/api'
import { useLocale, useT } from '@/web/lib/i18n'
import { invalidateReading } from '@/web/lib/queries'
import type { Book, BookDetail, Highlight } from '@/web/lib/types'
import { LanguageSelect } from './book-header'
import { TypePicker } from './type-picker'

const NEW_BOOK = 'new'

export function AddHighlightDialog({
  open,
  onOpenChange,
  book,
  defaultType = 'unclassified',
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  book?: BookDetail
  defaultType?: HighlightType
}) {
  const t = useT()
  const textRef = useRef<HTMLTextAreaElement>(null)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        initialFocus={textRef}
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg"
      >
        <DialogHeader>
          <DialogTitle className="text-xl">{t('add.title')}</DialogTitle>
          <DialogDescription>{book ? book.title : t('add.description')}</DialogDescription>
        </DialogHeader>
        <AddHighlightForm
          book={book}
          defaultType={defaultType}
          textRef={textRef}
          onDone={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  )
}

function AddHighlightForm({
  book,
  defaultType,
  textRef,
  onDone,
}: {
  book?: BookDetail
  defaultType: HighlightType
  textRef: RefObject<HTMLTextAreaElement | null>
  onDone: () => void
}) {
  const t = useT()
  const { locale } = useLocale()
  const queryClient = useQueryClient()
  const [bookId, setBookId] = useState('')
  const [title, setTitle] = useState('')
  const [author, setAuthor] = useState('')
  const [language, setLanguage] = useState<string>(locale)
  const [text, setText] = useState('')
  const [type, setType] = useState(defaultType)
  const [chapter, setChapter] = useState('')
  const [page, setPage] = useState('')
  const [note, setNote] = useState('')
  const [another, setAnother] = useState(true)

  const books = useQuery({
    queryKey: ['books'],
    queryFn: () => api<{ books: Book[] }>('/books'),
    enabled: !book,
  })
  const shelf = [...(books.data?.books ?? [])].sort((a, b) => a.title.localeCompare(b.title))
  const newBook = !book && (bookId === NEW_BOOK || (books.isSuccess && !shelf.length))
  const targetId = book?.id ?? (newBook ? undefined : bookId || undefined)

  const target = useQuery({
    queryKey: ['book', targetId],
    queryFn: () => api<{ book: BookDetail }>(`/books/${targetId}`),
    enabled: !book && !!targetId,
  })
  const chapters = (book ?? target.data?.book)?.chapters ?? []

  const create = useMutation({
    mutationFn: () =>
      api<{ highlight: Highlight }>('/highlights', {
        method: 'POST',
        json: {
          ...(newBook
            ? { book: { title: title.trim(), author: author.trim() || null, language } }
            : { bookId: targetId }),
          text: text.trim(),
          type,
          chapter: chapter.trim() || null,
          page: page.trim() || null,
          note: note.trim() || null,
        },
      }),
    onSuccess: async ({ highlight }) => {
      toast.success(t('add.added'))
      await invalidateReading(queryClient)
      if (!another) return onDone()
      if (newBook) setBookId(highlight.bookId)
      setText('')
      setNote('')
      textRef.current?.focus()
    },
    onError: (error) => toast.error(error.message),
  })

  function submit(event: FormEvent) {
    event.preventDefault()
    create.mutate()
  }

  const ready = !!text.trim() && (newBook ? !!title.trim() : !!targetId)

  return (
    <form onSubmit={submit} className="space-y-4">
      {!book && books.isSuccess && shelf.length > 0 && (
        <div className="space-y-1.5">
          <Label htmlFor="add-book">{t('add.book')}</Label>
          <NativeSelect
            id="add-book"
            className="w-full"
            value={bookId}
            onChange={(e) => setBookId(e.target.value)}
            required
          >
            <option value="" disabled>
              {t('add.chooseBook')}
            </option>
            {shelf.map((b) => (
              <option key={b.id} value={b.id}>
                {b.title}
              </option>
            ))}
            <option value={NEW_BOOK}>{t('add.newBook')}</option>
          </NativeSelect>
        </div>
      )}
      {newBook && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="add-title">{t('book.title')}</Label>
            <Input
              id="add-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="add-author">{t('book.author')}</Label>
            <Input id="add-author" value={author} onChange={(e) => setAuthor(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="add-language">{t('book.language')}</Label>
            <LanguageSelect id="add-language" value={language} onChange={setLanguage} />
          </div>
        </div>
      )}
      <div className="space-y-1.5">
        <Label htmlFor="add-text">{t('add.text')}</Label>
        <Textarea
          ref={textRef}
          id="add-text"
          className="font-serif text-lg"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={type === 'vocab' ? t('add.vocabPlaceholder') : t('add.textPlaceholder')}
          required
        />
      </div>
      <TypePicker value={type} onChange={setType} />
      <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
        <div className="space-y-1.5">
          <Label htmlFor="add-chapter">{t('add.chapter')}</Label>
          <Input
            id="add-chapter"
            list="add-chapters"
            value={chapter}
            onChange={(e) => setChapter(e.target.value)}
            autoComplete="off"
          />
          <datalist id="add-chapters">
            {chapters.map((c) => (
              <option key={c.id} value={c.title} />
            ))}
          </datalist>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="add-page">{t('add.page')}</Label>
          <Input
            id="add-page"
            inputMode="numeric"
            value={page}
            onChange={(e) => setPage(e.target.value)}
            autoComplete="off"
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="add-note">
          {type === 'vocab' ? t('add.definitionNote') : t('field.note')}
        </Label>
        <Textarea id="add-note" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      <DialogFooter className="sm:items-center">
        <label className="flex min-h-11 items-center gap-2 text-sm sm:mr-auto sm:min-h-0">
          <input
            type="checkbox"
            className="size-4 accent-primary"
            checked={another}
            onChange={(e) => setAnother(e.target.checked)}
          />
          {t('add.another')}
        </label>
        <Button type="button" variant="outline" onClick={onDone}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" disabled={create.isPending || !ready}>
          {create.isPending ? t('common.adding') : t('add.submit')}
        </Button>
      </DialogFooter>
    </form>
  )
}
