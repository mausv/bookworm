import fs from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { setupTestDb } from '@/test/db'

const { insertBook, insertHighlight, insertUser } = await setupTestDb()
const userId = insertUser().id
const { defineMissing, lookup, parseSpanishWikitext } = await import('./dictionary')
const { ensureVocab, listVocab, updateVocab } = await import('./vocab')

const fixture = (name: string) =>
  fs.readFileSync(new URL(`fixtures/wiktionary/${name}`, import.meta.url), 'utf8')

const pages: Record<string, string> = {
  'https://en.wiktionary.org/api/rest_v1/page/definition/ruddy': fixture('en-ruddy.json'),
  'https://en.wiktionary.org/api/rest_v1/page/definition/nod%20off': fixture('en-nod-off.json'),
}
const spanish: Record<string, string> = { tolvanera: fixture('es-tolvanera.json') }
const missingEs = JSON.stringify({ error: { code: 'missingtitle' } })

const fetchMock = vi.fn(async (url: string) => {
  if (url.startsWith('https://es.wiktionary.org/')) {
    const page = new URL(url).searchParams.get('page') ?? ''
    return new Response(spanish[page] ?? missingEs)
  }
  const body = pages[url]
  return body ? new Response(body) : Response.json({ status: 404 }, { status: 404 })
})

afterEach(() => vi.unstubAllGlobals())

describe('lookup', () => {
  it('takes the first English sense with its part of speech and example', async () => {
    vi.stubGlobal('fetch', fetchMock)
    expect(await lookup('ruddy', 'en')).toEqual({
      definition: 'Reddish in color, especially of the face, fire, or sky.',
      partOfSpeech: 'adjective',
      example: null,
      translation: null,
    })
  })

  it('explains English phrases', async () => {
    vi.stubGlobal('fetch', fetchMock)
    expect((await lookup('Nod off', 'en'))?.definition).toBe(
      'To fall asleep, especially unintentionally.'
    )
  })

  it('reads Spanish definitions from Spanish Wiktionary, with the English translation', async () => {
    vi.stubGlobal('fetch', fetchMock)
    expect(await lookup('tolvanera', 'es')).toEqual({
      definition: 'Remolino de polvo.',
      partOfSpeech: 'sustantivo femenino',
      example: null,
      translation: 'dust devil',
    })
  })

  it('returns null for unknown words', async () => {
    vi.stubGlobal('fetch', fetchMock)
    expect(await lookup('xyzzy', 'en')).toBeNull()
    expect(await lookup('xyzzy', 'es')).toBeNull()
  })
})

describe('parseSpanishWikitext', () => {
  it('strips links, references and templates from the first sense', () => {
    const wikitext = `== {{lengua|es}} ==\n==== {{sustantivo masculino|es}} ====\n;1 {{csem|arquitectura}}: {{plm|antecámara}} o zona [[cubierto|cubierta]] que da [[entrada]].<ref>x</ref>\n{{t|en|a1=1|t1=vestibule|t2=entryway}}`
    expect(parseSpanishWikitext(wikitext)).toEqual({
      definition: 'Antecámara o zona cubierta que da entrada.',
      partOfSpeech: 'sustantivo masculino',
      example: null,
      translation: 'vestibule',
    })
  })

  it('ignores pages without a Spanish section', () => {
    expect(parseSpanishWikitext('== {{lengua|en}} ==\n;1: word')).toBeNull()
  })
})

describe('defineMissing', () => {
  const english = insertBook(userId, { title: 'Mistborn', language: 'en' })
  const spanishBook = insertBook(userId, { title: 'Pedro Páramo', language: 'es' })
  for (const [bookId, text] of [
    [english.id, 'ruddy'],
    [english.id, 'nod off'],
    [english.id, 'xyzzy'],
    [spanishBook.id, 'tolvanera'],
  ]) {
    ensureVocab(insertHighlight(bookId, { text, type: 'vocab' }).id)
  }
  const byTerm = (term: string) =>
    listVocab(userId, { limit: 50 }).items.find((v) => v.term === term)

  it('fills missing definitions from the dictionary without overwriting mine', async () => {
    vi.stubGlobal('fetch', fetchMock)
    updateVocab(userId, byTerm('nod off')?.id ?? '', { definition: 'to doze', definitionBy: 'me' })
    expect(await defineMissing(userId)).toEqual({ defined: 2, notFound: 1 })
    expect(byTerm('ruddy')).toMatchObject({
      definitionBy: 'dictionary',
      partOfSpeech: 'adjective',
    })
    expect(byTerm('nod off')).toMatchObject({ definition: 'to doze', definitionBy: 'me' })
    expect(byTerm('tolvanera')).toMatchObject({
      definition: 'Remolino de polvo.',
      translation: 'dust devil',
      translationBy: 'auto',
    })
    expect(byTerm('xyzzy')?.definition).toBeNull()
  })
})
