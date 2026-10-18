import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { RotateCcw } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { NativeSelect } from '@/components/ui/native-select'
import { HIGHLIGHT_TYPES, type Source, SOURCES } from '@/shared/types'
import { api } from '@/web/lib/api'
import { useT } from '@/web/lib/i18n'
import type { ColorMapping } from '@/web/lib/types'
import { cn } from '@/web/lib/utils'

export function ColorMappings() {
  const t = useT()
  const [source, setSource] = useState<Source>('kindle-html')

  return (
    <section className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-2xl">{t('colors.title')}</h2>
        <p className="text-sm text-muted-foreground">{t('colors.description')}</p>
      </div>
      <div role="radiogroup" aria-label={t('colors.source')} className="flex flex-wrap gap-1">
        {SOURCES.filter((s) => s !== 'manual').map((s) => (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={source === s}
            onClick={() => setSource(s)}
            className={cn(
              'h-11 rounded-full px-4 text-sm sm:h-9',
              source === s
                ? 'bg-foreground text-background'
                : 'bg-muted text-muted-foreground hover:text-foreground'
            )}
          >
            {t(`source.${s}`)}
          </button>
        ))}
      </div>
      <MappingList source={source} />
    </section>
  )
}

function MappingList({ source }: { source: Source }) {
  const t = useT()
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: ['colors', source],
    queryFn: () => api<{ mappings: ColorMapping[] }>(`/colors/${source}`),
  })

  const update = useMutation({
    mutationFn: ({ color, type }: { color: string; type: string | null }) =>
      api<{ mappings: ColorMapping[] }>('/colors', {
        method: 'PUT',
        json: { source, color, type },
      }),
    onSuccess: (data) => queryClient.setQueryData(['colors', source], data),
    onError: (error) => toast.error(error.message),
  })

  if (query.isPending) return null
  if (query.error) return <p className="text-destructive">{query.error.message}</p>

  const mappings = query.data.mappings
  if (!mappings.length) {
    return (
      <p className="text-sm text-muted-foreground">
        {source === 'clippings' ? t('colors.clippingsNone') : t('colors.none')}
      </p>
    )
  }

  return (
    <ul className="divide-y">
      {mappings.map((m) => (
        <li key={m.color} className="flex items-center gap-3 py-2">
          <span
            aria-hidden
            className="size-6 shrink-0 rounded-full ring-1 ring-foreground/15"
            style={{ background: m.color }}
          />
          <div className="min-w-0 flex-1">
            <p className="truncate capitalize">{m.color}</p>
            {m.isDefault && <p className="text-xs text-muted-foreground">{t('colors.default')}</p>}
          </div>
          <NativeSelect
            aria-label={t('colors.typeFor', { color: m.color })}
            className="w-36"
            value={m.type}
            disabled={update.isPending}
            onChange={(e) => update.mutate({ color: m.color, type: e.target.value })}
          >
            {HIGHLIGHT_TYPES.map((type) => (
              <option key={type} value={type}>
                {t(`type.${type}`)}
              </option>
            ))}
          </NativeSelect>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t('colors.reset', { color: m.color })}
            disabled={m.isDefault || update.isPending}
            onClick={() => update.mutate({ color: m.color, type: null })}
          >
            <RotateCcw />
          </Button>
        </li>
      ))}
    </ul>
  )
}
