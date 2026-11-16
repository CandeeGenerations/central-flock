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
  // Navigation target, when this item opens a route. Used to de-dupe a Recent
  // entry against the same entity surfaced by its own provider.
  navPath?: string
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
  /**
   * For providers that hide past periods (see current-period.ts): matches paths belonging to this
   * provider's entities, with group 1 capturing the entity's own path (so sub-pages such as
   * `/schedules/music/18/service/70` count as week 18). A Recent entry on a matching path is shown
   * only if this provider still lists that entity, so a past week/month/term doesn't come back
   * through Recents.
   */
  ownsPath?: RegExp
}

export interface ActionsProvider {
  id: string
  build: (ctx: ActionsBuildContext) => SearchItem[]
}

export interface ActionsBuildContext {
  toggleDark: () => void
  /** The Prayer Request shortcut, absent from the palette until it is configured. */
  prayerRequest: {ready: boolean; href: string}
}
