import { defineMissing } from './dictionary'
import { autoTranslateEnabled, translateMissing } from './translate'

export function autoDefineEnabled() {
  return process.env.AUTO_DEFINE === 'true'
}

async function enrich(userId: string, bookIds: string[]) {
  if (autoDefineEnabled()) await defineMissing(userId, bookIds)
  if (autoTranslateEnabled()) await translateMissing(userId, bookIds)
}

// Dictionary definitions first: Spanish entries can supply the translation DeepL would draft.
export function enrichInBackground(userId: string, bookIds: string[]) {
  if (!bookIds.length) return
  enrich(userId, bookIds).catch((error: unknown) => {
    console.error(`enrich failed: ${error instanceof Error ? error.message : error}`)
  })
}
