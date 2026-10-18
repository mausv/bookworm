import { HIGHLIGHT_TYPES, type HighlightType } from '@/shared/types'
import { cn } from '@/web/lib/utils'
import { TYPE_BG, TYPE_LABEL } from './type-style'

export function TypePicker({
  value,
  onChange,
  label = 'Type',
}: {
  value: HighlightType
  onChange: (type: HighlightType) => void
  label?: string
}) {
  return (
    <div role="radiogroup" aria-label={label} className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
      {HIGHLIGHT_TYPES.map((t) => (
        <button
          key={t}
          type="button"
          role="radio"
          aria-checked={value === t}
          onClick={() => onChange(t)}
          className={cn(
            'flex h-11 items-center gap-2 rounded-lg border px-3 text-sm transition-colors sm:h-9',
            value === t
              ? 'border-foreground/40 bg-card font-medium text-foreground'
              : 'border-transparent bg-muted/60 text-muted-foreground hover:text-foreground'
          )}
        >
          <span aria-hidden className={cn('size-2.5 rounded-full', TYPE_BG[t])} />
          {TYPE_LABEL[t]}
        </button>
      ))}
    </div>
  )
}
