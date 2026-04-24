import Fuse, {type IFuseOptions} from 'fuse.js'

import type {SearchItem} from './registry'

export const fuseOptions: IFuseOptions<SearchItem> = {
  keys: [
    {name: 'label', weight: 0.6},
    {name: 'keywords', weight: 0.3},
    {name: 'subtitle', weight: 0.1},
  ],
  threshold: 0.4,
  ignoreLocation: true,
  minMatchCharLength: 1,
  shouldSort: true,
  includeScore: true,
}

export function buildFuse(items: SearchItem[]) {
  return new Fuse(items, fuseOptions)
}

export function fuzzyFilter(fuse: Fuse<SearchItem>, query: string, limit = 50): SearchItem[] {
  const trimmed = query.trim()
  if (!trimmed) return []
  return fuse.search(trimmed, {limit}).map((r) => r.item)
}
