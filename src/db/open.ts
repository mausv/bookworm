import Database from 'better-sqlite3'
import { readMigrationFiles } from 'drizzle-orm/migrator'

// Mirrors drizzle's SQLite migrator, but checks and applies pending migrations inside one
// BEGIN IMMEDIATE transaction so concurrent processes (e.g. build workers) can't both apply them.
function migrate(sqlite: Database.Database, migrationsFolder: string) {
  const migrations = readMigrationFiles({ migrationsFolder })
  sqlite
    .transaction(() => {
      sqlite.exec(
        'CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at numeric)'
      )
      const last = sqlite
        .prepare<[], { created_at: number }>(
          'SELECT created_at FROM "__drizzle_migrations" ORDER BY created_at DESC LIMIT 1'
        )
        .get()
      const record = sqlite.prepare<[string, number]>(
        'INSERT INTO "__drizzle_migrations" ("hash", "created_at") VALUES (?, ?)'
      )
      for (const migration of migrations) {
        if (last && Number(last.created_at) >= migration.folderMillis) continue
        for (const statement of migration.sql) sqlite.exec(statement)
        record.run(migration.hash, migration.folderMillis)
      }
    })
    .immediate()
}

// Switching a fresh database to WAL takes an exclusive lock without consulting the busy
// handler, so concurrent first opens can fail with SQLITE_BUSY; retry until the timeout.
function enableWal(sqlite: Database.Database, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    try {
      sqlite.pragma('journal_mode = WAL')
      return
    } catch (error) {
      const busy = error instanceof Database.SqliteError && error.code === 'SQLITE_BUSY'
      if (!busy || Date.now() > deadline) throw error
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10)
    }
  }
}

export function openDatabase(file: string, migrationsFolder: string) {
  const sqlite = new Database(file, { timeout: 10_000 })
  enableWal(sqlite, 10_000)
  // Migrations rebuild tables; with foreign keys on, dropping the old table would cascade deletes.
  // The pragma is ignored inside a transaction, so it has to wrap the migration from outside.
  sqlite.pragma('foreign_keys = OFF')
  migrate(sqlite, migrationsFolder)
  sqlite.pragma('foreign_keys = ON')
  const violations = sqlite.pragma('foreign_key_check')
  if (Array.isArray(violations) && violations.length) {
    throw new Error(`Foreign key violations after migration: ${JSON.stringify(violations)}`)
  }
  return sqlite
}
