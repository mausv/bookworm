import { createHash, randomBytes } from 'node:crypto'
import { and, desc, eq } from 'drizzle-orm'
import { db } from '@/db'
import { apiKey } from '@/db/schema'

const PREFIX = 'bkw_'

function hashKey(key: string) {
  return createHash('sha256').update(key).digest('hex')
}

export function createApiKey(userId: string, name: string) {
  const key = PREFIX + randomBytes(32).toString('base64url')
  const { id } = db
    .insert(apiKey)
    .values({ userId, name, keyHash: hashKey(key) })
    .returning({ id: apiKey.id })
    .get()
  return { id, key }
}

export function listApiKeys(userId: string) {
  return db
    .select({
      id: apiKey.id,
      name: apiKey.name,
      createdAt: apiKey.createdAt,
      lastUsedAt: apiKey.lastUsedAt,
    })
    .from(apiKey)
    .where(eq(apiKey.userId, userId))
    .orderBy(desc(apiKey.createdAt))
    .all()
}

export function revokeApiKey(userId: string, id: string) {
  const { changes } = db
    .delete(apiKey)
    .where(and(eq(apiKey.id, id), eq(apiKey.userId, userId)))
    .run()
  return changes ? {} : { error: 'API key not found' }
}

export function verifyApiKey(key: string) {
  const found = db
    .update(apiKey)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKey.keyHash, hashKey(key)))
    .returning({ userId: apiKey.userId })
    .get()
  return found?.userId ?? null
}
