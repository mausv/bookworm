import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'
import { version } from '../../package.json'
import { getBook, listBooks } from '@/lib/books'
import { bookMarkdown } from '@/lib/export'
import {
  addNote,
  addTags,
  classifyHighlights,
  listHighlights,
  updateHighlight,
} from '@/lib/highlights'
import { addHighlight } from '@/lib/import'
import { listLore, upsertLore } from '@/lib/lore'
import { highlightType, id, loreKind, tags, vocabStatus } from '@/lib/validation'
import { listVocab, setVocabStatus, updateVocab } from '@/lib/vocab'

const INSTRUCTIONS = `Reading highlights from the user's books (Kindle, Readest), organized as book → chapter → highlight.
Highlight types follow the user's color convention:
- vocab (yellow): a word or phrase the user didn't know. Each has a vocab entry (term, definition, part of speech, example, status new|learning|known). The highlight text may include surrounding words; the term is the word itself.
- quote (orange): a phrase the user liked.
- lore (blue/aqua): book lore — world, characters, places, factions, events. Lore entries are a per-book wiki linked to the highlights they come from.
- unclassified: no color info (e.g. Kindle My Clippings.txt) or an unmapped color; the user triages these.
Notes on highlights are the user's own words (for vocab they are often the user's own definition).
Definitions marked "dictionary" come from Wiktionary's first sense and may not fit the context. Quotes can carry an explanation (add_explanations); get_book reports how many words lack a definition and quotes lack an explanation.
The user reads in English and Spanish. Vocab entries carry a translation into the other language (set_translations); definitions stay in the book's language.
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
const write = { readOnlyHint: false, destructiveHint: false }

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
    explanation: h.explanation,
    explanationBy: h.explanationBy,
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

export function createMcpServer(userId: string) {
  const server = new McpServer({ name: 'bookworm', version }, { instructions: INSTRUCTIONS })

  server.registerTool(
    'list_books',
    {
      description: 'List all books with highlight counts per type.',
      annotations: read,
    },
    () =>
      reply({
        books: listBooks(userId).map((b) =>
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
      const book = getBook(userId, book_id)
      if (!book) return reply({ error: 'Book not found' })
      return reply(
        compact({
          id: book.id,
          title: book.title,
          author: book.author,
          language: book.language,
          counts: book.counts,
          loreEntries: book.loreEntries,
          missing: book.missing,
          chapters: book.chapters.map((c) => ({ id: c.id, title: c.title, counts: c.counts })),
        })
      )
    }
  )

  server.registerTool(
    'search_highlights',
    {
      description:
        'Search highlights by text or note, optionally scoped to a book, chapter, type, tag, or created since a date, or only those without an explanation (use with type quote to find quotes to explain). Results within a book come in reading order; otherwise newest first.',
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
        missing_explanation: z
          .boolean()
          .optional()
          .describe('Only highlights without an explanation'),
        ...pageInput,
      },
      annotations: read,
    },
    ({ query, book_id, chapter_id, type, tag, since, missing_explanation, limit, cursor }) => {
      const result = listHighlights(userId, {
        q: query,
        bookId: book_id,
        chapterId: chapter_id,
        type,
        tag,
        since: since ? new Date(since) : undefined,
        missingExplanation: missing_explanation,
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
        'Vocabulary entries (yellow highlights), optionally scoped to a book or chapter, by learning status, or only those still missing a definition or a translation. Each entry has a translation into the other of English/Spanish (English books → Spanish, Spanish books → English); translationBy "dictionary" means it came from Wiktionary.',
      inputSchema: {
        book_id: bookId.optional(),
        chapter_id: chapterId.optional(),
        status: vocabStatus.optional(),
        missing_definition: z.boolean().optional().describe('Only entries without a definition'),
        missing_translation: z.boolean().optional().describe('Only entries without a translation'),
        ...pageInput,
      },
      annotations: read,
    },
    ({ book_id, chapter_id, status, missing_definition, missing_translation, limit, cursor }) => {
      const result = listVocab(userId, {
        bookId: book_id,
        chapterId: chapter_id,
        status,
        missingDefinition: missing_definition,
        missingTranslation: missing_translation,
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
            translation: v.translation,
            translationBy: v.translationBy,
            context: v.context.trim() === v.term ? undefined : v.context,
            seen: v.occurrences > 1 ? v.occurrences : undefined,
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
        entries: listLore(userId, book_id, kind).map((e) =>
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
      const result = listHighlights(userId, { since: new Date(since), type, limit, cursor })
      return reply({
        items: result.items.map((h) => highlightItem(h, true)),
        nextCursor: result.nextCursor,
      })
    }
  )

  server.registerTool(
    'add_definitions',
    {
      description:
        'Write definitions for many vocab entries at once (up to 100 per call; marked as added by Claude). Use the language the user reads the book in unless asked otherwise; keep each short and dictionary-style, for the sense used in the book. Highlights usually contain only the word itself (context is present only when the user highlighted more), so use the book, chapter and your knowledge of it to pick the sense. For multi-word phrases and idioms, write a short plain explanation of what it means there instead. Add two short example sentences of your own (not quotes from the book) showing how each word or phrase is used. Optionally trim a term down to the word itself and add the translation into the other of English/Spanish. Replace dictionary definitions (definitionBy "dictionary", the first Wiktionary sense) when they miss the sense in context. Work through get_vocab with missing_definition: true in pages of about 50, one call at a time.',
      inputSchema: {
        entries: z
          .array(
            z.object({
              vocab_id: id.describe('Vocab entry id from get_vocab'),
              definition: z.string().trim().min(1).max(2000),
              part_of_speech: z.string().trim().max(50).optional(),
              example: z
                .string()
                .trim()
                .max(2000)
                .optional()
                .describe(
                  'Two short example sentences of your own using the term in this sense, one per line'
                ),
              term: z
                .string()
                .trim()
                .min(1)
                .max(200)
                .optional()
                .describe('Corrected term, if the highlight included extra words'),
              translation: z
                .string()
                .trim()
                .min(1)
                .max(500)
                .optional()
                .describe(
                  'Translation into the other of English/Spanish, for the sense in context'
                ),
            })
          )
          .min(1)
          .max(100),
      },
      annotations: write,
    },
    ({ entries }) => {
      const results = entries.map((e) =>
        updateVocab(userId, e.vocab_id, {
          definition: e.definition,
          definitionBy: 'claude',
          ...(e.part_of_speech !== undefined && { partOfSpeech: e.part_of_speech }),
          ...(e.example !== undefined && { example: e.example }),
          ...(e.term !== undefined && { term: e.term }),
          ...(e.translation !== undefined && {
            translation: e.translation,
            translationBy: 'claude' as const,
          }),
        })
      )
      return reply({
        updated: results.filter((r) => 'vocab' in r).length,
        failed: entries.flatMap((e, i) => {
          const r = results[i]
          return 'error' in r && r.error ? [{ vocab_id: e.vocab_id, error: r.error }] : []
        }),
      })
    }
  )

  server.registerTool(
    'set_translations',
    {
      description:
        'Set translations for several vocab entries at once (marked as added by Claude). Translate English words into Spanish and Spanish words into English, choosing the sense used in the book; replace dictionary translations when they miss that sense.',
      inputSchema: {
        translations: z
          .array(z.object({ vocab_id: id, translation: z.string().trim().min(1).max(500) }))
          .min(1)
          .max(100),
      },
      annotations: write,
    },
    ({ translations }) => {
      const results = translations.map((t) =>
        updateVocab(userId, t.vocab_id, { translation: t.translation, translationBy: 'claude' })
      )
      return reply({
        updated: results.filter((r) => 'vocab' in r).length,
        notFound: translations.filter((_, i) => 'error' in results[i]).map((t) => t.vocab_id),
      })
    }
  )

  server.registerTool(
    'classify_highlight',
    {
      description:
        'Set the type of one or more highlights (vocab, quote, lore, unclassified). Classifying as vocab creates its vocab entry.',
      inputSchema: {
        highlight_ids: z.array(id).min(1).max(200),
        type: highlightType,
      },
      annotations: write,
    },
    ({ highlight_ids, type }) => reply(classifyHighlights(userId, highlight_ids, type))
  )

  server.registerTool(
    'add_highlight',
    {
      description:
        'Add a highlight by hand, e.g. a word the user read on paper. Give book_id for an existing book, or book_title (and author, language) to create or reuse one by title and author. Vocab highlights get or join the vocab entry for that word in the book; a note on a vocab highlight becomes its definition if it has none.',
      inputSchema: {
        book_id: bookId.optional(),
        book_title: z.string().trim().min(1).max(500).optional(),
        author: z.string().trim().max(500).optional(),
        language: z
          .string()
          .trim()
          .min(2)
          .max(20)
          .optional()
          .describe('Book language, e.g. en or es'),
        text: z.string().trim().min(1).max(20000),
        type: highlightType,
        chapter: z.string().trim().max(500).optional().describe('Chapter title; created if new'),
        page: z.string().trim().max(50).optional(),
        note: z.string().trim().max(5000).optional(),
      },
      annotations: write,
    },
    ({ book_id, book_title, author, language, text, type, chapter, page, note }) => {
      if (!book_id && !book_title) return reply({ error: 'Give book_id or book_title' })
      const result = addHighlight(userId, {
        bookId: book_id,
        book: book_id ? undefined : { title: book_title ?? '', author, language },
        text,
        type,
        chapter,
        page,
        note,
      })
      if (!('highlight' in result) || !result.highlight) return reply(result)
      return reply({ created: result.created, highlight: highlightItem(result.highlight, true) })
    }
  )

  server.registerTool(
    'add_explanations',
    {
      description:
        "Explain what highlights mean in the book's context, many at once (up to 100 per call) — mainly quotes (orange): one to three plain sentences each on the meaning, any idiom or reference, and why it matters there. Write in the book's language. Replaces existing explanations; doesn't touch the user's notes. Find quotes to explain with search_highlights (type quote, missing_explanation true).",
      inputSchema: {
        entries: z
          .array(z.object({ highlight_id: id, explanation: z.string().trim().min(1).max(5000) }))
          .min(1)
          .max(100),
      },
      annotations: write,
    },
    ({ entries }) => {
      const results = entries.map((e) =>
        updateHighlight(userId, e.highlight_id, {
          explanation: e.explanation,
          explanationBy: 'claude',
        })
      )
      return reply({
        updated: results.filter((r) => 'highlight' in r).length,
        notFound: entries.filter((_, i) => 'error' in results[i]).map((e) => e.highlight_id),
      })
    }
  )

  server.registerTool(
    'add_note',
    {
      description:
        "Append a note to a highlight, below any existing note. Notes are shown as the user's notes, so only add what the user asked for.",
      inputSchema: { highlight_id: id, note: z.string().trim().min(1).max(5000) },
      annotations: write,
    },
    ({ highlight_id, note }) => {
      const result = addNote(userId, highlight_id, note)
      if (!('highlight' in result) || !result.highlight) return reply(result)
      return reply({ highlight: highlightItem(result.highlight, true) })
    }
  )

  server.registerTool(
    'upsert_lore_entry',
    {
      description:
        'Create or update a lore wiki entry of a book, matched by name (case-insensitive). The body replaces the existing body when given; highlight_ids are added as source highlights (must belong to the book). Write bodies in Markdown and avoid spoilers beyond the highlights.',
      inputSchema: {
        book_id: bookId,
        name: z.string().trim().min(1).max(200),
        kind: loreKind,
        body: z.string().max(20000).optional(),
        highlight_ids: z.array(id).max(200).optional(),
      },
      annotations: write,
    },
    ({ book_id, name, kind, body, highlight_ids }) => {
      const result = upsertLore(userId, {
        bookId: book_id,
        name,
        kind,
        body,
        highlightIds: highlight_ids,
      })
      if ('error' in result) return reply(result)
      return reply({ created: result.created, lore: result.lore })
    }
  )

  server.registerTool(
    'add_tags',
    {
      description: 'Add tags to highlights (lowercased; existing tags are kept).',
      inputSchema: { highlight_ids: z.array(id).min(1).max(200), tags: tags.min(1) },
      annotations: write,
    },
    ({ highlight_ids, tags }) => reply(addTags(userId, highlight_ids, tags))
  )

  server.registerTool(
    'set_vocab_status',
    {
      description: 'Set the learning status of vocab entries: new, learning or known.',
      inputSchema: { vocab_ids: z.array(id).min(1).max(200), status: vocabStatus },
      annotations: write,
    },
    ({ vocab_ids, status }) => reply(setVocabStatus(userId, vocab_ids, status))
  )

  server.registerTool(
    'export_book_markdown',
    {
      description:
        'Export a book as an Obsidian-friendly Markdown note: frontmatter, vocabulary and quotes by chapter, lore entries as [[wikilinks]].',
      inputSchema: { book_id: bookId },
      annotations: read,
    },
    ({ book_id }) => {
      const exported = bookMarkdown(userId, book_id)
      if (!exported) return reply({ error: 'Book not found' })
      return { content: [{ type: 'text', text: exported.markdown }] }
    }
  )

  return server
}
