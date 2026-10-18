import { createHash, randomBytes } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { setupTestDb } from '@/test/db'

await setupTestDb()
vi.stubEnv('INVITE_CODE', 'open-sesame')
const { auth } = await import('@/lib/auth')
const { createApiKey } = await import('@/lib/api-keys')
const { revokeConnectedClient } = await import('@/lib/oauth')
const { createApp } = await import('./app')

const app = createApp()
const BASE = 'http://localhost:3000'
const RESOURCE = `${BASE}/mcp`
const REDIRECT_URI = 'https://claude.ai/api/mcp/auth_callback'
const EMAIL = 'reader@example.com'
const PASSWORD = 'correct-horse-battery'

function request(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers)
  headers.set('origin', BASE)
  return app.request(`${BASE}${path}`, { ...init, headers })
}

function postJson(path: string, body: unknown, cookie?: string) {
  return request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(cookie && { cookie }) },
    body: JSON.stringify(body),
  })
}

function postForm(path: string, body: Record<string, string>) {
  return request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body),
  })
}

function cookieOf(res: Response) {
  return res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ')
}

async function registerClient(name = 'Claude') {
  const res = await postJson('/api/auth/oauth2/register', {
    client_name: name,
    redirect_uris: [REDIRECT_URI],
    token_endpoint_auth_method: 'none',
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
  })
  return { status: res.status, client: await res.json() }
}

const signUpRes = await postJson('/api/auth/sign-up/email', {
  name: 'Reader',
  email: EMAIL,
  password: PASSWORD,
  inviteCode: 'open-sesame',
})
const { user } = await signUpRes.json()
const userId: string = user.id

async function signIn() {
  return cookieOf(await postJson('/api/auth/sign-in/email', { email: EMAIL, password: PASSWORD }))
}

function pkce() {
  const verifier = randomBytes(32).toString('base64url')
  const challenge = createHash('sha256').update(verifier).digest('base64url')
  return { verifier, challenge }
}

function authorize(clientId: string, challenge: string, cookie?: string) {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: REDIRECT_URI,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state: 'state-123',
    resource: RESOURCE,
  })
  return request(`/api/auth/oauth2/authorize?${params}`, { headers: cookie ? { cookie } : {} })
}

function location(res: Response) {
  return new URL(res.headers.get('location') ?? '', BASE)
}

async function consent(oauthQuery: string, accept: boolean, cookie: string) {
  const res = await postJson(
    '/api/auth/oauth2/consent',
    { accept, oauth_query: oauthQuery },
    cookie
  )
  const { url } = await res.json()
  return new URL(url)
}

function exchangeCode(clientId: string, code: string, verifier: string) {
  return postForm('/api/auth/oauth2/token', {
    grant_type: 'authorization_code',
    client_id: clientId,
    code,
    code_verifier: verifier,
    redirect_uri: REDIRECT_URI,
    resource: RESOURCE,
  })
}

function refresh(clientId: string, refreshToken: string) {
  return postForm('/api/auth/oauth2/token', {
    grant_type: 'refresh_token',
    client_id: clientId,
    refresh_token: refreshToken,
    resource: RESOURCE,
  })
}

function listTools(authorization?: string) {
  const headers = new Headers({
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
  })
  if (authorization) headers.set('Authorization', authorization)
  return app.request(RESOURCE, {
    method: 'POST',
    headers,
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
  })
}

async function connect() {
  const { client } = await registerClient()
  const cookie = await signIn()
  const { verifier, challenge } = pkce()
  const toConsent = location(await authorize(client.client_id, challenge, cookie))
  const callback = await consent(toConsent.search.slice(1), true, cookie)
  const tokenRes = await exchangeCode(
    client.client_id,
    callback.searchParams.get('code') ?? '',
    verifier
  )
  return { client, cookie, callback, tokens: await tokenRes.json(), tokenStatus: tokenRes.status }
}

const connected = await connect()

describe('discovery metadata', () => {
  it('names /mcp as the protected resource served by this app', async () => {
    const res = await request('/.well-known/oauth-protected-resource')
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({
      resource: RESOURCE,
      authorization_servers: [BASE],
      bearer_methods_supported: ['header'],
    })
  })

  it('serves authorization server metadata with PKCE and registration', async () => {
    const res = await request('/.well-known/oauth-authorization-server')
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({
      issuer: BASE,
      code_challenge_methods_supported: ['S256'],
      registration_endpoint: expect.stringContaining('/oauth2/register'),
    })
  })
})

describe('dynamic client registration', () => {
  it('registers a public client without a session', async () => {
    const { status, client } = await registerClient()
    expect(status).toBe(201)
    expect(client.redirect_uris).toEqual([REDIRECT_URI])
  })
})

describe('authorize', () => {
  it('sends a signed-out user to /login with the signed authorization request', async () => {
    const { client } = await registerClient()
    const res = await authorize(client.client_id, pkce().challenge)
    const to = location(res)
    expect(res.status).toBe(302)
    expect(to.pathname).toBe('/login')
    expect(to.searchParams.get('sig')).toEqual(expect.any(String))
  })

  it('sends a signed-in user to the consent page', async () => {
    const { client } = await registerClient()
    const to = location(await authorize(client.client_id, pkce().challenge, await signIn()))
    expect(to.pathname).toBe('/oauth/consent')
  })

  it('resumes the authorization after signing in from the login page', async () => {
    const { client } = await registerClient()
    const toLogin = location(await authorize(client.client_id, pkce().challenge))
    const res = await postJson('/api/auth/sign-in/email', {
      email: EMAIL,
      password: PASSWORD,
      oauth_query: toLogin.search.slice(1),
    })
    const body = await res.json()
    expect(body.redirect).toBe(true)
    expect(new URL(body.url, BASE).pathname).toBe('/oauth/consent')
  })

  it('skips consent once the user approved the client', async () => {
    const to = location(
      await authorize(connected.client.client_id, pkce().challenge, connected.cookie)
    )
    expect(to.origin + to.pathname).toBe(REDIRECT_URI)
    expect(to.searchParams.get('code')).toEqual(expect.any(String))
  })
})

describe('consent', () => {
  it('redirects to the client with a code and the original state on approve', () => {
    expect(connected.callback.origin + connected.callback.pathname).toBe(REDIRECT_URI)
    expect(connected.callback.searchParams.get('state')).toBe('state-123')
  })

  it('redirects with access_denied on deny', async () => {
    const { client } = await registerClient()
    const cookie = await signIn()
    const toConsent = location(await authorize(client.client_id, pkce().challenge, cookie))
    const callback = await consent(toConsent.search.slice(1), false, cookie)
    expect(callback.searchParams.get('error')).toBe('access_denied')
  })
})

describe('token endpoint', () => {
  it('exchanges the code for an access and a refresh token', () => {
    expect(connected.tokenStatus).toBe(200)
    expect(connected.tokens).toMatchObject({
      token_type: 'Bearer',
      access_token: expect.any(String),
      refresh_token: expect.any(String),
    })
  })

  it('issues a working access token from the refresh token', async () => {
    const { client, tokens } = await connect()
    const res = await refresh(client.client_id, tokens.refresh_token)
    const refreshed = await res.json()
    expect(res.status).toBe(200)
    expect((await listTools(`Bearer ${refreshed.access_token}`)).status).toBe(200)
  })
})

describe('POST /mcp', () => {
  it('lists tools with the access token', async () => {
    const res = await listTools(`Bearer ${connected.tokens.access_token}`)
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({
      result: { tools: expect.arrayContaining([expect.objectContaining({ name: 'list_books' })]) },
    })
  })

  it('challenges a request without a token with the resource metadata URL', async () => {
    const res = await listTools()
    expect(res.status).toBe(401)
    expect(res.headers.get('www-authenticate')).toBe(
      `Bearer resource_metadata="${BASE}/.well-known/oauth-protected-resource"`
    )
  })

  it('challenges a garbage token with invalid_token', async () => {
    const res = await listTools('Bearer not-a-token')
    expect(res.headers.get('www-authenticate')).toContain('error="invalid_token"')
  })

  it('rejects a token signed for another resource', async () => {
    const { token } = await auth.api.signJWT({
      body: { payload: { sub: userId, aud: `${BASE}/other`, azp: connected.client.client_id } },
    })
    expect((await listTools(`Bearer ${token}`)).status).toBe(401)
  })

  it('rejects tokens after the connection is revoked', async () => {
    const { client, tokens } = await connect()
    revokeConnectedClient(userId, client.client_id)
    expect((await listTools(`Bearer ${tokens.access_token}`)).status).toBe(401)
    expect((await refresh(client.client_id, tokens.refresh_token)).status).toBe(400)
  })

  it('accepts an API key', async () => {
    const { key } = createApiKey(userId, 'Claude Code')
    expect((await listTools(`Bearer ${key}`)).status).toBe(200)
  })

  it('answers GET with 405', async () => {
    expect((await app.request(RESOURCE)).status).toBe(405)
  })
})
