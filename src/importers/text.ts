import type { HighlightType } from '@/shared/types'

const EDGE_PUNCTUATION = /^[\s\p{P}\p{S}]+|[\s\p{P}\p{S}]+$/gu

export function normalizeText(text: string) {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”«»]/g, '"')
    .replace(/\s+/g, ' ')
    .replace(EDGE_PUNCTUATION, '')
}

export function vocabTerm(text: string) {
  return text.trim().replace(EDGE_PUNCTUATION, '')
}

export function wordCount(text: string) {
  return vocabTerm(text).split(/\s+/).filter(Boolean).length
}

export function suggestType(text: string): HighlightType | null {
  const words = wordCount(text)
  if (words === 0) return null
  if (words <= 2) return 'vocab'
  if (words >= 6) return 'quote'
  return null
}

export function cleanTitle(title: string, author?: string) {
  let cleaned = title.trim()
  for (;;) {
    const match = cleaned.match(/^(.*\S)\s*\(([^()]*)\)$/)
    if (!match) break
    const group = match[2].trim().toLowerCase()
    const isNoise = group === 'z-library' || (author && group === author.trim().toLowerCase())
    if (!isNoise) break
    cleaned = match[1]
  }
  return cleaned
}
