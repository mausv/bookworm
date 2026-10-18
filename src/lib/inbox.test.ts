import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { setupTestDb } from '@/test/db'

const { dataDir, insertUser } = await setupTestDb()
const { processInbox } = await import('./inbox')
const { listBooks } = await import('./books')

const reader = insertUser()
const other = insertUser()
const inbox = path.join(dataDir, 'inbox', reader.email)
const fixture = (name: string) =>
  fs.readFileSync(new URL(`../importers/fixtures/${name}`, import.meta.url))

describe('processInbox', () => {
  it("creates a folder per user and imports into that user's library", () => {
    processInbox()
    fs.writeFileSync(path.join(inbox, 'Mistborn - Notebook.html'), fixture('kindle-notebook.html'))
    fs.writeFileSync(path.join(inbox, '.syncthing.partial.tmp'), 'partial')
    expect(processInbox()).toEqual([{ email: reader.email, file: 'Mistborn - Notebook.html' }])
    expect(listBooks(reader.id).map((b) => b.title)).toEqual(['Mistborn'])
    expect(listBooks(other.id)).toEqual([])
    expect(fs.existsSync(path.join(dataDir, 'inbox', other.email))).toBe(true)
  })

  it('moves imported files out of the way and skips dotfiles', () => {
    expect(fs.readdirSync(inbox).sort()).toEqual(['.syncthing.partial.tmp', 'imported'])
    expect(fs.readdirSync(path.join(inbox, 'imported'))[0]).toMatch(/-Mistborn - Notebook\.html$/)
  })

  it('moves unrecognized files to failed', () => {
    fs.writeFileSync(path.join(inbox, 'notes.txt'), 'nothing to see')
    expect(processInbox()).toEqual([
      { email: reader.email, file: 'notes.txt', error: 'Unrecognized file format' },
    ])
    expect(fs.readdirSync(path.join(inbox, 'failed'))).toHaveLength(1)
  })
})

describe('watchInbox', () => {
  it('imports files dropped while running', async () => {
    const { watchInbox } = await import('./inbox')
    const watcher = watchInbox(20)
    try {
      fs.writeFileSync(path.join(inbox, 'My Clippings.txt'), fixture('clippings-edge.txt'))
      await vi.waitFor(
        () => expect(fs.existsSync(path.join(inbox, 'My Clippings.txt'))).toBe(false),
        {
          timeout: 3000,
        }
      )
      expect(listBooks(reader.id).map((b) => b.title)).toContain('Notes to self')
    } finally {
      watcher.close()
    }
  })
})
