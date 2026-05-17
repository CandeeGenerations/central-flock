import {Badge} from '@/components/ui/badge'
import {Button} from '@/components/ui/button'
import {Input} from '@/components/ui/input'
import {SearchInput} from '@/components/ui/search-input'
import {useDebouncedValue} from '@/hooks/use-debounced-value'
import {fetchPeople, fetchPerson} from '@/lib/api'
import {cn} from '@/lib/utils'
import {useQuery} from '@tanstack/react-query'
import {X} from 'lucide-react'
import {useRef, useState} from 'react'

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
  const [search, setSearch] = useState('')
  const [highlight, setHighlight] = useState(-1)
  const debounced = useDebouncedValue(search, 200)
  const [guestInput, setGuestInput] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)

  const {data: results} = useQuery({
    queryKey: ['performer-search', debounced],
    queryFn: () => fetchPeople({search: debounced || undefined, limit: 20}),
  })

  const selectedQueries = useQuery({
    queryKey: ['performers-selected', value.join(',')],
    queryFn: async () => {
      const all = await Promise.all(value.map((id) => fetchPerson(id).catch(() => null)))
      return all.filter((p): p is NonNullable<typeof p> => !!p)
    },
    enabled: value.length > 0,
  })

  const filteredResults = (results?.data ?? []).filter((p) => !value.includes(p.id))

  const remove = (id: number) => onChange(value.filter((i) => i !== id))
  const add = (id: number) => {
    if (value.includes(id)) return
    onChange([...value, id])
    setSearch('')
    setHighlight(-1)
    searchRef.current?.focus()
  }

  const addGuest = () => {
    const name = guestInput.trim()
    if (!name) return
    onGuestChange([...guestPerformers, name])
    setGuestInput('')
  }
  const removeGuest = (idx: number) => onGuestChange(guestPerformers.filter((_, i) => i !== idx))

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlight((i) => (i < filteredResults.length - 1 ? i + 1 : 0))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlight((i) => (i > 0 ? i - 1 : filteredResults.length - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (highlight >= 0 && highlight < filteredResults.length) {
        add(filteredResults[highlight].id)
      }
    }
  }

  return (
    <div className={cn('space-y-2', className)}>
      <SearchInput
        ref={searchRef}
        placeholder="Search people to add..."
        value={search}
        onChange={(v) => {
          setSearch(v)
          setHighlight(-1)
        }}
        onKeyDown={handleKey}
        hideShortcut
      />
      {search && (
        <div className="rounded-xl overflow-hidden bg-popover/70 backdrop-blur-2xl backdrop-saturate-150 shadow-lg ring-1 ring-foreground/5 dark:ring-foreground/10">
          <div className="max-h-48 overflow-auto p-1.5">
            {filteredResults.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-3">No matching people</p>
            ) : (
              filteredResults.map((p, i) => (
                <button
                  key={p.id}
                  ref={i === highlight ? (el) => el?.scrollIntoView({block: 'nearest'}) : undefined}
                  type="button"
                  className={cn(
                    'flex items-center gap-2.5 w-full px-3 py-2 rounded-lg cursor-pointer text-sm font-medium text-left',
                    i === highlight ? 'bg-foreground/10' : 'hover:bg-foreground/10',
                  )}
                  onClick={() => add(p.id)}
                >
                  <span>{nameOf(p)}</span>
                  {p.phoneDisplay && <span className="text-muted-foreground ml-auto">{p.phoneDisplay}</span>}
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {(value.length > 0 || guestPerformers.length > 0) && (
        <div className="flex flex-wrap gap-1.5">
          {(selectedQueries.data ?? []).map((p) => (
            <Badge
              key={p.id}
              className="gap-1 cursor-pointer bg-teal-100 text-teal-800 hover:bg-teal-200 dark:bg-teal-900 dark:text-teal-200 dark:hover:bg-teal-800 border-0"
              onClick={() => remove(p.id)}
            >
              {nameOf(p)}
              <X className="h-3 w-3 ml-0.5" />
            </Badge>
          ))}
          {guestPerformers.map((g, idx) => (
            <Badge
              key={`guest-${idx}-${g}`}
              variant="outline"
              className="gap-1 cursor-pointer border-dashed"
              onClick={() => removeGuest(idx)}
            >
              <span className="italic">{g}</span>
              <span className="text-xs text-muted-foreground">guest</span>
              <X className="h-3 w-3 ml-0.5" />
            </Badge>
          ))}
        </div>
      )}

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
          placeholder='Add a guest (e.g. "Smith Family")'
          className="w-64"
        />
        <Button type="button" variant="outline" onClick={addGuest} disabled={!guestInput.trim()}>
          Add guest
        </Button>
      </div>
    </div>
  )
}
