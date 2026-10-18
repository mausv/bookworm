import fs from 'node:fs'
import path from 'node:path'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { openDatabase } from './open'
import * as schema from './schema'

export const dataDir = path.resolve(process.env.DATA_DIR ?? 'data')
export const inboxDir = path.join(dataDir, 'inbox')
export const migrationsFolder = path.join(process.cwd(), 'src/db/migrations')

fs.mkdirSync(inboxDir, { recursive: true })

export const sqlite = openDatabase(path.join(dataDir, 'bookworm.db'), migrationsFolder)
export const db = drizzle({ client: sqlite, schema })
