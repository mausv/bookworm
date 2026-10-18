import { describe, expect, it } from 'vitest'
import { examplesUrl, meaningUrl, wiktionaryUrl } from './lookup'

describe('Google lookups', () => {
  it('searches the meaning in the book language', () => {
    expect(meaningUrl('ruddy', 'en')).toBe('https://www.google.com/search?q=ruddy+meaning&hl=en')
    expect(meaningUrl('tolvanera', 'es')).toBe(
      'https://www.google.com/search?q=tolvanera+significado&hl=es'
    )
  })

  it('searches example sentences', () => {
    expect(examplesUrl('nod off', 'en')).toBe(
      'https://www.google.com/search?q=nod+off+example+sentences&hl=en'
    )
    expect(examplesUrl('zaguán', 'es')).toBe(
      'https://www.google.com/search?q=zagu%C3%A1n+ejemplos+de+oraciones&hl=es'
    )
  })

  it('falls back to English wording without a language hint for other languages', () => {
    expect(meaningUrl('jardin', 'fr')).toBe('https://www.google.com/search?q=jardin+meaning')
  })
})

describe('wiktionaryUrl', () => {
  it('links to the Wiktionary page in the book language', () => {
    expect(wiktionaryUrl('nod off', 'en')).toBe('https://en.wiktionary.org/wiki/nod_off')
    expect(wiktionaryUrl('zaguán', 'es')).toBe('https://es.wiktionary.org/wiki/zagu%C3%A1n')
  })
})
