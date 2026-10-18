import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'
import { version } from '../../package.json'
import { getBook, listBooks } from '@/lib/books'
import { listHighlights } from '@/lib/highlights'
import { listLore } from '@/lib/lore'
import { highlightType, id, loreKind, vocabStatus } from '@/lib/validation'
import { listVocab } from '@/lib/vocab'

const INSTRUCTIONS = `Reading highlights from the user's books (Kindle, Readest), organized as book → chapter → highlight.
Highlight types follow the user's color convention:
- vocab (yellow): a word or phrase the user didn't know. Each has a vocab entry (term, definition, part of speech, example, status new|learning|known). The highlight text may include surrounding words; the term is the word itself.
- quote (orange): a phrase the user liked.
- lore (blue/aqua): book lore — world, characters, places, factions, events. Lore entries are a per-book wiki linked to the highlights they come from.
- unclassified: no color info (e.g. Kindle My Clippings.txt) or an unmapped color; the user triages these.
Notes on highlights are the user's own words (for vocab they are often the user's own definition).
List tools return { items, nextCursor }; pass nextCursor back as cursor to get the next page. Ids come from list results.`

function compact<T extends Record<string, unknown>>(value: T) {
  return Object.fromEntries(
    Object.entries(value).filter(
      ([, v]) => v !== null && v !== undefined && !(Array.isArray(v) && v.length === 0)
    )
  )
}

function reply(result: Record<string, unknown>): CallToolResult {
  if (typeof result.error === 'string') {
    return { isError: true, content: [{ type: 'text', text: result.error }] }
  }
  return { content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result }
}

const read = { readOnlyHint: true }

const pageInput = {
  limit: z.number().int().min(1).max(200).default(50).describe('Page size (default 50)'),
  cursor: z.string().optional().describe('nextCursor from the previous page'),
}
const bookId = id.describe('Book id from list_books')
const chapterId = id.describe('Chapter id from get_book')

function highlightItem(h: ReturnType<typeof listHighlights>['items'][number], withBook: boolean) {
  return compact({
    id: h.id,
    text: h.text,
    type: h.type,
    color: h.color,
    note: h.note,
    tags: h.tags,
    chapter: h.chapter,
    location: h.locStart,
    page: h.page,
    vocabId: h.vocabId,
    suggestedType: h.suggestedType,
    book: withBook ? h.bookTitle : undefined,
    bookId: withBook ? h.bookId : undefined,
  })
}

export function createMcpServer() {
  const server = new McpServer({ name: 'bookworm', version }, { instructions: INSTRUCTIONS })

  server.registerTool(
    'list_books',
    {
      description: 'List all books with highlight counts per type.',
      annotations: read,
    },
    () =>
      reply({
        books: listBooks().map((b) =>
          compact({
            id: b.id,
            title: b.title,
            author: b.author,
            language: b.language,
            counts: b.counts,
          })
        ),
      })
  )

  server.registerTool(
    'get_book',
    {
      description:
        'Summary of one book: counts per type, number of lore entries, and its chapters in reading order with per-chapter counts.',
      inputSchema: { book_id: bookId },
      annotations: read,
    },
    ({ book_id }) => {
      const book = getBook(book_id)
      if (!book) return reply({ error: 'Book not found' })
      return reply(
        compact({
          id: book.id,
          title: book.title,
          author: book.author,
          language: book.language,
          counts: book.counts,
          loreEntries: book.loreEntries,
          chapters: book.chapters.map((c) => ({ id: c.id, title: c.title, counts: c.counts })),
        })
      )
    }
  )

  server.registerTool(
    'search_highlights',
    {
      description:
        'Search highlights by text or note, optionally scoped to a book, chapter, type, tag, or created since a date. Results within a book come in reading order; otherwise newest first.',
      inputSchema: {
        query: z.string().optional().describe('Substring to match in the highlight text or note'),
        book_id: bookId.optional(),
        chapter_id: chapterId.optional(),
        type: highlightType.optional(),
        tag: z.string().optional(),
        since: z.iso
          .datetime({ offset: true })
          .optional()
          .describe('ISO date-time; only highlights imported since then'),
        ...pageInput,
      },
      annotations: read,
    },
    ({ query, book_id, chapter_id, type, tag, since, limit, cursor }) => {
      const result = listHighlights({
        q: query,
        bookId: book_id,
        chapterId: chapter_id,
        type,
        tag,
        since: since ? new Date(since) : undefined,
        limit,
        cursor,
      })
      return reply({
        items: result.items.map((h) => highlightItem(h, !book_id && !chapter_id)),
        nextCursor: result.nextCursor,
      })
    }
  )

  server.registerTool(
    'get_vocab',
    {
      description:
        'Vocabulary entries (yellow highlights), optionally scoped to a book or chapter, by learning status, or only those still missing a definition.',
      inputSchema: {
        book_id: bookId.optional(),
        chapter_id: chapterId.optional(),
        status: vocabStatus.optional(),
        missing_definition: z.boolean().optional().describe('Only entries without a definition'),
        ...pageInput,
      },
      annotations: read,
    },
    ({ book_id, chapter_id, status, missing_definition, limit, cursor }) => {
      const result = listVocab({
        bookId: book_id,
        chapterId: chapter_id,
        status,
        missingDefinition: missing_definition,
        limit,
        cursor,
      })
      return reply({
        items: result.items.map((v) =>
          compact({
            id: v.id,
            term: v.term,
            definition: v.definition,
            partOfSpeech: v.partOfSpeech,
            example: v.example,
            language: v.language,
            status: v.status,
            definitionBy: v.definitionBy,
            context: v.context.trim() === v.term ? undefined : v.context,
            note: v.note === v.definition ? undefined : v.note,
            chapter: v.chapter,
            book: book_id ? undefined : v.bookTitle,
          })
        ),
        nextCursor: result.nextCursor,
      })
    }
  )

  server.registerTool(
    'get_lore',
    {
      description:
        'The lore wiki of a book: entries (character, place, faction, event, concept, other) with their body and source highlights.',
      inputSchema: { book_id: bookId, kind: loreKind.optional() },
      annotations: read,
    },
    ({ book_id, kind }) =>
      reply({
        entries: listLore(book_id, kind).map((e) =>
          compact({
            id: e.id,
            name: e.name,
            kind: e.kind,
            body: e.body || undefined,
            highlights: e.highlights.map((h) =>
              compact({ id: h.id, text: h.text, chapter: h.chapter })
            ),
          })
        ),
      })
  )

  server.registerTool(
    'get_recent',
    {
      description: 'Highlights imported since a date, newest first, across all books.',
      inputSchema: {
        since: z.iso.datetime({ offset: true }).describe('ISO date-time'),
        type: highlightType.optional(),
        ...pageInput,
      },
      annotations: read,
    },
    ({ since, type, limit, cursor }) => {
      const result = listHighlights({ since: new Date(since), type, limit, cursor })
      return reply({
        items: result.items.map((h) => highlightItem(h, true)),
        nextCursor: result.nextCursor,
      })
    }
  )

  return server
}
