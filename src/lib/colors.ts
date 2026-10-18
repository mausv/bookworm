import { and, eq, isNotNull } from 'drizzle-orm'
import { db } from '@/db'
import { colorMapping, highlight } from '@/db/schema'
import type { HighlightType, Source } from '@/shared/types'

export type ColorMap = Record<string, HighlightType>

export const DEFAULT_COLOR_MAP: Record<Source, ColorMap> = {
  'kindle-html': { yellow: 'vocab', orange: 'quote', aqua: 'lore', blue: 'lore' },
  clippings: {},
  readest: { yellow: 'vocab', red: 'quote', '#ff8800': 'quote', blue: 'lore' },
}

export function getColorMap(source: Source): ColorMap {
  const overrides = db.select().from(colorMapping).where(eq(colorMapping.source, source)).all()
  return {
    ...DEFAULT_COLOR_MAP[source],
    ...Object.fromEntries(overrides.map((o) => [o.color, o.type])),
  }
}

export function typeForColor(map: ColorMap, color: string | undefined): HighlightType {
  return (color && map[color.toLowerCase()]) || 'unclassified'
}

export function setColorMapping(source: Source, color: string, type: HighlightType) {
  db.insert(colorMapping)
    .values({ source, color: color.toLowerCase(), type })
    .onConflictDoUpdate({ target: [colorMapping.source, colorMapping.color], set: { type } })
    .run()
}

export function resetColorMapping(source: Source, color: string) {
  db.delete(colorMapping)
    .where(and(eq(colorMapping.source, source), eq(colorMapping.color, color.toLowerCase())))
    .run()
}

export function listColorMappings(source: Source) {
  const map = getColorMap(source)
  const seen = db
    .selectDistinct({ color: highlight.color })
    .from(highlight)
    .where(and(eq(highlight.source, source), isNotNull(highlight.color)))
    .all()
    .map((r) => r.color ?? '')
  const colors = [...new Set([...Object.keys(map), ...seen])].sort()
  return colors.map((color) => ({
    color,
    type: typeForColor(map, color),
    isDefault: DEFAULT_COLOR_MAP[source][color] === map[color],
  }))
}
