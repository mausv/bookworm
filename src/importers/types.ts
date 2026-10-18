import type { Source } from '@/shared/types'

export interface ParsedHighlight {
  text: string
  color?: string
  chapter?: string
  locStart?: number
  locEnd?: number
  page?: string
  cfi?: string
  note?: string
  createdAt?: Date
}

export interface ParsedBook {
  title: string
  author?: string
  highlights: ParsedHighlight[]
}

export interface Importer {
  source: Source
  detect(content: string): boolean
  parse(content: string): ParsedBook[]
}
