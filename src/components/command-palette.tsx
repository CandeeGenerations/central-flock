import {Dialog, DialogContent, DialogDescription, DialogTitle} from '@/components/ui/dialog'
import {useDebouncedValue} from '@/hooks/use-debounced-value'
import {buildFuse} from '@/lib/search/fuzzy'
import type {SearchItem} from '@/lib/search/registry'
import {useSearchIndex} from '@/lib/search/use-search-index'
import {cn} from '@/lib/utils'
import {Command} from 'cmdk'
import {CornerDownLeft, Loader2, Search} from 'lucide-react'
import {memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState} from 'react'
import {type NavigateFunction, useNavigate} from 'react-router-dom'

const MAX_EMPTY_RESULTS_PER_GROUP = 6
const MAX_SEARCH_RESULTS = 60

const GROUP_ORDER = [
  'Navigation',
  'Create',
  'Commands',
  'People',
  'Groups',
  'Notes',
  'Folders',
  'Devotions',
  'Gwendolyn Devotions',
  'Messages',
  'Drafts',
  'Templates',
  'Quotes',
  'Hymns',
  'Nursery',
  'Calendar',
]

const PREFIX_TO_GROUP: Record<string, string> = {
  nav: 'Navigation',
  go: 'Navigation',
  new: 'Create',
  create: 'Create',
  cmd: 'Commands',
  command: 'Commands',
  p: 'People',
  person: 'People',
  people: 'People',
  g: 'Groups',
  group: 'Groups',
  groups: 'Groups',
  n: 'Notes',
  note: 'Notes',
  notes: 'Notes',
  folder: 'Folders',
  folders: 'Folders',
  d: 'Devotions',
  devo: 'Devotions',
  devos: 'Devotions',
  devotion: 'Devotions',
  devotions: 'Devotions',
  gwen: 'Gwendolyn Devotions',
  gwendolyn: 'Gwendolyn Devotions',
  m: 'Messages',
  msg: 'Messages',
  message: 'Messages',
  messages: 'Messages',
  draft: 'Drafts',
  drafts: 'Drafts',
  t: 'Templates',
  tmpl: 'Templates',
  template: 'Templates',
  templates: 'Templates',
  q: 'Quotes',
  quote: 'Quotes',
  quotes: 'Quotes',
  h: 'Hymns',
  hymn: 'Hymns',
  hymns: 'Hymns',
  nursery: 'Nursery',
  cal: 'Calendar',
  calendar: 'Calendar',
}

function parsePrefix(query: string): {group: string | null; rest: string} {
  const m = query.match(/^([a-zA-Z]+):\s*(.*)$/)
  if (!m) return {group: null, rest: query}
  const group = PREFIX_TO_GROUP[m[1].toLowerCase()] ?? null
  if (!group) return {group: null, rest: query}
  return {group, rest: m[2]}
}

function sortGroups(groups: string[]): string[] {
  return [...groups].sort((a, b) => {
    const ai = GROUP_ORDER.indexOf(a)
    const bi = GROUP_ORDER.indexOf(b)
    if (ai === -1 && bi === -1) return a.localeCompare(b)
    if (ai === -1) return 1
    if (bi === -1) return -1
    return ai - bi
  })
}

function groupBy(items: SearchItem[]): Map<string, SearchItem[]> {
  const map = new Map<string, SearchItem[]>()
  for (const item of items) {
    const bucket = map.get(item.group) ?? []
    bucket.push(item)
    map.set(item.group, bucket)
  }
  return map
}

export function CommandPalette({open, onOpenChange}: {open: boolean; onOpenChange: (v: boolean) => void}) {
  const navigate = useNavigate()
  const inputRef = useRef<HTMLInputElement>(null)
  const {items, itemsByGroup, isLoading} = useSearchIndex(open)

  const fuse = useMemo(() => buildFuse(items), [items])

  const [rawQuery, setRawQuery] = useState('')
  const debouncedQuery = useDebouncedValue(rawQuery, 120)
  const query = useDeferredValue(debouncedQuery)

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 0)
  }, [open])

  const onOpenChangeRef = useRef(onOpenChange)
  useEffect(() => {
    onOpenChangeRef.current = onOpenChange
  }, [onOpenChange])

  const handleOpenChange = useCallback((v: boolean) => {
    if (!v) setRawQuery('')
    onOpenChangeRef.current(v)
  }, [])

  const close = useCallback(() => handleOpenChange(false), [handleOpenChange])

  const visible = useMemo(() => {
    const {group: filterGroup, rest} = parsePrefix(query.trim())
    const effective = rest.trim()

    if (!effective) {
      if (filterGroup) {
        const list = itemsByGroup.get(filterGroup) ?? []
        return new Map([[filterGroup, list]])
      }
      const trimmedGroups = new Map<string, SearchItem[]>()
      for (const [g, list] of itemsByGroup) {
        trimmedGroups.set(g, list.slice(0, MAX_EMPTY_RESULTS_PER_GROUP))
      }
      return trimmedGroups
    }

    const searchLimit = filterGroup ? MAX_SEARCH_RESULTS * 4 : MAX_SEARCH_RESULTS
    let matched = fuse.search(effective, {limit: searchLimit}).map((r) => r.item)
    if (filterGroup) matched = matched.filter((i) => i.group === filterGroup).slice(0, MAX_SEARCH_RESULTS)
    return groupBy(matched)
  }, [fuse, itemsByGroup, query])

  const orderedGroups = useMemo(() => sortGroups([...visible.keys()]), [visible])

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent showCloseButton={false} className="!p-0 gap-0 overflow-hidden sm:!max-w-xl sm:!rounded-2xl">
        <DialogTitle className="sr-only">Global Search</DialogTitle>
        <DialogDescription className="sr-only">
          Search people, groups, notes, and jump to any page or action.
        </DialogDescription>
        <Command shouldFilter={false} loop className="flex flex-col h-[100dvh] sm:h-auto sm:max-h-[70vh]">
          <div className="flex items-center gap-3 border-b px-4 py-3 shrink-0">
            <Search className="h-4 w-4 text-muted-foreground shrink-0" />
            <Command.Input
              ref={inputRef}
              value={rawQuery}
              onValueChange={setRawQuery}
              placeholder="Search people, notes, devotions, or type a command…"
              className="flex-1 bg-transparent outline-none placeholder:text-muted-foreground text-sm"
            />
            {isLoading && <Loader2 className="h-3.5 w-3.5 text-muted-foreground animate-spin shrink-0" />}
          </div>

          <Command.List className="flex-1 overflow-y-auto px-2 py-2">
            <Command.Empty className="py-10 text-center text-sm text-muted-foreground">
              {isLoading ? 'Loading…' : 'No results.'}
            </Command.Empty>

            {orderedGroups.map((group) => {
              const list = visible.get(group) ?? []
              if (list.length === 0) return null
              return (
                <Command.Group
                  key={group}
                  heading={group}
                  className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-muted-foreground"
                >
                  {list.map((item) => (
                    <PaletteItem key={item.id} item={item} navigate={navigate} close={close} />
                  ))}
                </Command.Group>
              )
            })}
          </Command.List>

          <PaletteFooter />
        </Command>
      </DialogContent>
    </Dialog>
  )
}

const PaletteItem = memo(function PaletteItem({
  item,
  navigate,
  close,
}: {
  item: SearchItem
  navigate: NavigateFunction
  close: () => void
}) {
  const Icon = item.icon
  const handleSelect = useCallback(() => item.action({navigate, close}), [item, navigate, close])
  return (
    <Command.Item
      value={`${item.group} ${item.label} ${item.keywords.join(' ')} ${item.id}`}
      onSelect={handleSelect}
      className={cn(
        'flex items-center gap-3 rounded-md px-2 py-2 text-sm cursor-pointer select-none',
        'data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground',
        'aria-disabled:opacity-50 aria-disabled:pointer-events-none',
      )}
    >
      {Icon ? <Icon className="h-4 w-4 text-muted-foreground shrink-0" /> : <span className="h-4 w-4 shrink-0" />}
      <div className="min-w-0 flex-1">
        <div className="truncate">{item.label}</div>
        {item.subtitle && <div className="truncate text-xs text-muted-foreground">{item.subtitle}</div>}
      </div>
    </Command.Item>
  )
})

function PaletteFooter() {
  return (
    <div className="border-t px-4 py-2 flex items-center gap-4 text-[11px] text-muted-foreground shrink-0">
      <span className="flex items-center gap-1">
        <Kbd>↑</Kbd>
        <Kbd>↓</Kbd>
        <span>navigate</span>
      </span>
      <span className="flex items-center gap-1">
        <Kbd>
          <CornerDownLeft className="h-3 w-3" />
        </Kbd>
        <span>open</span>
      </span>
      <span className="flex items-center gap-1">
        <Kbd>esc</Kbd>
        <span>close</span>
      </span>
    </div>
  )
}

function Kbd({children}: {children: React.ReactNode}) {
  return (
    <kbd className="inline-flex items-center justify-center rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px] font-medium">
      {children}
    </kbd>
  )
}
