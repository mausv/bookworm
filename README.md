# Bookworm

Self-hosted hub for reading highlights. Import from the Kindle app and Kindle devices, sort highlights by your color convention, learn vocabulary, keep a lore wiki per book, and let Claude read and write it all over MCP. Hono, React, SQLite (Drizzle) and Better Auth.

| Color        | Type           | Meaning                       |
| ------------ | -------------- | ----------------------------- |
| Yellow       | `vocab`        | Word or phrase you don't know |
| Orange       | `quote`        | Phrase you like               |
| Blue / aqua  | `lore`         | World, characters, plot       |
| none / other | `unclassified` | Needs triage                  |

- Books → chapters → highlights. Chapters come from the export when it has them (Kindle notebook HTML does).
- Vocab highlights get a vocab entry (term, definition, part of speech, example, status new/learning/known). A note on a vocab highlight becomes its definition.
- Color → type mapping is per source and per user (Settings → Colors).
- Review: flashcards and a quiz (multiple choice or typed, scoped to all books, a book or a chapter). Three correct answers in a row mark a word known.
- Exports: Obsidian Markdown per book, Anki TSV, full JSON dump.
- Each account has its own private library. Sign-up needs `INVITE_CODE`.
- Missing definitions are looked up in Wiktionary (English and Spanish, free, no key) after each import or with "Look up in Wiktionary"; Spanish entries also give an English translation. Vocab entries carry an English↔Spanish translation and quotes an explanation, which your Claude fills over MCP (`add_definitions`, `set_translations`, `add_explanations`) or you type. Each book shows what's missing and copies a ready-made prompt for Claude. Every word has Google links for its meaning and example sentences.

## Importing

| Source                         | How to get the file                                                              | Color                                                 |
| ------------------------------ | -------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Kindle app (Android, iOS, Mac) | Notebook → Share/Export notebook → HTML (works for Send-to-Kindle documents too) | yes                                                   |
| Kindle device                  | `documents/My Clippings.txt` over USB                                            | no, triage in the app                                 |
| Readest                        | Annotations → Export → JSON                                                      | yes (no orange: red maps to quote, remap in Settings) |

Drop files on Import in the app, or script it with an API key (Settings → Connect Claude → API keys):

```sh
curl -H "Authorization: Bearer $BOOKWORM_KEY" --data-binary @"My Clippings.txt" https://bookworm.example.com/api/import
```

Or drop files into `inbox/<your account email>/` in the data volume, e.g. with Syncthing. They are imported within seconds and moved to `imported/` (or `failed/` if the format isn't recognized). Dotfiles are ignored, so Syncthing's temporary files are skipped.

Re-importing is idempotent. Highlights are matched on book, normalized text and location, so importing the same highlight from both the notebook HTML and My Clippings.txt merges them and fills in the color, chapter and note. My Clippings.txt is append-only; extended highlights replace their earlier versions. Its metadata is parsed in English, Spanish, German, French, Italian, Portuguese, Dutch, Russian, Japanese and Chinese.

## Connect Claude (MCP)

The MCP server is at `/mcp` (Streamable HTTP, stateless). The app is its own OAuth 2.1 authorization server with dynamic client registration and refresh tokens.

- Claude.ai / Claude Desktop: Settings → Connectors → Add custom connector, URL `https://bookworm.example.com/mcp`, then sign in and approve. Claude.ai connects from Anthropic's servers, so the app must be on public HTTPS and `BETTER_AUTH_URL` must be that exact URL.
- Claude Code with OAuth: `claude mcp add --transport http bookworm https://bookworm.example.com/mcp`, then `/mcp` to sign in.
- Claude Code with an API key: `claude mcp add --transport http bookworm https://bookworm.example.com/mcp --header "Authorization: Bearer bkw_..."`

Settings lists connected apps; revoking one cuts off its tokens immediately.

Tools (list tools return `{ items, nextCursor }`):

- Read: `list_books`, `get_book`, `search_highlights`, `get_vocab`, `get_lore`, `get_recent`
- Write: `add_highlight`, `add_definitions`, `set_translations`, `add_explanations`, `classify_highlight`, `add_note`, `upsert_lore_entry`, `add_tags`, `set_vocab_status`
- Export: `export_book_markdown`

Try: "Define every vocab word in chapter 8 of Mistborn that's missing a definition" or "Build lore entries for the main characters from my blue highlights".

## Development

```sh
pnpm install
cp .env.example .env   # BETTER_AUTH_SECRET=$(openssl rand -base64 32), pick an INVITE_CODE
pnpm dev               # API on :3000, web on :5173
```

`pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`. After changing `src/db/schema.ts`, run `pnpm db:generate`.

## Deployment

One image, no external services. Migrations run on startup.

| Env var              | Required    | Notes                                                                        |
| -------------------- | ----------- | ---------------------------------------------------------------------------- |
| `BETTER_AUTH_SECRET` | yes         | `openssl rand -base64 32`                                                    |
| `BETTER_AUTH_URL`    | yes         | Public URL, no trailing slash, e.g. `https://bookworm.example.com`           |
| `INVITE_CODE`        | for sign-up | Unset means nobody can sign up                                               |
| `AUTO_DEFINE`        | no          | `true` in the image: look up missing definitions in Wiktionary after imports |
| `PORT`               | no          | Default `3000`                                                               |
| `DATA_DIR`           | no          | Default `/data` in the image                                                 |

| Volume  | Contents                                                  |
| ------- | --------------------------------------------------------- |
| `/data` | `bookworm.db` (SQLite, WAL) and `inbox/<email>/` per user |

The container runs as uid 1000 (`node`); a bind-mounted `/data` must be writable by it. Health check: `GET /healthz`. Port `3000`.

Coolify: create an application from this repo with the Dockerfile build pack, port 3000, a volume mount on `/data`, and the env vars above. Coolify's proxy handles the domain and TLS. `compose.yaml` runs the same image elsewhere: `docker compose up -d --build` with the env vars in `.env`.

## Backup

SQLite in WAL mode, so copy it with the backup API rather than `cp`:

```sh
sqlite3 /path/to/data/bookworm.db ".backup '/backups/bookworm-$(date +%F).db'"
```

Run it from cron on the host, e.g. `0 3 * * * sqlite3 /home/me/data/bookworm/bookworm.db ".backup '/backups/bookworm-$(date +\%F).db'"`. For continuous off-site replication, run [Litestream](https://litestream.io) against `bookworm.db`. Settings → Export also downloads a JSON dump of your library.
