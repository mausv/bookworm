import { useMutation, useQueryClient } from '@tanstack/react-query'
import { FileUp, X } from 'lucide-react'
import { type DragEvent, useState } from 'react'
import { Link } from 'react-router'
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
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { importFiles } from '@/web/lib/api'
import { invalidateReading } from '@/web/lib/queries'
import type { ImportResult } from '@/web/lib/types'
import { cn } from '@/web/lib/utils'

const ACCEPT = '.html,.htm,.txt,.json'

export function ImportDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const queryClient = useQueryClient()
  const [files, setFiles] = useState<File[]>([])
  const [source, setSource] = useState('')
  const [dragging, setDragging] = useState(false)
  const [results, setResults] = useState<ImportResult[]>()

  const upload = useMutation({
    mutationFn: () => importFiles(files, source || undefined),
    onSuccess: ({ results }) => {
      setResults(results)
      setFiles([])
      void invalidateReading(queryClient)
    },
    onError: (error) => toast.error(error.message),
  })

  function addFiles(list: FileList | null) {
    if (!list) return
    setResults(undefined)
    setFiles((current) => [...current, ...Array.from(list)])
  }

  function onDrop(event: DragEvent) {
    event.preventDefault()
    setDragging(false)
    addFiles(event.dataTransfer.files)
  }

  function changeOpen(next: boolean) {
    if (!next) {
      setFiles([])
      setResults(undefined)
    }
    onOpenChange(next)
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-xl">Import highlights</DialogTitle>
          <DialogDescription>
            A Kindle notebook export (.html), My Clippings.txt or a Readest annotations export
            (.json). Re-importing the same file only adds what’s new.
          </DialogDescription>
        </DialogHeader>

        <label
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={cn(
            'flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors has-focus-visible:border-ring',
            dragging ? 'border-primary bg-primary/5' : 'border-input hover:bg-muted/50'
          )}
        >
          <FileUp aria-hidden className="size-6 text-muted-foreground" />
          <span className="font-medium">Choose files or drop them here</span>
          <span className="text-sm text-muted-foreground">.html, .htm or .txt</span>
          <input
            type="file"
            multiple
            accept={ACCEPT}
            className="sr-only"
            onChange={(e) => {
              addFiles(e.target.files)
              e.target.value = ''
            }}
          />
        </label>

        {files.length > 0 && (
          <ul className="space-y-1">
            {files.map((file, i) => (
              <li key={`${file.name}-${i}`} className="flex items-center gap-2 text-sm">
                <span className="min-w-0 flex-1 truncate">{file.name}</span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove ${file.name}`}
                  onClick={() => setFiles((current) => current.filter((_, j) => j !== i))}
                >
                  <X />
                </Button>
              </li>
            ))}
          </ul>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="import-source">Format</Label>
          <NativeSelect
            id="import-source"
            className="w-full"
            value={source}
            onChange={(e) => setSource(e.target.value)}
          >
            <option value="">Detect automatically</option>
            <option value="kindle-html">Kindle notebook (HTML)</option>
            <option value="clippings">My Clippings.txt</option>
            <option value="readest">Readest (JSON)</option>
          </NativeSelect>
        </div>

        {results && <ImportResults results={results} onNavigate={() => changeOpen(false)} />}

        <DialogFooter>
          <Button variant="outline" onClick={() => changeOpen(false)}>
            {results ? 'Done' : 'Cancel'}
          </Button>
          <Button disabled={!files.length || upload.isPending} onClick={() => upload.mutate()}>
            {upload.isPending ? 'Importing…' : 'Import'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ImportResults({
  results,
  onNavigate,
}: {
  results: ImportResult[]
  onNavigate: () => void
}) {
  return (
    <ul className="space-y-3" aria-live="polite">
      {results.map((result, i) => (
        <li key={`${result.file}-${i}`} className="space-y-1">
          <p className="truncate text-sm font-medium">{result.file}</p>
          {'error' in result ? (
            <p className="text-sm text-destructive">{result.error}</p>
          ) : (
            <ul className="space-y-1">
              {result.books.map((b) => (
                <li key={b.bookId} className="text-sm">
                  <Link
                    to={`/books/${b.bookId}`}
                    onClick={onNavigate}
                    className="font-heading text-base italic underline-offset-4 hover:underline"
                  >
                    {b.title}
                  </Link>
                  <span className="block text-muted-foreground">
                    {b.added} added, {b.updated} updated, {b.unchanged} unchanged
                  </span>
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ul>
  )
}
