import type { HighlightType } from '@/shared/types'

export const TYPE_LABEL: Record<HighlightType, string> = {
  vocab: 'Vocab',
  quote: 'Quote',
  lore: 'Lore',
  unclassified: 'Unclassified',
}

export const TYPE_PLURAL: Record<HighlightType, string> = {
  vocab: 'Vocab',
  quote: 'Quotes',
  lore: 'Lore',
  unclassified: 'Unclassified',
}

export const TYPE_HINT: Record<HighlightType, string> = {
  vocab: 'A new word or phrase',
  quote: 'A line worth keeping',
  lore: 'World, characters, plot',
  unclassified: 'Not sorted yet',
}

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
