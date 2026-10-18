import { describe, expect, it } from 'vitest'
import { nextStatus, splitTerm } from './review'

describe('nextStatus', () => {
  it('moves new cards to learning on again or good', () => {
    expect(nextStatus('again', 'new')).toBe('learning')
    expect(nextStatus('good', 'new')).toBe('learning')
  })

  it('keeps learning cards learning on good', () => {
    expect(nextStatus('good', 'learning')).toBe('learning')
  })

  it('sends known cards back to learning on again', () => {
    expect(nextStatus('again', 'known')).toBe('learning')
    expect(nextStatus('good', 'known')).toBe('known')
  })

  it('marks known', () => {
    expect(nextStatus('known', 'new')).toBe('known')
  })
})

describe('splitTerm', () => {
  it('splits around the first case-insensitive match', () => {
    expect(splitTerm('The Petrichor rose.', 'petrichor')).toEqual(['The ', 'Petrichor', ' rose.'])
  })

  it('returns the whole text when the term is absent', () => {
    expect(splitTerm('Nothing here', 'word')).toEqual(['Nothing here'])
    expect(splitTerm('Nothing here', '')).toEqual(['Nothing here'])
  })
})
