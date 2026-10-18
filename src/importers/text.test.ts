import { describe, expect, it } from 'vitest'
import { cleanTitle, normalizeText, suggestType, vocabTerm } from './text'

describe('normalizeText', () => {
  it('ignores case, curly quotes, whitespace and edge punctuation', () => {
    expect(normalizeText('  “Why  yes,\nit’s true.”  ')).toBe(normalizeText("why yes, it's true"))
  })
})

describe('vocabTerm', () => {
  it('strips surrounding punctuation', () => {
    expect(vocabTerm('venerable,')).toBe('venerable')
    expect(vocabTerm('prelan—')).toBe('prelan')
    expect(vocabTerm('“Leisurely.”')).toBe('Leisurely')
  })
})

describe('suggestType', () => {
  it('suggests vocab for one or two words', () => {
    expect(suggestType('ruddy')).toBe('vocab')
    expect(suggestType('nod off')).toBe('vocab')
  })

  it('suggests quote for longer passages and nothing in between', () => {
    expect(suggestType('In the end, I worry that my arrogance shall destroy us all.')).toBe('quote')
    expect(suggestType('getting them riled up')).toBeNull()
  })
})

describe('cleanTitle', () => {
  it('drops trailing author and Z-Library groups', () => {
    expect(cleanTitle('Mistborn (Brandon Sanderson) (Z-Library)', 'Brandon Sanderson')).toBe(
      'Mistborn'
    )
  })

  it('keeps meaningful parentheses', () => {
    expect(cleanTitle('1Q84 (Libros 1 y 2)', 'Haruki Murakami')).toBe('1Q84 (Libros 1 y 2)')
  })
})
