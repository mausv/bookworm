import type { HighlightType } from '@/shared/types'

export const TYPE_RULE: Record<HighlightType, string> = {
  vocab: 'border-vocab',
  quote: 'border-quote',
  lore: 'border-lore',
  unclassified: 'border-unclassified border-dashed',
}

export const TYPE_BG: Record<HighlightType, string> = {
  vocab: 'bg-vocab',
  quote: 'bg-quote',
  lore: 'bg-lore',
  unclassified: 'bg-unclassified',
}
