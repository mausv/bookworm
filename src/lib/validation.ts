import { z } from 'zod'
import {
  HIGHLIGHT_TYPES,
  LORE_KINDS,
  SOURCES,
  TRANSLATION_SOURCES,
  VOCAB_STATUSES,
} from '@/shared/types'

export const id = z.string().min(1)
export const highlightType = z.enum(HIGHLIGHT_TYPES)
export const source = z.enum(SOURCES)
export const vocabStatus = z.enum(VOCAB_STATUSES)
export const loreKind = z.enum(LORE_KINDS)
export const tags = z.array(z.string().trim().min(1).max(50)).max(50)

const bookLanguage = z.string().trim().min(2).max(20)
const optionalText = z.string().trim().max(5000).nullable()

export const bookUpdateSchema = z
  .object({
    title: z.string().trim().min(1).max(500),
    author: z.string().trim().max(500).nullable(),
    language: bookLanguage,
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

export const manualHighlightSchema = z
  .object({
    bookId: id.optional(),
    book: z
      .object({
        title: z.string().trim().min(1).max(500),
        author: z.string().trim().max(500).nullish(),
        language: bookLanguage.optional(),
      })
      .optional(),
    text: z.string().trim().min(1).max(20000),
    type: highlightType,
    chapter: z.string().trim().max(500).nullish(),
    page: z.string().trim().max(50).nullish(),
    note: optionalText.optional(),
  })
  .refine((v) => Boolean(v.bookId) !== Boolean(v.book), {
    message: 'Give either bookId or book',
  })

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
    translation: z.string().trim().max(500).nullable(),
    translationBy: z.enum(TRANSLATION_SOURCES).nullable(),
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

export const quizMode = z.enum(['choice', 'typed'])

export const quizAnswerSchema = z.object({
  vocabId: id,
  mode: quizMode,
  direction: z.enum(['term', 'definition']),
  answer: z.string().max(2000),
})

export const apiKeySchema = z.object({ name: z.string().trim().min(1).max(100) })

export const translateSchema = z.object({ bookId: id.optional() })
