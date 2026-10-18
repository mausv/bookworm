import { and, eq, inArray, sql } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/db'
import { book, vocabEntry } from '@/db/schema'
import { translationTarget } from '@/shared/types'

const BATCH = 50
const LANGUAGES = ['en', 'es'] as const
type Language = (typeof LANGUAGES)[number]

const responseSchema = z.object({ translations: z.array(z.object({ text: z.string() })) })

export function autoTranslateEnabled() {
  return Boolean(process.env.DEEPL_API_KEY)
}

// Free-tier DeepL keys end in ":fx" and must use the api-free host.
function endpoint(key: string) {
  return key.endsWith(':fx')
    ? 'https://api-free.deepl.com/v2/translate'
    : 'https://api.deepl.com/v2/translate'
}

export async function deeplTranslate(texts: string[], source: Language, target: Language) {
  const key = process.env.DEEPL_API_KEY
  if (!key) throw new Error('DEEPL_API_KEY is not set')
  const res = await fetch(endpoint(key), {
    method: 'POST',
    headers: { Authorization: `DeepL-Auth-Key ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: texts,
      source_lang: source.toUpperCase(),
      target_lang: target === 'en' ? 'EN-US' : 'ES',
    }),
  })
  if (!res.ok) throw new Error(`DeepL request failed (${res.status})`)
  return responseSchema.parse(await res.json()).translations.map((t) => t.text)
}

const missing = sql`(${vocabEntry.translation} is null or ${vocabEntry.translation} = '')`

export async function translateMissing(userId: string, bookIds?: string[]) {
  if (!autoTranslateEnabled()) return { error: 'Auto-translation is not configured' }
  const rows = db
    .select({ id: vocabEntry.id, term: vocabEntry.term, language: book.language })
    .from(vocabEntry)
    .innerJoin(book, eq(book.id, vocabEntry.bookId))
    .where(
      and(
        eq(book.userId, userId),
        bookIds ? inArray(vocabEntry.bookId, bookIds) : undefined,
        inArray(book.language, [...LANGUAGES]),
        missing
      )
    )
    .all()

  let translated = 0
  for (const language of LANGUAGES) {
    const target = translationTarget(language)
    if (!target) continue
    const group = rows.filter((r) => r.language === language)
    for (let i = 0; i < group.length; i += BATCH) {
      const batch = group.slice(i, i + BATCH)
      const texts = await deeplTranslate(
        batch.map((r) => r.term),
        language,
        target
      )
      db.transaction(() => {
        batch.forEach((r, j) => {
          db.update(vocabEntry)
            .set({ translation: texts[j], translationBy: 'auto' })
            .where(and(eq(vocabEntry.id, r.id), missing))
            .run()
        })
      })
      translated += batch.length
    }
  }
  return { translated }
}

export function translateInBackground(userId: string, bookIds: string[]) {
  if (!autoTranslateEnabled() || !bookIds.length) return
  translateMissing(userId, bookIds).catch((error: unknown) => {
    console.error(`auto-translate failed: ${error instanceof Error ? error.message : error}`)
  })
}
