import { describe, expect, it } from 'vitest'
import { detectLocale, format, translate } from './i18n'
import { en } from './messages/en'
import { es } from './messages/es'

describe('detectLocale', () => {
  it('picks Spanish for any es variant', () => {
    expect(detectLocale('es')).toBe('es')
    expect(detectLocale('es-MX')).toBe('es')
    expect(detectLocale('ES-419')).toBe('es')
  })

  it('falls back to English', () => {
    expect(detectLocale('en-US')).toBe('en')
    expect(detectLocale('fr')).toBe('en')
    expect(detectLocale('')).toBe('en')
    expect(detectLocale(undefined)).toBe('en')
  })
})

describe('format', () => {
  it('interpolates params and leaves unknown placeholders', () => {
    expect(format('en', 'Delete {title}? {missing}', { title: 'Dune' })).toBe(
      'Delete Dune? {missing}'
    )
  })

  it('picks the plural form from count', () => {
    const message = { one: 'Queda {count}', other: 'Quedan {count}' }
    expect(format('es', message, { count: 1 })).toBe('Queda 1')
    expect(format('es', message, { count: 12 })).toBe('Quedan 12')
    expect(format('es', message, { count: 0 })).toBe('Quedan 0')
  })
})

describe('translate', () => {
  it('uses the locale dictionary', () => {
    expect(translate('en', 'vocab.seen', { count: 3 })).toBe('Seen 3×')
    expect(translate('es', 'vocab.seen', { count: 3 })).toBe('Visto 3×')
    expect(translate('es', 'triage.left', { count: 1 })).toBe('Queda 1')
  })
})

describe('dictionaries', () => {
  it('have the same keys and message shapes', () => {
    expect(Object.keys(es).sort()).toEqual(Object.keys(en).sort())
    const spanish = new Map(Object.entries(es))
    for (const [key, message] of Object.entries(en)) {
      expect(typeof spanish.get(key), key).toBe(typeof message)
    }
  })

  it('have no empty messages', () => {
    for (const message of [...Object.values(en), ...Object.values(es)]) {
      const forms = typeof message === 'string' ? [message] : Object.values(message)
      for (const form of forms) expect(form.trim()).not.toBe('')
    }
  })
})
