import { Copy } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useT } from '@/web/lib/i18n'

export function CopyBlock({ label, text }: { label: string; text: string }) {
  const t = useT()

  async function copy() {
    await navigator.clipboard.writeText(text)
    toast.success(t('copy.copied', { label }))
  }

  return (
    <div className="space-y-1">
      <p className="text-sm font-medium">{label}</p>
      <div className="flex items-start gap-2 rounded-md bg-muted p-3">
        <code className="min-w-0 flex-1 font-mono text-xs break-all">{text}</code>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t('copy.copy', { label })}
          onClick={copy}
        >
          <Copy />
        </Button>
      </div>
    </div>
  )
}
