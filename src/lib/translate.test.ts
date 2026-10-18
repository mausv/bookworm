import { afterEach, describe, expect, it, vi } from 'vitest'
import { setupTestDb } from '@/test/db'

const { insertBook, insertHighlight, insertUser } = await setupTestDb()
const userId = insertUser().id
const { autoTranslateEnabled, translateMissing } = await import('./translate')
const { ensureVocab, listVocab, updateVocab } = await import('./vocab')

function addWord(bookId: string, text: string) {
  ensureVocab(insertHighlight(bookId, { text, type: 'vocab' }).id)
}

const english = insertBook(userId, { title: 'Mistborn', language: 'en' })
const spanish = insertBook(userId, { title: 'Pedro Páramo', language: 'es' })
const french = insertBook(userId, { title: 'Candide', language: 'fr' })
addWord(english.id, 'ruddy')
addWord(english.id, 'soot')
addWord(spanish.id, 'tolvanera')
addWord(french.id, 'jardin')

const requests: { url: string; headers: Headers; body: { text: string[]; target_lang: string } }[] =
  []
const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
  const body = JSON.parse(String(init.body))
  requests.push({ url, headers: new Headers(init.headers), body })
  return Response.json({
    translations: body.text.map((t: string) => ({ text: `${body.target_lang}:${t}` })),
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  requests.length = 0
})

function translationOf(bookId: string, term: string) {
  return listVocab(userId, { bookId }).items.find((v) => v.term === term)
}

describe('translateMissing', () => {
  it('is disabled without a DeepL key', async () => {
    expect(autoTranslateEnabled()).toBe(false)
    expect(await translateMissing(userId)).toEqual({ error: 'Auto-translation is not configured' })
  })

  it('translates English words to Spanish and Spanish words to English as auto drafts', async () => {
    vi.stubEnv('DEEPL_API_KEY', 'secret:fx')
    vi.stubGlobal('fetch', fetchMock)
    updateVocab(userId, translationOf(english.id, 'soot')?.id ?? '', { translation: 'hollín' })

    expect(await translateMissing(userId)).toEqual({ translated: 2 })
    expect(translationOf(english.id, 'ruddy')).toMatchObject({
      translation: 'ES:ruddy',
      translationBy: 'auto',
    })
    expect(translationOf(english.id, 'soot')?.translation).toBe('hollín')
    expect(translationOf(spanish.id, 'tolvanera')?.translation).toBe('EN-US:tolvanera')
    expect(translationOf(french.id, 'jardin')?.translation).toBeNull()
    expect(requests.map((r) => r.url)).toEqual([
      'https://api-free.deepl.com/v2/translate',
      'https://api-free.deepl.com/v2/translate',
    ])
    expect(requests[0].headers.get('authorization')).toBe('DeepL-Auth-Key secret:fx')
  })

  it('limits work to the given books', async () => {
    vi.stubGlobal('fetch', fetchMock)
    addWord(english.id, 'hale')
    addWord(spanish.id, 'zaguán')
    expect(await translateMissing(userId, [spanish.id])).toEqual({ translated: 1 })
    expect(translationOf(english.id, 'hale')?.translation).toBeNull()
  })

  it('surfaces DeepL errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('quota', { status: 456 }))
    )
    await expect(translateMissing(userId)).rejects.toThrow('DeepL request failed (456)')
  })
})
