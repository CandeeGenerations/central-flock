import {Button} from '@/components/ui/button'
import {Input} from '@/components/ui/input'
import {Popover, PopoverContent, PopoverTrigger} from '@/components/ui/popover'
import {useDebouncedValue} from '@/hooks/use-debounced-value'
import {fetchPeople, fetchPerson} from '@/lib/api'
import {cn} from '@/lib/utils'
import {useQuery} from '@tanstack/react-query'
import {ArrowDown, ArrowUp, ChevronDownIcon, X} from 'lucide-react'
import {useEffect, useRef, useState} from 'react'

interface PerformerMultiPickerProps {
  value: number[]
  onChange: (ids: number[]) => void
  guestPerformers: string[]
  onGuestChange: (names: string[]) => void
  className?: string
}

function nameOf(p: {firstName: string | null; lastName: string | null}): string {
  return [p.firstName, p.lastName].filter(Boolean).join(' ') || '(no name)'
}

export function PerformerMultiPicker({
  value,
  onChange,
  guestPerformers,
  onGuestChange,
  className,
}: PerformerMultiPickerProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const debounced = useDebouncedValue(search, 200)
  const [guestInput, setGuestInput] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const {data: results} = useQuery({
    queryKey: ['performer-search', debounced],
    queryFn: () => fetchPeople({search: debounced || undefined, limit: 20}),
    enabled: open,
  })

  const selectedQueries = useQuery({
    queryKey: ['performers-selected', value.join(',')],
    queryFn: async () => {
      const all = await Promise.all(value.map((id) => fetchPerson(id).catch(() => null)))
      return all.filter((p): p is NonNullable<typeof p> => !!p)
    },
    enabled: value.length > 0,
  })

  useEffect(() => {
    if (open) requestAnimationFrame(() => inputRef.current?.focus())
  }, [open])

  const move = (idx: number, dir: -1 | 1) => {
    const j = idx + dir
    if (j < 0 || j >= value.length) return
    const next = [...value]
    ;[next[idx], next[j]] = [next[j], next[idx]]
    onChange(next)
  }

  const remove = (idx: number) => {
    onChange(value.filter((_, i) => i !== idx))
  }

  const add = (id: number) => {
    if (value.includes(id)) return
    onChange([...value, id])
  }

  const addGuest = () => {
    const name = guestInput.trim()
    if (!name) return
    onGuestChange([...guestPerformers, name])
    setGuestInput('')
  }

  const removeGuest = (idx: number) => {
    onGuestChange(guestPerformers.filter((_, i) => i !== idx))
  }

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex flex-wrap gap-2">
        {(selectedQueries.data ?? []).map((p, idx) => (
          <div key={p.id} className="flex items-center gap-1 border rounded px-2 py-1 text-sm">
            <span>{nameOf(p)}</span>
            <Button type="button" variant="ghost" size="icon" className="h-5 w-5" onClick={() => move(idx, -1)}>
              <ArrowUp className="h-3 w-3" />
            </Button>
            <Button type="button" variant="ghost" size="icon" className="h-5 w-5" onClick={() => move(idx, 1)}>
              <ArrowDown className="h-3 w-3" />
            </Button>
            <Button type="button" variant="ghost" size="icon" className="h-5 w-5" onClick={() => remove(idx)}>
              <X className="h-3 w-3" />
            </Button>
          </div>
        ))}
        {guestPerformers.map((g, idx) => (
          <div
            key={`guest-${idx}-${g}`}
            className="flex items-center gap-1 border border-dashed rounded px-2 py-1 text-sm"
          >
            <span className="italic">{g}</span>
            <span className="text-xs text-muted-foreground">guest</span>
            <Button type="button" variant="ghost" size="icon" className="h-5 w-5" onClick={() => removeGuest(idx)}>
              <X className="h-3 w-3" />
            </Button>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button type="button" variant="outline">
              + Add performer
              <ChevronDownIcon className="ml-2 h-4 w-4 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="p-2 w-[320px]" align="start">
            <input
              ref={inputRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search people..."
              className="w-full border rounded px-2 py-1 text-sm mb-2"
            />
            <div className="max-h-72 overflow-auto">
              {(results?.data ?? []).map((p) => {
                const already = value.includes(p.id)
                return (
                  <button
                    key={p.id}
                    type="button"
                    disabled={already}
                    className={cn(
                      'block w-full text-left px-2 py-1.5 hover:bg-accent rounded text-sm',
                      already && 'opacity-40 cursor-not-allowed',
                    )}
                    onClick={() => {
                      if (already) return
                      add(p.id)
                      setOpen(false)
                      setSearch('')
                    }}
                  >
                    {nameOf(p)}
                    {p.phoneDisplay && <span className="text-xs text-muted-foreground"> · {p.phoneDisplay}</span>}
                  </button>
                )
              })}
              {results?.data?.length === 0 && <div className="text-sm text-muted-foreground p-2">No people match.</div>}
            </div>
          </PopoverContent>
        </Popover>

        <div className="flex items-center gap-2">
          <Input
            value={guestInput}
            onChange={(e) => setGuestInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addGuest()
              }
            }}
            placeholder='Guest name (e.g. "Smith Family")'
            className="w-64"
          />
          <Button type="button" variant="outline" onClick={addGuest} disabled={!guestInput.trim()}>
            Add guest
          </Button>
        </div>
      </div>
    </div>
  )
}
