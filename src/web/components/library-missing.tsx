import { Copy } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useT } from '@/web/lib/i18n'
import type { Book } from '@/web/lib/types'

export function LibraryMissing({ books }: { books: Book[] }) {
  const t = useT()
  const definitions = books.reduce((sum, b) => sum + b.missing.definitions, 0)
  const explanations = books.reduce((sum, b) => sum + b.missing.explanations, 0)
  const withGaps = books.filter((b) => b.missing.definitions + b.missing.explanations > 0).length

  if (!withGaps) return null

  async function copyPrompt() {
    await navigator.clipboard.writeText(
      t('missing.promptLibrary', { definitions, explanations, books: withGaps })
    )
    toast.success(t('missing.copied'))
  }

  return (
    <div className="mb-6 flex flex-wrap items-center gap-2 rounded-lg bg-muted/60 px-3 py-2 text-sm">
      <p className="mr-auto text-muted-foreground">
        {[
          definitions > 0 && t('missing.definitions', { count: definitions }),
          explanations > 0 && t('missing.explanations', { count: explanations }),
        ]
          .filter(Boolean)
          .join(' · ')}{' '}
        {t('missing.inBooks', { count: withGaps })}
      </p>
      <Button variant="outline" size="sm" onClick={copyPrompt}>
        <Copy aria-hidden />
        {t('missing.copyPrompt')}
      </Button>
    </div>
  )
}
