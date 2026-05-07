import {Button} from '@/components/ui/button'
import {Popover, PopoverContent, PopoverTrigger} from '@/components/ui/popover'
import {useDebouncedValue} from '@/hooks/use-debounced-value'
import {cn} from '@/lib/utils'
import {useQuery} from '@tanstack/react-query'
import {ChevronDownIcon, X} from 'lucide-react'
import {useEffect, useRef, useState} from 'react'

interface HymnRow {
  id: number
  book: 'burgundy' | 'silver'
  number: number
  title: string
  firstLine: string | null
  refrainLine: string | null
}

interface HymnSearchPickerProps {
  value: number | null
  onSelect: (hymn: HymnRow | null) => void
  className?: string
}

const labelFor = (h: HymnRow) => `${h.book === 'burgundy' ? 'B' : 'S'}${h.number} — ${h.title}`

async function searchHymns(q: string): Promise<HymnRow[]> {
  const params = new URLSearchParams({pageSize: '20'})
  if (q) params.set('q', q)
  const res = await fetch(`/api/hymns?${params.toString()}`, {credentials: 'include'})
  if (!res.ok) return []
  const body = (await res.json()) as {hymns: HymnRow[]}
  return body.hymns
}

async function getHymn(id: number): Promise<HymnRow | null> {
  const res = await fetch(`/api/hymns/${id}`, {credentials: 'include'})
  if (!res.ok) return null
  return (await res.json()) as HymnRow
}

export function HymnSearchPicker({value, onSelect, className}: HymnSearchPickerProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const debounced = useDebouncedValue(search, 200)
  const inputRef = useRef<HTMLInputElement>(null)

  const {data: selected} = useQuery({
    queryKey: ['hymn-by-id', value],
    queryFn: () => getHymn(value as number),
    enabled: value != null,
  })

  const {data: results} = useQuery({
    queryKey: ['hymn-search-picker', debounced],
    queryFn: () => searchHymns(debounced),
    enabled: open,
  })

  useEffect(() => {
    if (open) requestAnimationFrame(() => inputRef.current?.focus())
  }, [open])

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" type="button" className="flex-1 justify-between">
            <span className="truncate">{selected ? labelFor(selected) : 'Link to a hymn (optional)'}</span>
            <ChevronDownIcon className="h-4 w-4 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="p-2 w-[400px]" align="start">
          <input
            ref={inputRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search title, first line, or refrain..."
            className="w-full border rounded px-2 py-1 text-sm mb-2"
          />
          <div className="max-h-72 overflow-auto">
            {(results ?? []).map((h) => (
              <button
                key={h.id}
                type="button"
                className="block w-full text-left px-2 py-1.5 hover:bg-accent rounded"
                onClick={() => {
                  onSelect(h)
                  setOpen(false)
                  setSearch('')
                }}
              >
                <div className="text-sm font-medium">{labelFor(h)}</div>
                {h.firstLine && <div className="text-xs text-muted-foreground truncate">{h.firstLine}</div>}
              </button>
            ))}
            {results && results.length === 0 && (
              <div className="text-sm text-muted-foreground p-2">No hymns match.</div>
            )}
          </div>
        </PopoverContent>
      </Popover>
      {value != null && (
        <Button type="button" variant="ghost" size="icon" onClick={() => onSelect(null)} title="Clear hymn link">
          <X className="h-4 w-4" />
        </Button>
      )}
    </div>
  )
}
