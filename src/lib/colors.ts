import { and, eq, isNotNull } from 'drizzle-orm'
import { db } from '@/db'
import { book, colorMapping, highlight } from '@/db/schema'
import type { HighlightType, Source } from '@/shared/types'

export type ColorMap = Record<string, HighlightType>

export const DEFAULT_COLOR_MAP: Record<Source, ColorMap> = {
  'kindle-html': { yellow: 'vocab', orange: 'quote', aqua: 'lore', blue: 'lore' },
  clippings: {},
  readest: { yellow: 'vocab', red: 'quote', '#ff8800': 'quote', blue: 'lore' },
}

export function getColorMap(userId: string, source: Source): ColorMap {
  const overrides = db
    .select()
    .from(colorMapping)
    .where(and(eq(colorMapping.userId, userId), eq(colorMapping.source, source)))
    .all()
  return {
    ...DEFAULT_COLOR_MAP[source],
    ...Object.fromEntries(overrides.map((o) => [o.color, o.type])),
  }
}

export function typeForColor(map: ColorMap, color: string | undefined): HighlightType {
  return (color && map[color.toLowerCase()]) || 'unclassified'
}

export function setColorMapping(
  userId: string,
  source: Source,
  color: string,
  type: HighlightType
) {
  db.insert(colorMapping)
    .values({ userId, source, color: color.toLowerCase(), type })
    .onConflictDoUpdate({
      target: [colorMapping.userId, colorMapping.source, colorMapping.color],
      set: { type },
    })
    .run()
}

export function resetColorMapping(userId: string, source: Source, color: string) {
  db.delete(colorMapping)
    .where(
      and(
        eq(colorMapping.userId, userId),
        eq(colorMapping.source, source),
        eq(colorMapping.color, color.toLowerCase())
      )
    )
    .run()
}

export function listColorMappings(userId: string, source: Source) {
  const map = getColorMap(userId, source)
  const seen = db
    .selectDistinct({ color: highlight.color })
    .from(highlight)
    .innerJoin(book, eq(book.id, highlight.bookId))
    .where(and(eq(book.userId, userId), eq(highlight.source, source), isNotNull(highlight.color)))
    .all()
    .map((r) => r.color ?? '')
  const colors = [...new Set([...Object.keys(map), ...seen])].sort()
  return colors.map((color) => ({
    color,
    type: typeForColor(map, color),
    isDefault: DEFAULT_COLOR_MAP[source][color] === map[color],
  }))
}
