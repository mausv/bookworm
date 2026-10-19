import { useMutation, useQueryClient } from '@tanstack/react-query'
import { BookOpenText, Copy } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { api } from '@/web/lib/api'
import { useT } from '@/web/lib/i18n'
import { invalidateReading } from '@/web/lib/queries'
import type { BookDetail } from '@/web/lib/types'
import { cn } from '@/web/lib/utils'

export function MissingPanel({
  book,
  kind,
  missingOnly,
  onToggle,
}: {
  book: BookDetail
  kind: 'definitions' | 'explanations'
  missingOnly: boolean
  onToggle: () => void
}) {
  const t = useT()
  const queryClient = useQueryClient()
  const count = book.missing[kind]
  const synonyms = kind === 'definitions' ? book.missing.synonyms : 0

  const lookUp = useMutation({
    mutationFn: () =>
      api<{ defined: number; notFound: number }>('/vocab/define', {
        method: 'POST',
        json: { bookId: book.id },
      }),
    onSuccess: async (result) => {
      toast.success(t('missing.lookedUp', result))
      await invalidateReading(queryClient)
    },
    onError: (error) => toast.error(error.message),
  })

  async function copyPrompt() {
    const key = kind === 'definitions' ? 'missing.promptDefinitions' : 'missing.promptExplanations'
    await navigator.clipboard.writeText(t(key, { title: book.title, count, synonyms }))
    toast.success(t('missing.copied'))
  }

  if (!count && !synonyms && !missingOnly) return null

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg bg-muted/60 px-3 py-2 text-sm">
      <span className="mr-auto text-muted-foreground">
        {[
          (count > 0 || !synonyms) &&
            t(kind === 'definitions' ? 'missing.definitions' : 'missing.explanations', { count }),
          synonyms > 0 && t('missing.synonyms', { count: synonyms }),
        ]
          .filter(Boolean)
          .join(' · ')}
      </span>
      <button
        type="button"
        aria-pressed={missingOnly}
        onClick={onToggle}
        className={cn(
          'h-11 rounded-full px-3 sm:h-8',
          missingOnly ? 'bg-foreground text-background' : 'bg-background hover:bg-background/70'
        )}
      >
        {t('missing.only')}
      </button>
      {kind === 'definitions' && count > 0 && (
        <Button
          variant="outline"
          size="sm"
          disabled={lookUp.isPending}
          onClick={() => lookUp.mutate()}
        >
          <BookOpenText aria-hidden />
          {lookUp.isPending ? t('missing.lookingUp') : t('missing.lookUp')}
        </Button>
      )}
      {count + synonyms > 0 && (
        <Button variant="outline" size="sm" onClick={copyPrompt}>
          <Copy aria-hidden />
          {t('missing.copyPrompt')}
        </Button>
      )}
    </div>
  )
}
