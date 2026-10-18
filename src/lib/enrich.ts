import { defineMissing } from './dictionary'

export function autoDefineEnabled() {
  return process.env.AUTO_DEFINE === 'true'
}

export function enrichInBackground(userId: string, bookIds: string[]) {
  if (!bookIds.length || !autoDefineEnabled()) return
  defineMissing(userId, bookIds).catch((error: unknown) => {
    console.error(`dictionary lookup failed: ${error instanceof Error ? error.message : error}`)
  })
}
