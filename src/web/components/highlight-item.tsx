import { useMutation, useQueryClient } from '@tanstack/react-query'
import { PenLine, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { HighlightType } from '@/shared/types'
import { api } from '@/web/lib/api'
import { locationLabel, parseTags } from '@/web/lib/highlights'
import { useT } from '@/web/lib/i18n'
import { invalidateReading } from '@/web/lib/queries'
import type { Highlight } from '@/web/lib/types'
import { cn } from '@/web/lib/utils'
import { ConfirmDialog } from './confirm-dialog'
import { TypePicker } from './type-picker'
import { TYPE_RULE } from './type-style'

export function HighlightItem({ highlight }: { highlight: Highlight }) {
  const t = useT()
  const [editing, setEditing] = useState(false)
  const location = locationLabel(highlight, t)

  return (
    <article className={cn('border-l-[3px] pl-4', TYPE_RULE[highlight.type])}>
      <button
        type="button"
        aria-expanded={editing}
        onClick={() => setEditing(!editing)}
        className="-mx-2 block w-[calc(100%+1rem)] rounded-md px-2 py-1 text-left transition-colors hover:bg-muted/50"
      >
        <span className="block font-serif text-[1.075rem]/[1.7] text-pretty">{highlight.text}</span>
      </button>
      <div className="mt-1 space-y-2">
        {(location || highlight.suggestedType) && (
          <p className="flex flex-wrap gap-x-3 text-sm text-muted-foreground">
            {location && <span>{location}</span>}
            {highlight.suggestedType && (
              <span className="flex items-center gap-1">
                <Sparkles aria-hidden className="size-3.5" />
                {t(`looksLike.${highlight.suggestedType}`)}
              </span>
            )}
          </p>
        )}
        {highlight.note && !editing && (
          <p className="flex gap-2 text-sm">
            <PenLine
              aria-label={t('field.note')}
              className="mt-1 size-3.5 shrink-0 text-muted-foreground"
            />
            <span className="whitespace-pre-line">{highlight.note}</span>
          </p>
        )}
        {highlight.tags.length > 0 && !editing && (
          <ul className="flex flex-wrap gap-1.5" aria-label={t('field.tags')}>
            {highlight.tags.map((tag) => (
              <li key={tag} className="rounded-full bg-muted px-2 py-0.5 text-xs">
                {tag}
              </li>
            ))}
          </ul>
        )}
        {editing && <HighlightEditor highlight={highlight} onDone={() => setEditing(false)} />}
      </div>
    </article>
  )
}

function HighlightEditor({ highlight, onDone }: { highlight: Highlight; onDone: () => void }) {
  const t = useT()
  const queryClient = useQueryClient()
  const [type, setType] = useState<HighlightType>(highlight.type)
  const [note, setNote] = useState(highlight.note ?? '')
  const [tags, setTags] = useState(highlight.tags.join(', '))
  const [confirming, setConfirming] = useState(false)
  const id = highlight.id

  const save = useMutation({
    mutationFn: () =>
      api(`/highlights/${id}`, {
        method: 'PATCH',
        json: { type, note: note.trim() || null, tags: parseTags(tags) },
      }),
    onSuccess: async () => {
      await invalidateReading(queryClient)
      onDone()
    },
    onError: (error) => toast.error(error.message),
  })

  const remove = useMutation({
    mutationFn: () => api(`/highlights/${id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      setConfirming(false)
      toast.success(t('highlight.deleted'))
      await invalidateReading(queryClient)
    },
    onError: (error) => toast.error(error.message),
  })

  return (
    <form
      className="space-y-4 rounded-lg bg-card p-3 ring-1 ring-border sm:p-4"
      onSubmit={(e) => {
        e.preventDefault()
        save.mutate()
      }}
    >
      <TypePicker value={type} onChange={setType} />
      <div className="space-y-1.5">
        <Label htmlFor={`note-${id}`}>{t('field.note')}</Label>
        <Textarea
          id={`note-${id}`}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={
            type === 'vocab' ? t('highlight.vocabNotePlaceholder') : t('highlight.notePlaceholder')
          }
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`tags-${id}`}>{t('field.tags')}</Label>
        <Input
          id={`tags-${id}`}
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder={t('highlight.tagsPlaceholder')}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          className="mr-auto text-destructive hover:text-destructive"
          onClick={() => setConfirming(true)}
        >
          {t('common.delete')}
        </Button>
        <Button type="button" variant="outline" onClick={onDone}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? t('common.saving') : t('common.save')}
        </Button>
      </div>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={t('highlight.deleteTitle')}
        description={t('highlight.deleteDescription')}
        confirmLabel={t('highlight.delete')}
        pending={remove.isPending}
        onConfirm={() => remove.mutate()}
      />
    </form>
  )
}
