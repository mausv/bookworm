import type { QueryClient } from '@tanstack/react-query'

const READING_KEYS = ['books', 'book', 'highlights', 'tags', 'vocab', 'lore', 'triage']

export function invalidateReading(queryClient: QueryClient) {
  return Promise.all(READING_KEYS.map((key) => queryClient.invalidateQueries({ queryKey: [key] })))
}
