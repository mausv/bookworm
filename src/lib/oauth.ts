import { verifyJwsAccessToken } from 'better-auth/oauth2'
import { and, desc, eq } from 'drizzle-orm'
import { db } from '@/db'
import { oauthAccessToken, oauthClient, oauthConsent, oauthRefreshToken } from '@/db/schema'
import { auth, issuer, mcpResource } from './auth'

function isInvalidToken(error: unknown) {
  if (error instanceof TypeError) return true
  return error instanceof Error && 'code' in error && String(error.code).startsWith('ERR_J')
}

export async function verifyAccessToken(token: string) {
  let payload
  try {
    payload = await verifyJwsAccessToken(token, {
      jwksFetch: () => auth.api.getJwks(),
      jwksCacheKey: auth,
      verifyOptions: { issuer, audience: mcpResource },
    })
  } catch (error) {
    if (isInvalidToken(error)) return null
    throw error
  }
  if (!payload.sub || typeof payload.azp !== 'string' || payload.cnf) return null
  const consent = db
    .select({ id: oauthConsent.id })
    .from(oauthConsent)
    .where(and(eq(oauthConsent.userId, payload.sub), eq(oauthConsent.clientId, payload.azp)))
    .get()
  return consent ? payload.sub : null
}

export function listConnectedClients(userId: string) {
  return db
    .select({
      clientId: oauthConsent.clientId,
      name: oauthClient.name,
      connectedAt: oauthConsent.createdAt,
    })
    .from(oauthConsent)
    .innerJoin(oauthClient, eq(oauthClient.clientId, oauthConsent.clientId))
    .where(eq(oauthConsent.userId, userId))
    .orderBy(desc(oauthConsent.createdAt))
    .all()
}

export function revokeConnectedClient(userId: string, clientId: string) {
  return db.transaction((tx) => {
    const { changes } = tx
      .delete(oauthConsent)
      .where(and(eq(oauthConsent.userId, userId), eq(oauthConsent.clientId, clientId)))
      .run()
    if (!changes) return { error: 'Connection not found' }
    tx.delete(oauthAccessToken)
      .where(and(eq(oauthAccessToken.userId, userId), eq(oauthAccessToken.clientId, clientId)))
      .run()
    tx.delete(oauthRefreshToken)
      .where(and(eq(oauthRefreshToken.userId, userId), eq(oauthRefreshToken.clientId, clientId)))
      .run()
    return {}
  })
}
