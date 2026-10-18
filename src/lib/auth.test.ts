import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { setupTestDb } from '@/test/db'

const { dataDir } = await setupTestDb()
vi.stubEnv('INVITE_CODE', 'open-sesame')
const { auth } = await import('./auth')

function signUp(email: string, inviteCode?: string) {
  return auth.handler(
    new Request('http://localhost:3000/api/auth/sign-up/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3000' },
      body: JSON.stringify({ name: 'Ana', email, password: 'correct-horse-battery', inviteCode }),
    })
  )
}

describe('invite-only sign-up', () => {
  it('rejects sign-up without or with a wrong invite code', async () => {
    expect((await signUp('none@example.com')).status).toBe(403)
    expect((await signUp('wrong@example.com', 'nope')).status).toBe(403)
  })

  it('creates accounts for several users with the invite code', async () => {
    const first = await signUp('first@example.com', 'open-sesame')
    expect(first.status).toBe(200)
    expect(first.headers.get('set-cookie')).toContain('better-auth.session_token=')
    expect((await signUp('second@example.com', 'open-sesame')).status).toBe(200)
  })

  it('creates an import inbox for each new user', () => {
    expect(fs.existsSync(path.join(dataDir, 'inbox', 'first@example.com'))).toBe(true)
  })
})
