import fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import { setupTestDb } from '@/test/db'

const { insertUser } = await setupTestDb()
const { createApiKey } = await import('@/lib/api-keys')
const { createApp } = await import('./app')

const app = createApp()
const { key } = createApiKey(insertUser().id, 'Script')
const fixture = (name: string) =>
  fs.readFileSync(new URL(`../importers/fixtures/${name}`, import.meta.url), 'utf8')

function call(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers)
  headers.set('authorization', `Bearer ${key}`)
  return app.request(`http://localhost:3000${path}`, { ...init, headers })
}

function json(method: string, path: string, body: unknown) {
  return call(path, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('public endpoints', () => {
  it('reports health and setup state', async () => {
    expect(await (await app.request('/healthz')).json()).toEqual({ ok: true })
    expect(await (await app.request('/api/setup')).json()).toEqual({ hasAccount: true })
  })

  it('rejects API calls without a session or key', async () => {
    expect((await app.request('/api/books')).status).toBe(401)
    const bad = await app.request('/api/books', { headers: { authorization: 'Bearer bkw_nope' } })
    expect(bad.status).toBe(401)
  })
})

describe('POST /api/import', () => {
  it('imports a raw request body, as curl --data-binary sends it', async () => {
    const res = await call('/api/import', { method: 'POST', body: fixture('kindle-notebook.html') })
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({
      results: [{ file: 'body', source: 'kindle-html', books: [{ title: 'Mistborn', added: 13 }] }],
    })
  })

  it('imports multipart uploads', async () => {
    const form = new FormData()
    form.append('file', new File([fixture('clippings-edge.txt')], 'My Clippings.txt'))
    form.append('file', new File(['nothing here'], 'notes.txt'))
    const res = await call('/api/import', { method: 'POST', body: form })
    const { results } = await res.json()
    expect(res.status).toBe(200)
    expect(results[0]).toMatchObject({ file: 'My Clippings.txt', source: 'clippings' })
    expect(results[1]).toEqual({ file: 'notes.txt', error: 'Unrecognized file format' })
  })

  it('fails with 422 when nothing imports and 400 for an unknown source', async () => {
    expect((await call('/api/import', { method: 'POST', body: 'nope' })).status).toBe(422)
    const res = await call('/api/import?source=kobo', { method: 'POST', body: 'x' })
    expect(res.status).toBe(400)
  })
})

describe('books, highlights and vocab', () => {
  it('lists books and gets one with chapters', async () => {
    const { books } = await (await call('/api/books')).json()
    const mistborn = books.find((b: { title: string }) => b.title === 'Mistborn')
    expect(mistborn.counts.vocab).toBeGreaterThan(0)
    const { book } = await (await call(`/api/books/${mistborn.id}`)).json()
    expect(book.chapters[0].title).toBe('Preface')
    expect((await call('/api/books/nope')).status).toBe(404)
  })

  it('filters highlights by type and classifies them', async () => {
    const { items } = await (await call('/api/highlights?type=unclassified&limit=1')).json()
    expect(items).toHaveLength(1)
    const res = await json('POST', '/api/highlights/classify', { ids: [items[0].id], type: 'lore' })
    expect(await res.json()).toEqual({ updated: 1 })
    const { highlight } = await (await call(`/api/highlights/${items[0].id}`)).json()
    expect(highlight.type).toBe('lore')
  })

  it('validates highlight updates', async () => {
    const { items } = await (await call('/api/highlights?limit=1')).json()
    expect((await json('PATCH', `/api/highlights/${items[0].id}`, { type: 'nope' })).status).toBe(
      400
    )
    const ok = await json('PATCH', `/api/highlights/${items[0].id}`, {
      note: 'mine',
      tags: ['ash'],
    })
    expect((await ok.json()).highlight).toMatchObject({ note: 'mine', tags: ['ash'] })
  })

  it('updates vocab definitions', async () => {
    const { items } = await (await call('/api/vocab?missingDefinition=true&limit=1')).json()
    const res = await json('PATCH', `/api/vocab/${items[0].id}`, {
      definition: 'a common theme',
      status: 'learning',
    })
    expect((await res.json()).vocab).toMatchObject({
      definition: 'a common theme',
      status: 'learning',
    })
  })
})

describe('lore', () => {
  it('upserts and lists lore for a book', async () => {
    const { books } = await (await call('/api/books')).json()
    const bookId = books[0].id
    const res = await json('POST', '/api/lore', { bookId, name: 'Kelsier', kind: 'character' })
    expect((await res.json()).created).toBe(true)
    const { lore } = await (await call(`/api/books/${bookId}/lore?kind=character`)).json()
    expect(lore.map((e: { name: string }) => e.name)).toEqual(['Kelsier'])
  })
})

describe('settings', () => {
  it('overrides a color mapping and resets it', async () => {
    const set = await json('PUT', '/api/colors', {
      source: 'kindle-html',
      color: 'pink',
      type: 'quote',
    })
    const { mappings } = await set.json()
    expect(mappings).toContainEqual({ color: 'pink', type: 'quote', isDefault: false })
    const reset = await json('PUT', '/api/colors', {
      source: 'kindle-html',
      color: 'pink',
      type: null,
    })
    expect((await reset.json()).mappings).toContainEqual({
      color: 'pink',
      type: 'unclassified',
      isDefault: true,
    })
  })

  it('creates and revokes API keys', async () => {
    const created = await (await json('POST', '/api/api-keys', { name: 'Laptop' })).json()
    expect(created.key).toMatch(/^bkw_/)
    expect((await call(`/api/api-keys/${created.id}`, { method: 'DELETE' })).status).toBe(200)
  })
})

describe('quiz and exports', () => {
  it('builds a quiz and records answers', async () => {
    const { items } = await (await call('/api/vocab?limit=200')).json()
    for (const [i, v] of items.slice(0, 4).entries()) {
      await json('PATCH', `/api/vocab/${v.id}`, { definition: `meaning ${i}` })
    }
    const { questions } = await (await call('/api/quiz?count=3&mode=choice')).json()
    expect(questions).toHaveLength(3)
    expect(questions[0].options).toHaveLength(4)
    const res = await json('POST', '/api/quiz/answer', {
      vocabId: questions[0].vocabId,
      mode: 'choice',
      direction: questions[0].direction,
      answer: 'definitely wrong',
    })
    expect(await res.json()).toMatchObject({ correct: false, status: 'learning' })
  })

  it('downloads Markdown, TSV and JSON exports', async () => {
    const { books } = await (await call('/api/books')).json()
    const md = await call(`/api/export/books/${books[0].id}/markdown`)
    expect(md.headers.get('content-type')).toContain('text/markdown')
    expect(md.headers.get('content-disposition')).toContain('attachment')
    expect(await md.text()).toContain('---\ntitle:')
    expect(await (await call('/api/export/vocab.tsv')).text()).toMatch(/^#separator:tab/)
    expect(await (await call('/api/export/json')).json()).toMatchObject({ format: 'bookworm' })
  })
})
