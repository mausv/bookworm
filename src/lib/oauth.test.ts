import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { setupTestDb } from '@/test/db'

const { db, schema, insertUser } = await setupTestDb()
const { listConnectedClients, revokeConnectedClient, verifyAccessToken } = await import('./oauth')

function insertClient(name: string | null = 'Claude') {
  return db
    .insert(schema.oauthClient)
    .values({ id: crypto.randomUUID(), clientId: crypto.randomUUID(), name, redirectUris: [] })
    .returning()
    .get()
}

function connect(userId: string, clientId: string, createdAt = new Date()) {
  db.insert(schema.oauthConsent)
    .values({
      id: crypto.randomUUID(),
      clientId,
      userId,
      scopes: ['offline_access'],
      createdAt,
      updatedAt: createdAt,
    })
    .run()
  db.insert(schema.oauthRefreshToken)
    .values({
      id: crypto.randomUUID(),
      token: crypto.randomUUID(),
      clientId,
      userId,
      scopes: ['offline_access'],
      expiresAt: new Date(Date.now() + 60_000),
      createdAt,
    })
    .run()
}

function refreshTokens(clientId: string) {
  return db
    .select()
    .from(schema.oauthRefreshToken)
    .where(eq(schema.oauthRefreshToken.clientId, clientId))
    .all()
}

describe('listConnectedClients', () => {
  it('lists the clients the user approved, newest first', () => {
    const ana = insertUser()
    const older = insertClient('Claude Code')
    const newer = insertClient('Claude')
    connect(ana.id, older.clientId, new Date('2026-01-01'))
    connect(ana.id, newer.clientId, new Date('2026-02-01'))
    expect(listConnectedClients(ana.id)).toEqual([
      { clientId: newer.clientId, name: 'Claude', connectedAt: new Date('2026-02-01') },
      { clientId: older.clientId, name: 'Claude Code', connectedAt: new Date('2026-01-01') },
    ])
  })

  it('leaves out other users’ connections', () => {
    const ana = insertUser()
    const ben = insertUser()
    connect(ben.id, insertClient().clientId)
    expect(listConnectedClients(ana.id)).toEqual([])
  })

  it('keeps clients without a name', () => {
    const ana = insertUser()
    connect(ana.id, insertClient(null).clientId)
    expect(listConnectedClients(ana.id)).toEqual([expect.objectContaining({ name: null })])
  })
})

describe('revokeConnectedClient', () => {
  it('removes the connection', () => {
    const ana = insertUser()
    const { clientId } = insertClient()
    connect(ana.id, clientId)
    expect(revokeConnectedClient(ana.id, clientId)).toEqual({})
    expect(listConnectedClients(ana.id)).toEqual([])
  })

  it('deletes the refresh tokens', () => {
    const ana = insertUser()
    const { clientId } = insertClient()
    connect(ana.id, clientId)
    revokeConnectedClient(ana.id, clientId)
    expect(refreshTokens(clientId)).toEqual([])
  })

  it('refuses to revoke another user’s connection', () => {
    const ana = insertUser()
    const ben = insertUser()
    const { clientId } = insertClient()
    connect(ben.id, clientId)
    expect(revokeConnectedClient(ana.id, clientId)).toEqual({ error: 'Connection not found' })
    expect(listConnectedClients(ben.id)).toHaveLength(1)
    expect(refreshTokens(clientId)).toHaveLength(1)
  })
})

describe('verifyAccessToken', () => {
  it('returns null for a malformed token', async () => {
    expect(await verifyAccessToken('not-a-token')).toBeNull()
  })

  it('returns null for an API key', async () => {
    expect(await verifyAccessToken('bkw_abc')).toBeNull()
  })

  it('returns null for an unsigned JWT', async () => {
    const part = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url')
    const token = `${part({ alg: 'none' })}.${part({ sub: 'x', aud: 'http://localhost:3000/mcp' })}.`
    expect(await verifyAccessToken(token)).toBeNull()
  })
})
