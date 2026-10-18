import { describe, expect, it } from 'vitest'
import { setupTestDb } from '@/test/db'

await setupTestDb()
const { auth, hasAccount } = await import('./auth')

function signUp(email: string) {
  return auth.handler(
    new Request('http://localhost:3000/api/auth/sign-up/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3000' },
      body: JSON.stringify({ name: 'Ana', email, password: 'correct-horse-battery' }),
    })
  )
}

describe('single-account sign-up', () => {
  it('creates the first account', async () => {
    expect(hasAccount()).toBe(false)
    const res = await signUp('first@example.com')
    expect(res.status).toBe(200)
    expect(res.headers.get('set-cookie')).toContain('better-auth.session_token=')
    expect(hasAccount()).toBe(true)
  })

  it('refuses a second account', async () => {
    expect((await signUp('second@example.com')).status).toBe(403)
  })
})
