import { describe, expect, it } from 'vitest'
import { timeAgo } from './time'

const now = Date.parse('2026-10-24T15:00:00Z')

describe('timeAgo', () => {
  it('uses the largest whole unit', () => {
    expect(timeAgo(now - 3 * 24 * 60 * 60 * 1000, 'en', now)).toBe('3 days ago')
    expect(timeAgo(now - 26 * 60 * 60 * 1000, 'en', now)).toBe('yesterday')
    expect(timeAgo(now - 2 * 60 * 60 * 1000, 'es', now)).toBe('hace 2 horas')
  })

  it('says now for under a minute', () => {
    expect(timeAgo(now - 10_000, 'en', now)).toBe('now')
  })
})
