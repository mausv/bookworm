export interface PageInput {
  limit?: number
  cursor?: string | null
}

export function page<T>(
  { limit = 50, cursor }: PageInput,
  fetch: (limit: number, offset: number) => T[]
) {
  const offset = cursor ? Number(cursor) || 0 : 0
  const rows = fetch(limit + 1, offset)
  return {
    items: rows.slice(0, limit),
    nextCursor: rows.length > limit ? String(offset + limit) : null,
  }
}
