import {Popover, PopoverContent, PopoverTrigger} from '@/components/ui/popover'
import {useDebouncedValue} from '@/hooks/use-debounced-value'
import {fetchPeople, fetchPerson} from '@/lib/api'
import {cn} from '@/lib/utils'
import {useQuery} from '@tanstack/react-query'
import {ChevronDownIcon, X} from 'lucide-react'
import {useCallback, useEffect, useRef, useState} from 'react'

interface PersonPickerProps {
  value: number | null
  onChange: (id: number | null) => void
  placeholder?: string
  className?: string
}

function formatPerson(p: {firstName: string | null; lastName: string | null; phoneDisplay: string | null}) {
  const name = [p.firstName, p.lastName].filter(Boolean).join(' ') || '(no name)'
  return p.phoneDisplay ? `${name} — ${p.phoneDisplay}` : name
}

export function PersonPicker({value, onChange, placeholder = 'Select person...', className}: PersonPickerProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search, 200)
  const inputRef = useRef<HTMLInputElement>(null)

  const {data: selected} = useQuery({
    queryKey: ['person', value],
    queryFn: () => fetchPerson(value as number),
    enabled: value != null,
  })

  const {data: results} = useQuery({
    queryKey: ['people-search', debouncedSearch],
    queryFn: () => fetchPeople({search: debouncedSearch || undefined, limit: 20}),
    enabled: open,
  })

  useEffect(() => {
    if (open) requestAnimationFrame(() => inputRef.current?.focus())
  }, [open])

  const handleOpenChange = useCallback((next: boolean) => {
    setOpen(next)
    if (next) setSearch('')
  }, [])

  const selectPerson = (id: number) => {
    onChange(id)
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'flex w-full items-center justify-between gap-1.5 rounded-3xl border border-transparent bg-input/50 px-3 py-2 text-sm whitespace-nowrap transition-[color,box-shadow,background-color] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 h-9 cursor-pointer',
            className,
          )}
        >
          <span className={cn('line-clamp-1', !selected && 'text-muted-foreground')}>
            {selected ? formatPerson(selected) : placeholder}
          </span>
          <div className="flex items-center gap-1 shrink-0">
            {value != null && (
              <span
                role="button"
                tabIndex={0}
                className="p-0.5 rounded hover:bg-foreground/10 cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation()
                  onChange(null)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    e.stopPropagation()
                    onChange(null)
                  }
                }}
                title="Clear"
              >
                <X className="size-3.5 text-muted-foreground" />
              </span>
            )}
            <ChevronDownIcon className="pointer-events-none size-4 text-muted-foreground" />
          </div>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-(--radix-popover-trigger-width) gap-0 overflow-hidden p-0 relative bg-popover/70 before:pointer-events-none before:absolute before:inset-0 before:-z-1 before:rounded-[inherit] before:backdrop-blur-2xl before:backdrop-saturate-150"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="px-2 pt-2 pb-1">
          <input
            ref={inputRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name or phone..."
            className="flex h-8 w-full rounded-2xl border border-input bg-transparent px-3 py-1 text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
        <div className="max-h-60 overflow-y-auto overscroll-contain p-1.5">
          {!results ? (
            <p className="text-sm text-muted-foreground text-center py-3">Loading…</p>
          ) : results.data.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-3">No people match</p>
          ) : (
            results.data.map((p) => (
              <button
                key={p.id}
                type="button"
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-2xl py-2 px-3 text-sm outline-hidden cursor-pointer text-left',
                  p.id === value ? 'bg-foreground/10' : 'hover:bg-foreground/10',
                )}
                onClick={() => selectPerson(p.id)}
              >
                <span className="font-medium">
                  {[p.firstName, p.lastName].filter(Boolean).join(' ') || '(no name)'}
                </span>
                {p.phoneDisplay && <span className="ml-auto text-xs text-muted-foreground">{p.phoneDisplay}</span>}
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
