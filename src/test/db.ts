import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, vi } from 'vitest'

export async function setupTestDb() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bookworm-test-'))
  vi.stubEnv('DATA_DIR', dataDir)
  vi.stubEnv('BETTER_AUTH_URL', 'http://localhost:3000')
  vi.stubEnv('BETTER_AUTH_SECRET', 'test-secret-that-is-at-least-32-characters')
  afterAll(() => {
    vi.unstubAllEnvs()
    fs.rmSync(dataDir, { recursive: true, force: true })
  })

  const { db } = await import('@/db')
  const schema = await import('@/db/schema')

  function insertUser() {
    return db
      .insert(schema.user)
      .values({ id: crypto.randomUUID(), name: 'Ana', email: `${crypto.randomUUID()}@example.com` })
      .returning()
      .get()
  }

  function insertBook(values: Partial<typeof schema.book.$inferInsert> = {}) {
    const title = values.title ?? `Book ${crypto.randomUUID()}`
    return db
      .insert(schema.book)
      .values({ title, matchKey: crypto.randomUUID(), ...values })
      .returning()
      .get()
  }

  function insertHighlight(
    bookId: string,
    values: Partial<typeof schema.highlight.$inferInsert> = {}
  ) {
    return db
      .insert(schema.highlight)
      .values({
        bookId,
        text: 'ruddy',
        dedupKey: crypto.randomUUID(),
        source: 'kindle-html',
        ...values,
      })
      .returning()
      .get()
  }

  return { db, schema, dataDir, insertUser, insertBook, insertHighlight }
}
