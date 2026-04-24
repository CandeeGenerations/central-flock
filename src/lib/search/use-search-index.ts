import {buildAllActions} from '@/lib/search/actions'
import {providers} from '@/lib/search/providers'
import type {SearchItem} from '@/lib/search/registry'
import {useTheme} from '@/lib/theme-context'
import {useQueries} from '@tanstack/react-query'
import {useMemo} from 'react'

const DEFAULT_STALE_TIME = 5 * 60 * 1000

export interface SearchIndex {
  items: SearchItem[]
  itemsByGroup: Map<string, SearchItem[]>
  isLoading: boolean
  isFetching: boolean
}

export function useSearchIndex(enabled: boolean): SearchIndex {
  const {toggleDark} = useTheme()

  // IMPORTANT: the queryFn stores the **raw rows** under the provider's queryKey so
  // the cache can be safely shared with other consumers (e.g. the notes sidebar reads
  // the same `['notesTree']` key). Transforming to SearchItem[] here would pollute the
  // cache with component references (icon: Folder/FileText) that cause
  // "Objects are not valid as a React child" when the raw consumer tries to render them.
  const results = useQueries({
    queries: providers.map((p) => ({
      queryKey: p.queryKey,
      queryFn: p.fetch,
      staleTime: p.staleTime ?? DEFAULT_STALE_TIME,
      enabled,
    })),
  })

  const actions = useMemo(() => buildAllActions({toggleDark}), [toggleDark])

  const {items, itemsByGroup} = useMemo(() => {
    const byGroup = new Map<string, SearchItem[]>()
    const all: SearchItem[] = []

    function push(item: SearchItem) {
      all.push(item)
      const bucket = byGroup.get(item.group) ?? []
      bucket.push(item)
      byGroup.set(item.group, bucket)
    }

    for (const a of actions) push(a)
    for (let i = 0; i < providers.length; i++) {
      const rows = results[i]?.data
      if (!rows) continue
      // Transform raw rows → SearchItem[] in render. Memoized so this only
      // runs when a provider's data actually changes.
      const searchItems = providers[i].toItems(rows as never)
      for (const item of searchItems) push(item)
    }

    return {items: all, itemsByGroup: byGroup}
  }, [actions, results])

  return {
    items,
    itemsByGroup,
    isLoading: results.some((r) => r.isLoading && r.fetchStatus !== 'idle'),
    isFetching: results.some((r) => r.isFetching),
  }
}
