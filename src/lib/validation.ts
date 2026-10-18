import { z } from 'zod'
import { HIGHLIGHT_TYPES, LORE_KINDS, SOURCES, VOCAB_STATUSES } from '@/shared/types'

export const id = z.string().min(1)
export const highlightType = z.enum(HIGHLIGHT_TYPES)
export const source = z.enum(SOURCES)
export const vocabStatus = z.enum(VOCAB_STATUSES)
export const loreKind = z.enum(LORE_KINDS)
export const tags = z.array(z.string().trim().min(1).max(50)).max(50)

const optionalText = z.string().trim().max(5000).nullable()

export const bookUpdateSchema = z
  .object({
    title: z.string().trim().min(1).max(500),
    author: z.string().trim().max(500).nullable(),
    language: z.string().trim().min(2).max(20),
  })
  .partial()

export const highlightUpdateSchema = z
  .object({
    type: highlightType,
    note: optionalText,
    text: z.string().trim().min(1).max(20000),
    chapterId: id.nullable(),
    tags,
  })
  .partial()

export const classifySchema = z.object({ ids: z.array(id).min(1).max(500), type: highlightType })

export const addTagsSchema = z.object({ ids: z.array(id).min(1).max(500), tags: tags.min(1) })

export const vocabUpdateSchema = z
  .object({
    term: z.string().trim().min(1).max(200),
    definition: optionalText,
    partOfSpeech: z.string().trim().max(50).nullable(),
    language: z.string().trim().max(20).nullable(),
    example: optionalText,
    status: vocabStatus,
    definitionBy: z.enum(['me', 'claude']).nullable(),
  })
  .partial()

export const loreInputSchema = z.object({
  bookId: id,
  name: z.string().trim().min(1).max(200),
  kind: loreKind,
  body: z.string().max(20000).optional(),
  highlightIds: z.array(id).max(200).optional(),
})

export const loreUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    kind: loreKind,
    body: z.string().max(20000),
  })
  .partial()

export const colorMappingSchema = z.object({
  source,
  color: z.string().trim().min(1).max(50),
  type: highlightType.nullable(),
})

export const apiKeySchema = z.object({ name: z.string().trim().min(1).max(100) })
