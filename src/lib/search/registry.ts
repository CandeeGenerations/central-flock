/**
 * Global command-palette search registry.
 *
 * To add a new entity to the palette:
 *   1. Create `src/lib/search/providers/<name>.ts` exporting a `SearchProvider`.
 *   2. Add it to the `providers` array in `src/lib/search/providers/index.ts`.
 * That's it — the palette discovers it automatically.
 */
import type {LucideIcon} from 'lucide-react'
import type {NavigateFunction} from 'react-router-dom'

export interface SearchItem {
  id: string
  label: string
  subtitle?: string
  group: string
  icon?: LucideIcon
  keywords: string[]
  action: (ctx: SearchActionContext) => void | Promise<void>
  keepOpen?: boolean
}

export interface SearchActionContext {
  navigate: NavigateFunction
  close: () => void
}

export interface SearchProvider<Row = unknown> {
  id: string
  label: string
  icon?: LucideIcon
  priority?: number
  queryKey: readonly unknown[]
  fetch: () => Promise<Row[]>
  toItems: (rows: Row[]) => SearchItem[]
  staleTime?: number
}

export interface ActionsProvider {
  id: string
  build: (ctx: ActionsBuildContext) => SearchItem[]
}

export interface ActionsBuildContext {
  toggleDark: () => void
}
