import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, X } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'
import { LORE_KINDS, type LoreKind } from '@/shared/types'
import { api } from '@/web/lib/api'
import { locationLabel } from '@/web/lib/highlights'
import { useT } from '@/web/lib/i18n'
import type { Lore } from '@/web/lib/types'
import { ConfirmDialog } from './confirm-dialog'

function useInvalidateLore(bookId: string) {
  const queryClient = useQueryClient()
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['lore', bookId] }),
      queryClient.invalidateQueries({ queryKey: ['book', bookId] }),
    ])
}

export function LoreEntries({ bookId }: { bookId: string }) {
  const t = useT()
  const query = useQuery({
    queryKey: ['lore', bookId],
    queryFn: () => api<{ lore: Lore[] }>(`/books/${bookId}/lore`),
  })
  const [creating, setCreating] = useState(false)

  if (query.isPending) return null
  if (query.error) return <p className="text-destructive">{query.error.message}</p>

  const entries = query.data.lore

  return (
    <div className="space-y-10">
      {creating ? (
        <NewLoreForm bookId={bookId} onDone={() => setCreating(false)} />
      ) : (
        <Button variant="outline" onClick={() => setCreating(true)}>
          <Plus />
          {t('lore.newEntry')}
        </Button>
      )}
      {!entries.length && !creating && <p className="text-muted-foreground">{t('lore.empty')}</p>}
      {LORE_KINDS.map((kind) => {
        const ofKind = entries.filter((e) => e.kind === kind)
        if (!ofKind.length) return null
        return (
          <section key={kind} className="space-y-6">
            <h2 className="text-lg text-muted-foreground italic">{t(`lore.kinds.${kind}`)}</h2>
            <ul className="space-y-8">
              {ofKind.map((entry) => (
                <li key={entry.id}>
                  <LoreEntry entry={entry} />
                </li>
              ))}
            </ul>
          </section>
        )
      })}
    </div>
  )
}

function NewLoreForm({ bookId, onDone }: { bookId: string; onDone: () => void }) {
  const t = useT()
  const invalidate = useInvalidateLore(bookId)
  const [name, setName] = useState('')
  const [kind, setKind] = useState<LoreKind>('character')
  const [body, setBody] = useState('')

  const create = useMutation({
    mutationFn: () =>
      api<{ created: boolean }>('/lore', {
        method: 'POST',
        json: { bookId, name: name.trim(), kind, body },
      }),
    onSuccess: async ({ created }) => {
      toast.success(created ? t('lore.added') : t('lore.updated'))
      await invalidate()
      onDone()
    },
    onError: (error) => toast.error(error.message),
  })

  function submit(event: FormEvent) {
    event.preventDefault()
    create.mutate()
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-lg bg-card p-3 ring-1 ring-border sm:p-4">
      <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
        <div className="space-y-1.5">
          <Label htmlFor="lore-name">{t('lore.name')}</Label>
          <Input
            id="lore-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoFocus
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="lore-kind">{t('lore.kind')}</Label>
          <NativeSelect
            id="lore-kind"
            className="w-full"
            value={kind}
            onChange={(e) => setKind(LORE_KINDS.find((k) => k === e.target.value) ?? 'other')}
          >
            {LORE_KINDS.map((k) => (
              <option key={k} value={k}>
                {t(`lore.kind.${k}`)}
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="lore-body">{t('lore.notes')}</Label>
        <Textarea id="lore-body" value={body} onChange={(e) => setBody(e.target.value)} />
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onDone}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" disabled={create.isPending || !name.trim()}>
          {create.isPending ? t('common.adding') : t('lore.addEntry')}
        </Button>
      </div>
    </form>
  )
}

function LoreEntry({ entry }: { entry: Lore }) {
  const t = useT()
  const invalidate = useInvalidateLore(entry.bookId)
  const [body, setBody] = useState(entry.body)
  const [confirming, setConfirming] = useState(false)

  const save = useMutation({
    mutationFn: () => api(`/lore/${entry.id}`, { method: 'PATCH', json: { body } }),
    onSuccess: async () => {
      toast.success(t('common.saved'))
      await invalidate()
    },
    onError: (error) => toast.error(error.message),
  })

  const remove = useMutation({
    mutationFn: () => api(`/lore/${entry.id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      setConfirming(false)
      await invalidate()
    },
    onError: (error) => toast.error(error.message),
  })

  const unlink = useMutation({
    mutationFn: (highlightId: string) =>
      api(`/lore/${entry.id}/highlights/${highlightId}`, { method: 'DELETE' }),
    onSuccess: invalidate,
    onError: (error) => toast.error(error.message),
  })

  return (
    <article className="space-y-3">
      <div className="flex items-start gap-2">
        <h3 className="min-w-0 flex-1 text-2xl leading-tight">{entry.name}</h3>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t('lore.deleteName', { name: entry.name })}
          onClick={() => setConfirming(true)}
        >
          <Trash2 />
        </Button>
      </div>
      <div className="space-y-2">
        <Label htmlFor={`lore-${entry.id}`} className="sr-only">
          {t('lore.notesOn', { name: entry.name })}
        </Label>
        <Textarea
          id={`lore-${entry.id}`}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={t('lore.bodyPlaceholder')}
        />
        {body !== entry.body && (
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setBody(entry.body)}>
              {t('common.revert')}
            </Button>
            <Button disabled={save.isPending} onClick={() => save.mutate()}>
              {save.isPending ? t('common.saving') : t('common.save')}
            </Button>
          </div>
        )}
      </div>
      {entry.highlights.length > 0 && (
        <ul className="space-y-3">
          {entry.highlights.map((h) => (
            <li key={h.id} className="flex gap-2 border-l-[3px] border-lore pl-3">
              <div className="min-w-0 flex-1">
                <p className="font-serif text-base/relaxed">{h.text}</p>
                <p className="text-sm text-muted-foreground">
                  {[h.chapter, locationLabel({ locStart: h.locStart, page: null }, t)]
                    .filter(Boolean)
                    .join(', ')}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t('lore.unlink')}
                disabled={unlink.isPending}
                onClick={() => unlink.mutate(h.id)}
              >
                <X />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={t('lore.deleteTitle', { name: entry.name })}
        description={t('lore.deleteDescription')}
        confirmLabel={t('lore.deleteEntry')}
        pending={remove.isPending}
        onConfirm={() => remove.mutate()}
      />
    </article>
  )
}
