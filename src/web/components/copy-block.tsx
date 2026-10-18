import { Copy } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'

export function CopyBlock({ label, text }: { label: string; text: string }) {
  async function copy() {
    await navigator.clipboard.writeText(text)
    toast.success(`${label} copied`)
  }

  return (
    <div className="space-y-1">
      <p className="text-sm font-medium">{label}</p>
      <div className="flex items-start gap-2 rounded-md bg-muted p-3">
        <code className="min-w-0 flex-1 font-mono text-xs break-all">{text}</code>
        <Button variant="ghost" size="icon-sm" aria-label={`Copy ${label}`} onClick={copy}>
          <Copy />
        </Button>
      </div>
    </div>
  )
}
