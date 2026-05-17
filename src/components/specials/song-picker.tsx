import {Popover, PopoverContent, PopoverTrigger} from '@/components/ui/popover'
import {specialsApi} from '@/lib/specials-api'
import {cn} from '@/lib/utils'
import {useQuery} from '@tanstack/react-query'
import {CheckIcon, ChevronDownIcon, Plus, X} from 'lucide-react'
import {useRef, useState} from 'react'

interface HymnRow {
  id: number
  book: 'burgundy' | 'silver'
  number: number
  title: string
  firstLine: string | null
  refrainLine: string | null
}

interface HymnsResponse {
  hymns: HymnRow[]
  total: number
}

async function fetchAllHymns(): Promise<HymnRow[]> {
  const res = await fetch(`/api/hymns?pageSize=200&page=1`, {credentials: 'include'})
  if (!res.ok) throw new Error('Failed to load hymns')
  const first = (await res.json()) as HymnsResponse
  const totalPages = Math.ceil(first.total / 200)
  if (totalPages <= 1) return first.hymns
  const remaining = await Promise.all(
    Array.from({length: totalPages - 1}, (_, i) =>
      fetch(`/api/hymns?pageSize=200&page=${i + 2}`, {credentials: 'include'})
        .then((r) => r.json() as Promise<HymnsResponse>)
        .then((d) => d.hymns),
    ),
  )
  return [first.hymns, ...remaining].flat()
}

async function fetchHymn(id: number): Promise<HymnRow | null> {
  const res = await fetch(`/api/hymns/${id}`, {credentials: 'include'})
  if (!res.ok) return null
  return (await res.json()) as HymnRow
}

const hymnLabel = (h: HymnRow) => `${h.book === 'burgundy' ? 'B' : 'S'}${h.number} — ${h.title}`

type Option =
  | {kind: 'hymn'; key: string; label: string; hymn: HymnRow}
  | {kind: 'history'; key: string; label: string; title: string; lastDate: string}
  | {kind: 'custom'; key: string; label: string; title: string}

interface SongPickerProps {
  songTitle: string
  hymnId: number | null
  onChange: (next: {songTitle: string; hymnId: number | null}) => void
  className?: string
}

export function SongPicker({songTitle, hymnId, onChange, className}: SongPickerProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [highlightIndex, setHighlightIndex] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)

  const {data: allHymns} = useQuery({
    queryKey: ['hymns', 'all'],
    queryFn: fetchAllHymns,
    staleTime: 5 * 60 * 1000,
  })

  const {data: selectedHymn} = useQuery({
    queryKey: ['hymn-by-id', hymnId],
    queryFn: () => fetchHymn(hymnId as number),
    enabled: hymnId != null && !allHymns,
  })

  const hymnFromAll = hymnId != null ? allHymns?.find((h) => h.id === hymnId) : undefined
  const resolvedHymn = hymnFromAll ?? selectedHymn ?? null

  const {data: specials} = useQuery({
    queryKey: ['specials-list', 'song-picker'],
    queryFn: () => specialsApi.list(),
    staleTime: 60 * 1000,
  })

  // Distinct past titles, only those without hymnId (hymns shown separately)
  const pastTitles = (() => {
    if (!specials) return [] as {title: string; lastDate: string}[]
    const map = new Map<string, string>()
    for (const s of specials) {
      if (s.hymnId != null) continue
      const t = s.songTitle.trim()
      if (!t) continue
      const key = t.toLowerCase()
      const existing = map.get(key)
      if (!existing || s.date > existing) map.set(key, s.date)
    }
    const arr: {title: string; lastDate: string}[] = []
    for (const [key, lastDate] of map) {
      // preserve original casing — find first matching
      const orig = specials.find((s) => s.songTitle.trim().toLowerCase() === key)?.songTitle.trim() ?? key
      arr.push({title: orig, lastDate})
    }
    return arr.sort((a, b) => b.lastDate.localeCompare(a.lastDate))
  })()

  const q = search.trim().toLowerCase()
  const hymnOptions: Option[] = (allHymns ?? [])
    .filter((h) => {
      if (!q) return true
      return (
        h.title.toLowerCase().includes(q) ||
        (h.firstLine ?? '').toLowerCase().includes(q) ||
        (h.refrainLine ?? '').toLowerCase().includes(q) ||
        `${h.book === 'burgundy' ? 'b' : 's'}${h.number}`.includes(q)
      )
    })
    .slice(0, 50)
    .map((h) => ({kind: 'hymn' as const, key: `h-${h.id}`, label: hymnLabel(h), hymn: h}))

  const historyOptions: Option[] = pastTitles
    .filter((p) => (q ? p.title.toLowerCase().includes(q) : true))
    .slice(0, 20)
    .map((p) => ({
      kind: 'history' as const,
      key: `t-${p.title.toLowerCase()}`,
      label: p.title,
      title: p.title,
      lastDate: p.lastDate,
    }))

  const exactExists =
    hymnOptions.some((o) => o.kind === 'hymn' && o.hymn.title.toLowerCase() === q) ||
    historyOptions.some((o) => o.kind === 'history' && o.title.toLowerCase() === q)

  const customOption: Option[] =
    search.trim() && !exactExists
      ? [{kind: 'custom', key: 'custom', label: `Use “${search.trim()}” as a new song`, title: search.trim()}]
      : []

  const options: Option[] = [...customOption, ...hymnOptions, ...historyOptions]

  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    if (next) {
      setSearch('')
      setHighlightIndex(-1)
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }

  const pick = (opt: Option) => {
    if (opt.kind === 'hymn') {
      onChange({songTitle: opt.hymn.title, hymnId: opt.hymn.id})
    } else {
      onChange({songTitle: opt.title, hymnId: null})
    }
    setOpen(false)
    setSearch('')
  }

  const clear = () => onChange({songTitle: '', hymnId: null})

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightIndex((i) => (i < options.length - 1 ? i + 1 : 0))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightIndex((i) => (i > 0 ? i - 1 : options.length - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (highlightIndex >= 0 && highlightIndex < options.length) {
        pick(options[highlightIndex])
      } else if (search.trim()) {
        pick({kind: 'custom', key: 'custom', label: '', title: search.trim()})
      }
    }
  }

  const triggerLabel = resolvedHymn ? hymnLabel(resolvedHymn) : songTitle ? songTitle : 'Pick or type a song...'

  return (
    <div className={cn('relative', className)}>
      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              'flex w-full items-center justify-between gap-1.5 rounded-3xl border border-transparent bg-input/50 px-3 py-2 text-sm transition-[color,box-shadow,background-color] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 h-9 cursor-pointer',
              !songTitle && !resolvedHymn && 'text-muted-foreground',
              (songTitle || resolvedHymn) && 'pr-16',
            )}
          >
            <span className="line-clamp-1">{triggerLabel}</span>
            <ChevronDownIcon className="pointer-events-none size-4 text-muted-foreground shrink-0" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          usePortal={false}
          className="w-(--radix-popover-trigger-width) gap-0 overflow-hidden p-0 relative bg-popover/70 before:pointer-events-none before:absolute before:inset-0 before:-z-1 before:rounded-[inherit] before:backdrop-blur-2xl before:backdrop-saturate-150"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <div className="px-2 pt-2 pb-1">
            <input
              ref={inputRef}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setHighlightIndex(-1)
              }}
              onKeyDown={handleKeyDown}
              placeholder="Search hymnal or past specials..."
              className="flex h-8 w-full rounded-2xl border border-input bg-transparent px-3 py-1 text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          <div className="max-h-72 overflow-y-auto overscroll-contain p-1.5">
            {options.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-3">{allHymns ? 'No matches' : 'Loading...'}</p>
            ) : (
              options.map((opt, i) => {
                const selected =
                  (opt.kind === 'hymn' && opt.hymn.id === hymnId) ||
                  (opt.kind === 'history' && hymnId == null && opt.title === songTitle)
                return (
                  <button
                    key={opt.key}
                    type="button"
                    ref={i === highlightIndex ? (el) => el?.scrollIntoView({block: 'nearest'}) : undefined}
                    className={cn(
                      'relative flex w-full items-start gap-2.5 rounded-2xl py-2 pr-8 pl-3 text-sm font-medium outline-hidden select-none cursor-pointer text-left',
                      i === highlightIndex ? 'bg-foreground/10' : 'hover:bg-foreground/10',
                    )}
                    onClick={() => pick(opt)}
                  >
                    {opt.kind === 'custom' && <Plus className="size-4 shrink-0 mt-0.5 text-muted-foreground" />}
                    <div className="flex-1 min-w-0">
                      <div className="line-clamp-1">{opt.label}</div>
                      {opt.kind === 'hymn' && opt.hymn.firstLine && (
                        <div className="text-xs text-muted-foreground line-clamp-1 font-normal">
                          {opt.hymn.firstLine}
                        </div>
                      )}
                      {opt.kind === 'history' && (
                        <div className="text-xs text-muted-foreground font-normal">Last sung {opt.lastDate}</div>
                      )}
                    </div>
                    {selected && (
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 flex size-3.5 items-center justify-center">
                        <CheckIcon className="size-4" />
                      </span>
                    )}
                  </button>
                )
              })
            )}
          </div>
        </PopoverContent>
      </Popover>
      {(songTitle || resolvedHymn) && (
        <button
          type="button"
          onClick={clear}
          className="absolute right-9 top-1/2 -translate-y-1/2 rounded-sm p-1 text-muted-foreground hover:text-foreground cursor-pointer"
          aria-label="Clear song"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  )
}
