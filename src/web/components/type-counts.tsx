import { HIGHLIGHT_TYPES } from '@/shared/types'
import { useT } from '@/web/lib/i18n'
import type { TypeCounts as Counts } from '@/web/lib/types'
import { cn } from '@/web/lib/utils'
import { TYPE_BG } from './type-style'

export function TypeCounts({ counts, className }: { counts: Counts; className?: string }) {
  const t = useT()
  return (
    <ul className={cn('flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground', className)}>
      {HIGHLIGHT_TYPES.filter((type) => counts[type] > 0).map((type) => (
        <li key={type} className="flex items-center gap-1.5">
          <span aria-hidden className={cn('size-2 rounded-full', TYPE_BG[type])} />
          <span className="tabular-nums">{counts[type]}</span>
          <span className="sr-only">{t(`types.${type}`)}</span>
        </li>
      ))}
    </ul>
  )
}

export function TypeSpine({ counts, className }: { counts: Counts; className?: string }) {
  const total = HIGHLIGHT_TYPES.reduce((sum, t) => sum + counts[t], 0)
  return (
    <div aria-hidden className={cn('flex w-1.5 flex-col overflow-hidden rounded-full', className)}>
      {total === 0 && <div className="flex-1 bg-border" />}
      {HIGHLIGHT_TYPES.filter((t) => counts[t] > 0).map((t) => (
        <div key={t} className={TYPE_BG[t]} style={{ flexGrow: counts[t] }} />
      ))}
    </div>
  )
}
