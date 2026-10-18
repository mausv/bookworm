import type { VocabStatus } from '@/shared/types'

export type CardGrade = 'again' | 'good' | 'known'

export function nextStatus(grade: CardGrade, current: VocabStatus): VocabStatus {
  if (grade === 'known') return 'known'
  if (grade === 'again') return 'learning'
  return current === 'new' ? 'learning' : current
}

export function splitTerm(text: string, term: string) {
  const index = term ? text.toLowerCase().indexOf(term.toLowerCase()) : -1
  if (index < 0) return [text]
  return [
    text.slice(0, index),
    text.slice(index, index + term.length),
    text.slice(index + term.length),
  ]
}
