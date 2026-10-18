import { z } from 'zod'
import type { Importer } from './types'

const exportSchema = z.object({
  $format: z.literal('readest-annotations'),
  book: z.object({ title: z.string().default(''), author: z.string().default('') }),
  annotations: z.array(
    z.object({
      type: z.string(),
      cfi: z.string(),
      text: z.string().optional(),
      color: z.string().optional(),
      note: z.string().default(''),
      createdAt: z.number().optional(),
    })
  ),
})

function parseExport(content: string) {
  try {
    return exportSchema.safeParse(JSON.parse(content))
  } catch {
    return undefined
  }
}

export const readest: Importer = {
  source: 'readest',

  detect(content) {
    return content.trimStart().startsWith('{') && content.includes('"readest-annotations"')
  },

  parse(content) {
    const parsed = parseExport(content)
    if (!parsed?.success) return []
    const { book, annotations } = parsed.data
    const highlights = annotations
      .filter((a) => a.type !== 'bookmark' && a.text?.trim())
      .map((a) => ({
        text: a.text?.trim() ?? '',
        color: a.color?.toLowerCase(),
        cfi: a.cfi,
        note: a.note.trim() || undefined,
        createdAt: a.createdAt ? new Date(a.createdAt) : undefined,
      }))
    return [
      {
        title: book.title.trim() || 'Untitled',
        author: book.author.trim() || undefined,
        highlights,
      },
    ]
  },
}
