import { describe, expect, it } from 'vitest'
import { loginPath, nextPath, signedOAuthQuery, withQuery } from './url'

describe('signedOAuthQuery', () => {
  it('returns nothing for a plain login URL', () => {
    expect(signedOAuthQuery('')).toBeUndefined()
    expect(signedOAuthQuery('?next=%2Fbooks')).toBeUndefined()
  })

  it('returns the signed query without the leading ?', () => {
    expect(signedOAuthQuery('?client_id=abc&exp=1&sig=xyz')).toBe('client_id=abc&exp=1&sig=xyz')
  })
})

describe('nextPath', () => {
  it('returns a local path', () => {
    expect(nextPath('?next=%2Fbooks%2F1%3Ftab%3Dlore')).toBe('/books/1?tab=lore')
  })

  it('falls back to / for missing or external targets', () => {
    expect(nextPath('')).toBe('/')
    expect(nextPath('?next=https%3A%2F%2Fevil.example')).toBe('/')
    expect(nextPath('?next=%2F%2Fevil.example')).toBe('/')
    expect(nextPath('?next=%2F%5Cevil.example')).toBe('/')
  })
})

describe('loginPath', () => {
  it('encodes the return path', () => {
    expect(loginPath('/triage?bookId=1')).toBe('/login?next=%2Ftriage%3FbookId%3D1')
  })
})

describe('withQuery', () => {
  it('skips empty values', () => {
    expect(withQuery('/highlights', { bookId: 'b', q: '', tag: undefined, limit: 50 })).toBe(
      '/highlights?bookId=b&limit=50'
    )
  })

  it('returns the bare path without params', () => {
    expect(withQuery('/vocab', { status: undefined })).toBe('/vocab')
  })
})
