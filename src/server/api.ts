import { type Context, Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { createMiddleware } from 'hono/factory'
import type { z } from 'zod'
import { createApiKey, listApiKeys, revokeApiKey, verifyApiKey } from '@/lib/api-keys'
import { auth } from '@/lib/auth'
import { deleteBook, getBook, listBooks, updateBook } from '@/lib/books'
import { listColorMappings, resetColorMapping, setColorMapping } from '@/lib/colors'
import {
  addTags,
  classifyHighlights,
  deleteHighlight,
  getHighlight,
  listHighlights,
  listTags,
  updateHighlight,
} from '@/lib/highlights'
import { bookMarkdown, jsonDump, vocabTsv } from '@/lib/export'
import { addHighlight, importContent } from '@/lib/import'
import { deleteLore, listLore, unlinkLoreHighlight, updateLore, upsertLore } from '@/lib/lore'
import { listConnectedClients, revokeConnectedClient } from '@/lib/oauth'
import { answerQuiz, buildQuiz } from '@/lib/quiz'
import {
  addTagsSchema,
  apiKeySchema,
  bookUpdateSchema,
  classifySchema,
  colorMappingSchema,
  highlightType,
  highlightUpdateSchema,
  loreInputSchema,
  loreKind,
  loreUpdateSchema,
  manualHighlightSchema,
  quizAnswerSchema,
  quizMode,
  source,
  vocabStatus,
  vocabUpdateSchema,
} from '@/lib/validation'
import { getVocab, listVocab, updateVocab } from '@/lib/vocab'

type Env = { Variables: { userId: string } }

const requireUser = createMiddleware<Env>(async (c, next) => {
  const token = c.req.header('authorization')?.match(/^Bearer\s+(\S+)$/i)?.[1]
  const userId = token
    ? verifyApiKey(token)
    : (await auth.api.getSession({ headers: c.req.raw.headers }))?.user.id
  if (!userId) return c.json({ error: 'Unauthorized' }, 401)
  c.set('userId', userId)
  await next()
})

async function parseJson<T extends z.ZodType>(c: Context, schema: T) {
  const body: unknown = await c.req.json().catch(() => undefined)
  return schema.safeParse(body)
}

function invalid(c: Context, error: z.ZodError) {
  return c.json({ error: 'Invalid request', issues: error.issues }, 400)
}

function respond(c: Context, result: Record<string, unknown>) {
  return typeof result.error === 'string' ? c.json({ error: result.error }, 404) : c.json(result)
}

function query<T extends z.ZodType>(schema: T, value: string | undefined) {
  if (value === undefined || value === '') return undefined
  const parsed = schema.safeParse(value)
  return parsed.success ? (parsed.data as z.infer<T>) : undefined
}

function attachment(filename: string) {
  return `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`
}

function pageParams(c: Context) {
  const limit = Number(c.req.query('limit'))
  return {
    cursor: c.req.query('cursor') ?? null,
    limit: Number.isInteger(limit) && limit > 0 ? Math.min(limit, 200) : undefined,
  }
}

export const api = new Hono<Env>()
  .use(requireUser)

  .get('/books', (c) => c.json({ books: listBooks(c.get('userId')) }))
  .get('/books/:id', (c) => {
    const book = getBook(c.get('userId'), c.req.param('id'))
    return book ? c.json({ book }) : c.json({ error: 'Book not found' }, 404)
  })
  .patch('/books/:id', async (c) => {
    const parsed = await parseJson(c, bookUpdateSchema)
    if (!parsed.success) return invalid(c, parsed.error)
    return respond(c, updateBook(c.get('userId'), c.req.param('id'), parsed.data))
  })
  .delete('/books/:id', (c) => respond(c, deleteBook(c.get('userId'), c.req.param('id'))))
  .get('/books/:id/tags', (c) => c.json({ tags: listTags(c.get('userId'), c.req.param('id')) }))
  .get('/books/:id/lore', (c) =>
    c.json({
      lore: listLore(c.get('userId'), c.req.param('id'), query(loreKind, c.req.query('kind'))),
    })
  )

  .get('/highlights', (c) =>
    c.json(
      listHighlights(c.get('userId'), {
        bookId: c.req.query('bookId'),
        chapterId: c.req.query('chapterId'),
        type: query(highlightType, c.req.query('type')),
        q: c.req.query('q'),
        tag: c.req.query('tag'),
        ...pageParams(c),
      })
    )
  )
  .get('/highlights/:id', (c) => {
    const highlight = getHighlight(c.get('userId'), c.req.param('id'))
    return highlight ? c.json({ highlight }) : c.json({ error: 'Highlight not found' }, 404)
  })
  .patch('/highlights/:id', async (c) => {
    const parsed = await parseJson(c, highlightUpdateSchema)
    if (!parsed.success) return invalid(c, parsed.error)
    return respond(c, updateHighlight(c.get('userId'), c.req.param('id'), parsed.data))
  })
  .delete('/highlights/:id', (c) => respond(c, deleteHighlight(c.get('userId'), c.req.param('id'))))
  .post('/highlights', async (c) => {
    const parsed = await parseJson(c, manualHighlightSchema)
    if (!parsed.success) return invalid(c, parsed.error)
    return respond(c, addHighlight(c.get('userId'), parsed.data))
  })
  .post('/highlights/classify', async (c) => {
    const parsed = await parseJson(c, classifySchema)
    if (!parsed.success) return invalid(c, parsed.error)
    return c.json(classifyHighlights(c.get('userId'), parsed.data.ids, parsed.data.type))
  })
  .post('/highlights/tags', async (c) => {
    const parsed = await parseJson(c, addTagsSchema)
    if (!parsed.success) return invalid(c, parsed.error)
    return c.json(addTags(c.get('userId'), parsed.data.ids, parsed.data.tags))
  })

  .get('/vocab', (c) =>
    c.json(
      listVocab(c.get('userId'), {
        bookId: c.req.query('bookId'),
        chapterId: c.req.query('chapterId'),
        status: query(vocabStatus, c.req.query('status')),
        missingDefinition: c.req.query('missingDefinition') === 'true',
        ...pageParams(c),
      })
    )
  )
  .get('/vocab/:id', (c) => {
    const vocab = getVocab(c.get('userId'), c.req.param('id'))
    return vocab ? c.json({ vocab }) : c.json({ error: 'Vocab entry not found' }, 404)
  })
  .patch('/vocab/:id', async (c) => {
    const parsed = await parseJson(c, vocabUpdateSchema)
    if (!parsed.success) return invalid(c, parsed.error)
    return respond(c, updateVocab(c.get('userId'), c.req.param('id'), parsed.data))
  })

  .post('/lore', async (c) => {
    const parsed = await parseJson(c, loreInputSchema)
    if (!parsed.success) return invalid(c, parsed.error)
    return respond(c, upsertLore(c.get('userId'), parsed.data))
  })
  .patch('/lore/:id', async (c) => {
    const parsed = await parseJson(c, loreUpdateSchema)
    if (!parsed.success) return invalid(c, parsed.error)
    return respond(c, updateLore(c.get('userId'), c.req.param('id'), parsed.data))
  })
  .delete('/lore/:id', (c) => respond(c, deleteLore(c.get('userId'), c.req.param('id'))))
  .delete('/lore/:id/highlights/:highlightId', (c) =>
    respond(c, unlinkLoreHighlight(c.get('userId'), c.req.param('id'), c.req.param('highlightId')))
  )

  .post('/import', bodyLimit({ maxSize: 50 * 1024 * 1024 }), async (c) => {
    const sourceParam = c.req.query('source')
    const forced = query(source, sourceParam)
    if (sourceParam && !forced) return c.json({ error: `Unknown source ${sourceParam}` }, 400)
    const files: { name: string; content: string }[] = []
    if (c.req.header('content-type')?.startsWith('multipart/form-data')) {
      const form = await c.req.formData()
      for (const value of form.getAll('file')) {
        if (value instanceof File) files.push({ name: value.name, content: await value.text() })
      }
    } else {
      files.push({ name: 'body', content: await c.req.text() })
    }
    if (!files.length) return c.json({ error: 'No file uploaded' }, 400)
    const results = files.map((f) => ({
      file: f.name,
      ...importContent(c.get('userId'), f.content, forced),
    }))
    const failed = results.every((r) => 'error' in r)
    return c.json({ results }, failed ? 422 : 200)
  })

  .get('/colors/:source', (c) => {
    const parsed = source.safeParse(c.req.param('source'))
    if (!parsed.success) return c.json({ error: 'Unknown source' }, 404)
    return c.json({ mappings: listColorMappings(c.get('userId'), parsed.data) })
  })
  .put('/colors', async (c) => {
    const parsed = await parseJson(c, colorMappingSchema)
    if (!parsed.success) return invalid(c, parsed.error)
    const { source, color, type } = parsed.data
    if (type) setColorMapping(c.get('userId'), source, color, type)
    else resetColorMapping(c.get('userId'), source, color)
    return c.json({ mappings: listColorMappings(c.get('userId'), source) })
  })

  .get('/quiz', (c) => {
    const count = Number(c.req.query('count'))
    const modeParam = c.req.query('mode')
    return c.json({
      questions: buildQuiz(
        c.get('userId'),
        { bookId: c.req.query('bookId'), chapterId: c.req.query('chapterId') },
        {
          count: Number.isInteger(count) && count > 0 ? Math.min(count, 50) : undefined,
          mode: modeParam === 'mixed' ? 'mixed' : query(quizMode, modeParam),
        }
      ),
    })
  })
  .post('/quiz/answer', async (c) => {
    const parsed = await parseJson(c, quizAnswerSchema)
    if (!parsed.success) return invalid(c, parsed.error)
    return respond(c, answerQuiz(c.get('userId'), parsed.data))
  })

  .get('/export/books/:id/markdown', (c) => {
    const exported = bookMarkdown(c.get('userId'), c.req.param('id'))
    if (!exported) return c.json({ error: 'Book not found' }, 404)
    return c.body(exported.markdown, 200, {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Content-Disposition': attachment(exported.filename),
    })
  })
  .get('/export/vocab.tsv', (c) =>
    c.body(
      vocabTsv(c.get('userId'), {
        bookId: c.req.query('bookId'),
        chapterId: c.req.query('chapterId'),
      }),
      200,
      {
        'Content-Type': 'text/tab-separated-values; charset=utf-8',
        'Content-Disposition': attachment('bookworm-vocab.tsv'),
      }
    )
  )
  .get('/export/json', (c) =>
    c.body(JSON.stringify(jsonDump(c.get('userId')), null, 2), 200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': attachment(`bookworm-${new Date().toISOString().slice(0, 10)}.json`),
    })
  )

  .get('/api-keys', (c) => c.json({ keys: listApiKeys(c.get('userId')) }))
  .post('/api-keys', async (c) => {
    const parsed = await parseJson(c, apiKeySchema)
    if (!parsed.success) return invalid(c, parsed.error)
    return c.json(createApiKey(c.get('userId'), parsed.data.name))
  })
  .delete('/api-keys/:id', (c) => respond(c, revokeApiKey(c.get('userId'), c.req.param('id'))))
  .get('/connections', (c) => c.json({ clients: listConnectedClients(c.get('userId')) }))
  .delete('/connections/:clientId', (c) =>
    respond(c, revokeConnectedClient(c.get('userId'), c.req.param('clientId')))
  )

export type Api = typeof api
