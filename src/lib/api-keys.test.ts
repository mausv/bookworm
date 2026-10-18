import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { setupTestDb } from '@/test/db'

const { db, schema, insertUser } = await setupTestDb()
const { createApiKey, listApiKeys, revokeApiKey, verifyApiKey } = await import('./api-keys')

const ana = insertUser()
const ben = insertUser()

function row(id: string) {
  return db.select().from(schema.apiKey).where(eq(schema.apiKey.id, id)).get()
}

describe('createApiKey', () => {
  it('returns a prefixed random key', () => {
    const { key } = createApiKey(ana.id, 'Laptop')
    expect(key).toMatch(/^bkw_[\w-]{43}$/)
    expect(createApiKey(ana.id, 'Laptop').key).not.toBe(key)
  })

  it('stores only a hash of the key', () => {
    const { id, key } = createApiKey(ana.id, 'Laptop')
    const stored = row(id)
    expect(stored).toMatchObject({ userId: ana.id, name: 'Laptop', lastUsedAt: null })
    expect(stored?.keyHash).not.toContain(key)
    expect(stored?.keyHash).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('verifyApiKey', () => {
  it('returns the owner of a valid key', () => {
    const { key } = createApiKey(ben.id, 'Phone')
    expect(verifyApiKey(key)).toBe(ben.id)
  })

  it('records when the key was last used', () => {
    const { id, key } = createApiKey(ana.id, 'Phone')
    verifyApiKey(key)
    expect(row(id)?.lastUsedAt).toBeInstanceOf(Date)
  })

  it('returns null for an unknown key', () => {
    expect(verifyApiKey('bkw_nope')).toBeNull()
  })

  it('returns null for a revoked key', () => {
    const { id, key } = createApiKey(ana.id, 'Old')
    revokeApiKey(ana.id, id)
    expect(verifyApiKey(key)).toBeNull()
  })
})

describe('listApiKeys', () => {
  it('lists only the user’s keys without the key or hash', () => {
    const user = insertUser()
    createApiKey(user.id, 'First')
    createApiKey(user.id, 'Second')
    const keys = listApiKeys(user.id)
    expect(keys.map((k) => k.name).sort()).toEqual(['First', 'Second'])
    expect(Object.keys(keys[0]).sort()).toEqual(['createdAt', 'id', 'lastUsedAt', 'name'])
  })
})

describe('revokeApiKey', () => {
  it('deletes the user’s key', () => {
    const { id } = createApiKey(ana.id, 'Laptop')
    expect(revokeApiKey(ana.id, id)).toEqual({})
    expect(row(id)).toBeUndefined()
  })

  it('refuses to revoke another user’s key', () => {
    const { id } = createApiKey(ana.id, 'Laptop')
    expect(revokeApiKey(ben.id, id)).toEqual({ error: 'API key not found' })
    expect(row(id)).toBeDefined()
  })
})
