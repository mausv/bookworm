import { HIGHLIGHT_TYPES, type HighlightType } from '@/shared/types'
import { useT } from '@/web/lib/i18n'
import { cn } from '@/web/lib/utils'
import { TYPE_BG } from './type-style'

export function TypePicker({
  value,
  onChange,
  label,
}: {
  value: HighlightType
  onChange: (type: HighlightType) => void
  label?: string
}) {
  const t = useT()
  return (
    <div
      role="radiogroup"
      aria-label={label ?? t('field.type')}
      className="grid grid-cols-2 gap-1.5 sm:grid-cols-4"
    >
      {HIGHLIGHT_TYPES.map((type) => (
        <button
          key={type}
          type="button"
          role="radio"
          aria-checked={value === type}
          onClick={() => onChange(type)}
          className={cn(
            'flex h-11 items-center gap-2 rounded-lg border px-3 text-sm transition-colors sm:h-9',
            value === type
              ? 'border-foreground/40 bg-card font-medium text-foreground'
              : 'border-transparent bg-muted/60 text-muted-foreground hover:text-foreground'
          )}
        >
          <span aria-hidden className={cn('size-2.5 rounded-full', TYPE_BG[type])} />
          {t(`type.${type}`)}
        </button>
      ))}
    </div>
  )
}
