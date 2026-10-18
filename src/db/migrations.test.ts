import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { openDatabase } from './open'

const migrations = path.join(import.meta.dirname, 'migrations')
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bookworm-migrations-'))
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }))

// Recreates a database as it was before vocab entries became per-book, with repeated words.
function databaseAtInitialSchema() {
  const initial = path.join(dir, 'initial')
  fs.mkdirSync(path.join(initial, 'meta'), { recursive: true })
  fs.copyFileSync(path.join(migrations, '0000_init.sql'), path.join(initial, '0000_init.sql'))
  const journal = JSON.parse(fs.readFileSync(path.join(migrations, 'meta/_journal.json'), 'utf8'))
  journal.entries = journal.entries.slice(0, 1)
  fs.writeFileSync(path.join(initial, 'meta/_journal.json'), JSON.stringify(journal))

  const file = path.join(dir, 'bookworm.db')
  const db = openDatabase(file, initial)
  db.exec(`
    insert into user (id, name, email) values ('u1', 'Ana', 'ana@example.com');
    insert into book (id, user_id, title, match_key) values ('b1', 'u1', 'Mistborn', 'm'), ('b2', 'u1', 'Elantris', 'e');
    insert into highlight (id, book_id, text, dedup_key, type, source, created_at) values
      ('h1', 'b1', 'ruddy', 'k1', 'vocab', 'kindle-html', 1),
      ('h2', 'b1', 'Ruddy', 'k2', 'vocab', 'kindle-html', 2),
      ('h3', 'b1', 'soot', 'k3', 'vocab', 'kindle-html', 3),
      ('h4', 'b2', 'ruddy', 'k4', 'vocab', 'kindle-html', 4);
    insert into vocab_entry (id, highlight_id, term, definition, created_at) values
      ('v1', 'h1', 'ruddy', null, 1),
      ('v2', 'h2', 'Ruddy', 'reddish', 2),
      ('v3', 'h3', 'soot', null, 3),
      ('v4', 'h4', 'ruddy', null, 4);
    insert into quiz_attempt (id, vocab_id, mode, correct) values ('q1', 'v1', 'typed', 1), ('q2', 'v3', 'typed', 0);
  `)
  db.close()
  return file
}

describe('per-book vocab migration', () => {
  const db = openDatabase(databaseAtInitialSchema(), migrations)

  it('merges repeated words within a book, keeping the defined entry', () => {
    expect(
      db.prepare('select id, book_id, term_key, definition from vocab_entry order by id').all()
    ).toEqual([
      { id: 'v2', book_id: 'b1', term_key: 'ruddy', definition: 'reddish' },
      { id: 'v3', book_id: 'b1', term_key: 'soot', definition: null },
      { id: 'v4', book_id: 'b2', term_key: 'ruddy', definition: null },
    ])
  })

  it('links every highlight to its entry', () => {
    expect(db.prepare('select id, vocab_id from highlight order by id').all()).toEqual([
      { id: 'h1', vocab_id: 'v2' },
      { id: 'h2', vocab_id: 'v2' },
      { id: 'h3', vocab_id: 'v3' },
      { id: 'h4', vocab_id: 'v4' },
    ])
  })

  it('keeps quiz history, moved to the merged entry', () => {
    expect(db.prepare('select id, vocab_id from quiz_attempt order by id').all()).toEqual([
      { id: 'q1', vocab_id: 'v2' },
      { id: 'q2', vocab_id: 'v3' },
    ])
  })

  it('drops the old highlight column', () => {
    const columns = db.prepare("select name from pragma_table_info('vocab_entry')").all()
    expect(columns).not.toContainEqual({ name: 'highlight_id' })
  })
})
