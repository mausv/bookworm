import fs from 'node:fs'
import path from 'node:path'
import { db, inboxDir } from '@/db'
import { user } from '@/db/schema'
import { importContent } from './import'

const DONE = 'imported'
const FAILED = 'failed'

export function ensureInbox(email: string) {
  fs.mkdirSync(path.join(inboxDir, email), { recursive: true })
}

function move(file: string, folder: string) {
  const target = path.join(path.dirname(file), folder)
  fs.mkdirSync(target, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  fs.renameSync(file, path.join(target, `${stamp}-${path.basename(file)}`))
}

export function processInbox(settledMs = 0) {
  const results: { email: string; file: string; error?: string }[] = []
  for (const { id, email } of db.select({ id: user.id, email: user.email }).from(user).all()) {
    ensureInbox(email)
    const dir = path.join(inboxDir, email)
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isFile() || entry.name.startsWith('.')) continue
      const file = path.join(dir, entry.name)
      if (settledMs && Date.now() - fs.statSync(file).mtimeMs < settledMs) continue
      const result = importContent(id, fs.readFileSync(file, 'utf8'))
      const error = 'error' in result ? result.error : undefined
      move(file, error ? FAILED : DONE)
      results.push({ email, file: entry.name, error })
    }
  }
  return results
}

// Syncthing and the Android share sheet write files in pieces, so only files untouched for
// delayMs are imported. File events can be dropped (bind mounts, busy hosts), so a periodic
// sweep picks up anything the watcher missed.
export function watchInbox(delayMs = 2000, sweepMs = 60_000) {
  let timer: NodeJS.Timeout | undefined
  const run = () => {
    for (const r of processInbox(delayMs)) {
      console.log(`inbox: ${r.email}/${r.file} ${r.error ? `failed: ${r.error}` : 'imported'}`)
    }
  }
  run()
  const sweep = setInterval(run, sweepMs)
  const watcher = fs.watch(inboxDir, { recursive: true }, (_, name) => {
    const parts = name?.split(path.sep) ?? []
    if (parts.length !== 2 || parts[1].startsWith('.')) return
    clearTimeout(timer)
    timer = setTimeout(run, delayMs)
  })
  return {
    close() {
      clearInterval(sweep)
      clearTimeout(timer)
      watcher.close()
    },
  }
}
