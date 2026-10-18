import { useInfiniteQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import type { HighlightType } from '@/shared/types'
import { api } from '@/web/lib/api'
import { groupByChapter } from '@/web/lib/highlights'
import type { Highlight, Page } from '@/web/lib/types'
import { withQuery } from '@/web/lib/url'
import { HighlightItem } from './highlight-item'

export interface HighlightFilter {
  bookId: string
  type: HighlightType
  chapterId?: string
  q?: string
  tag?: string
}

export function HighlightList({ filter, grouped }: { filter: HighlightFilter; grouped: boolean }) {
  const query = useInfiniteQuery({
    queryKey: ['highlights', filter],
    queryFn: ({ pageParam }) =>
      api<Page<Highlight>>(withQuery('/highlights', { ...filter, cursor: pageParam })),
    initialPageParam: '',
    getNextPageParam: (last) => last.nextCursor,
  })

  if (query.isPending) return null
  if (query.error) return <p className="text-destructive">{query.error.message}</p>

  const items = query.data.pages.flatMap((p) => p.items)
  if (!items.length) {
    return (
      <p className="py-10 text-center text-muted-foreground">
        {filter.q || filter.tag ? 'Nothing matches this filter.' : 'Nothing here yet.'}
      </p>
    )
  }

  return (
    <div className="space-y-10">
      {grouped ? (
        groupByChapter(items).map((group, i) => (
          <section key={`${group.chapterId}-${i}`} className="space-y-6">
            <h2 className="text-lg text-muted-foreground italic">
              {group.chapter ?? 'No chapter'}
            </h2>
            <ItemStack items={group.items} />
          </section>
        ))
      ) : (
        <ItemStack items={items} />
      )}
      {query.hasNextPage && (
        <div className="flex justify-center">
          <Button
            variant="outline"
            disabled={query.isFetchingNextPage}
            onClick={() => query.fetchNextPage()}
          >
            {query.isFetchingNextPage ? 'Loading…' : 'Load more'}
          </Button>
        </div>
      )}
    </div>
  )
}

function ItemStack({ items }: { items: Highlight[] }) {
  return (
    <ol className="space-y-7">
      {items.map((h) => (
        <li key={h.id}>
          <HighlightItem highlight={h} />
        </li>
      ))}
    </ol>
  )
}
