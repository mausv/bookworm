import { type HTMLElement, parse } from 'node-html-parser'
import { cleanTitle } from './text'
import type { Importer, ParsedHighlight } from './types'

const COLOR_CLASS = /\b(?:annotation|highlight)_([a-z]+)\b/

interface Entry {
  kind: 'highlight' | 'note'
  text: string
  color?: string
  chapter?: string
  page?: string
  loc?: number
}

// Old desktop exports emit <h2>/<h3> headings whose closing tags don't match; turning them into
// divs lets the parser keep each heading and its text as separate siblings.
function fixLegacyMarkup(html: string) {
  return html.replace(/<(\/?)h[23]\b/gi, '<$1div')
}

function textOf(el: HTMLElement) {
  return el.textContent.replace(/\s+/g, ' ').trim()
}

function parseHeading(heading: HTMLElement, section: string | undefined) {
  const text = textOf(heading)
  const dash = text.indexOf(' - ')
  const where = dash === -1 ? '' : text.slice(dash + 3)
  const arrow = where.lastIndexOf('>')
  const chapter = arrow === -1 ? section : where.slice(0, arrow).trim() || section
  const tokens = (arrow === -1 ? where : where.slice(arrow + 1)).split('·').map((t) => t.trim())
  const loc = tokens.at(-1)?.match(/(\d+)\s*$/)?.[1]
  const page = tokens.length > 1 ? tokens[0].split(/\s+/).at(-1) : undefined
  return { chapter, page, loc: loc === undefined ? undefined : Number(loc) }
}

function closestHighlight(entries: Entry[], index: number) {
  const loc = entries[index].loc
  const prev = entries.slice(0, index).findLast((e) => e.kind === 'highlight')
  const next = entries.slice(index + 1).find((e) => e.kind === 'highlight')
  if (loc === undefined) return prev ?? next
  if (prev?.loc === loc) return prev
  if (next?.loc === loc) return next
  const distance = (e?: Entry) => (e?.loc === undefined ? Infinity : Math.abs(e.loc - loc))
  return distance(next) < distance(prev) ? next : (prev ?? next)
}

function toHighlight(entry: Entry, note?: string): ParsedHighlight {
  return {
    text: entry.text,
    color: entry.color,
    chapter: entry.chapter,
    page: entry.page,
    locStart: entry.loc,
    locEnd: entry.loc,
    note,
  }
}

export const kindleHtml: Importer = {
  source: 'kindle-html',

  detect(content) {
    return /class=["'](?:bookTitle|noteHeading)["']/.test(content)
  },

  parse(content) {
    const root = parse(fixLegacyMarkup(content))
    const author = root.querySelector('.authors')
    const authorText = author ? textOf(author) : undefined
    const title = cleanTitle(textOf(root.querySelector('.bookTitle') ?? root), authorText)

    const entries: Entry[] = []
    let section: string | undefined
    let current: (Entry & { parts: string[] }) | undefined
    const flush = () => {
      if (!current) return
      const { parts, ...entry } = current
      entry.text = parts.join('\n').trim()
      if (entry.kind === 'highlight' || entry.text) entries.push(entry)
      current = undefined
    }

    for (const el of root.querySelectorAll('.sectionHeading, .noteHeading, .noteText')) {
      if (el.classList.contains('sectionHeading')) {
        flush()
        section = textOf(el)
      } else if (el.classList.contains('noteHeading')) {
        flush()
        const span = el.querySelector('span')
        const color = span?.getAttribute('class')?.match(COLOR_CLASS)?.[1]
        current = {
          kind: color ? 'highlight' : 'note',
          text: '',
          color,
          parts: [],
          ...parseHeading(el, section),
        }
      } else if (current) {
        current.parts.push(textOf(el))
      }
    }
    flush()

    const notes = new Map<Entry, string[]>()
    const standalone: Entry[] = []
    entries.forEach((entry, index) => {
      if (entry.kind !== 'note') return
      const target = closestHighlight(entries, index)
      if (!target) return standalone.push(entry)
      notes.set(target, [...(notes.get(target) ?? []), entry.text])
    })

    const highlights = entries
      .filter((e) => (e.kind === 'highlight' && e.text) || standalone.includes(e))
      .map((e) => toHighlight(e, notes.get(e)?.join('\n')))

    return [{ title, author: authorText || undefined, highlights }]
  },
}
