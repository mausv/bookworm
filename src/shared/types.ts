export const HIGHLIGHT_TYPES = ['vocab', 'quote', 'lore', 'unclassified'] as const
export type HighlightType = (typeof HIGHLIGHT_TYPES)[number]

export const SOURCES = ['kindle-html', 'clippings', 'readest', 'manual'] as const
export type Source = (typeof SOURCES)[number]

export const VOCAB_STATUSES = ['new', 'learning', 'known'] as const
export type VocabStatus = (typeof VOCAB_STATUSES)[number]

export const LORE_KINDS = ['character', 'place', 'faction', 'event', 'concept', 'other'] as const
export type LoreKind = (typeof LORE_KINDS)[number]

export const TRANSLATION_SOURCES = ['me', 'claude', 'dictionary'] as const
export type TranslationSource = (typeof TRANSLATION_SOURCES)[number]

export function translationTarget(language: string | null) {
  if (language === 'en') return 'es'
  if (language === 'es') return 'en'
  return null
}

export const DEFINITION_SOURCES = ['me', 'claude', 'dictionary'] as const
export type DefinitionSource = (typeof DEFINITION_SOURCES)[number]
