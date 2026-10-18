import type { HighlightType } from '@/shared/types'

export type TriageAction =
  | { kind: 'classify'; type: Exclude<HighlightType, 'unclassified'> }
  | { kind: 'skip' }
  | { kind: 'undo' }

const KEYS: Record<string, TriageAction> = {
  '1': { kind: 'classify', type: 'vocab' },
  v: { kind: 'classify', type: 'vocab' },
  '2': { kind: 'classify', type: 'quote' },
  q: { kind: 'classify', type: 'quote' },
  '3': { kind: 'classify', type: 'lore' },
  l: { kind: 'classify', type: 'lore' },
  s: { kind: 'skip' },
  ArrowRight: { kind: 'skip' },
  u: { kind: 'undo' },
  Backspace: { kind: 'undo' },
}

export function triageKey(key: string): TriageAction | null {
  return KEYS[key.length === 1 ? key.toLowerCase() : key] ?? null
}

export const SWIPE_THRESHOLD = 80

export function swipeAction(dx: number, dy: number, suggested: HighlightType | null) {
  if (Math.abs(dx) < SWIPE_THRESHOLD || Math.abs(dy) > Math.abs(dx)) return null
  if (dx < 0) return 'skip'
  return suggested && suggested !== 'unclassified' ? 'accept' : null
}
