import type { Translate } from './i18n'

interface Located {
  chapterId: string | null
  chapter: string | null
}

export function groupByChapter<T extends Located>(items: T[]) {
  const groups: { chapterId: string | null; chapter: string | null; items: T[] }[] = []
  for (const item of items) {
    const last = groups.at(-1)
    if (last && last.chapterId === item.chapterId) last.items.push(item)
    else groups.push({ chapterId: item.chapterId, chapter: item.chapter, items: [item] })
  }
  return groups
}

export function locationLabel(
  { locStart, page }: { locStart: number | null; page: string | null },
  t: Translate
) {
  if (page) return t('location.page', { page })
  if (locStart !== null) return t('location.loc', { loc: locStart })
  return null
}

export function parseTags(input: string) {
  return [
    ...new Set(
      input
        .split(',')
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean)
    ),
  ]
}
