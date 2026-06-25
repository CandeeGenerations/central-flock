import {buildAllActions} from '@/lib/search/actions'
import {providers} from '@/lib/search/providers'
import type {SearchItem} from '@/lib/search/registry'
import {useTheme} from '@/lib/theme-context'
import {fetchSectionScores} from '@/lib/usage-api'
import {useQueries, useQuery} from '@tanstack/react-query'
import {useMemo, useState} from 'react'

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
  // the cache can be safely shared with other consumers that read the same key.
  // Transforming to SearchItem[] here would pollute the cache with component references
  // (icon: Folder/FileText) that cause "Objects are not valid as a React child" when
  // the raw consumer tries to render them.
  const results = useQueries({
    queries: providers.map((p) => ({
      queryKey: p.queryKey,
      queryFn: p.fetch,
      staleTime: p.staleTime ?? DEFAULT_STALE_TIME,
      enabled,
    })),
  })

  const actions = useMemo(() => buildAllActions({toggleDark}), [toggleDark])

  // Frecency scores per section reorder the Navigation group (empty-state).
  const sectionsQuery = useQuery({
    queryKey: ['usage-sections', 'search-index'],
    queryFn: fetchSectionScores,
    staleTime: DEFAULT_STALE_TIME,
    enabled,
  })

  // `useQueries` returns a new `results` array on every render, so we keep a stable
  // tuple of `data` references in state and only update it when an element reference
  // actually changes. Without this, `items`/`fuse` would rebuild on every keystroke
  // and cause typing lag. This uses the React-recommended "adjust state during
  // render" pattern (https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes).
  const nextData = results.map((r) => r.data)
  const [dataDeps, setDataDeps] = useState<unknown[]>(nextData)
  if (dataDeps.length !== nextData.length || dataDeps.some((d, i) => d !== nextData[i])) {
    setDataDeps(nextData)
  }

  const {items, itemsByGroup} = useMemo(() => {
    const byGroup = new Map<string, SearchItem[]>()
    const all: SearchItem[] = []

    function push(item: SearchItem) {
      all.push(item)
      const bucket = byGroup.get(item.group) ?? []
      bucket.push(item)
      byGroup.set(item.group, bucket)
    }

    // Navigation reordered by section frecency; declared order breaks ties.
    const scores = sectionsQuery.data ?? {}
    const navItems = actions
      .filter((a) => a.group === 'Navigation')
      .slice()
      .sort((a, b) => (scores[b.navPath ?? ''] ?? 0) - (scores[a.navPath ?? ''] ?? 0))
    const otherActions = actions.filter((a) => a.group !== 'Navigation')
    for (const a of [...navItems, ...otherActions]) push(a)
    for (let i = 0; i < providers.length; i++) {
      const rows = dataDeps[i]
      if (!rows) continue
      const searchItems = providers[i].toItems(rows as never)
      for (const item of searchItems) push(item)
    }

    return {items: all, itemsByGroup: byGroup}
  }, [actions, dataDeps, sectionsQuery.data])

  return {
    items,
    itemsByGroup,
    isLoading: results.some((r) => r.isLoading && r.fetchStatus !== 'idle'),
    isFetching: results.some((r) => r.isFetching),
  }
}
