import {TableHead} from '@/components/ui/table'
import {cn} from '@/lib/utils'
import {ArrowDown, ArrowUp, ChevronsUpDown} from 'lucide-react'
import {useState} from 'react'

export type SortDir = 'asc' | 'desc'
export interface SortState {
  key: string
  dir: SortDir
}

/**
 * Click-to-sort state for a table whose *unsorted* order means something — a
 * hand-arranged roster, a chronological log. Cycling asc → desc → off is what
 * makes that order reachable again, so `sort` is null until asked for and can
 * always be returned to null.
 */
export function useTableSort(initial: SortState | null = null) {
  const [sort, setSort] = useState<SortState | null>(initial)
  const toggle = (key: string) =>
    setSort((prev) => (prev?.key !== key ? {key, dir: 'asc'} : prev.dir === 'asc' ? {key, dir: 'desc'} : null))
  return {sort, setSort, toggle}
}

/** Compares two sort values of the same kind; nulls always sort last. */
export function compareValues(a: string | number | null, b: string | number | null, dir: SortDir): number {
  if (a === b) return 0
  if (a === null) return 1
  if (b === null) return -1
  const sign = dir === 'asc' ? 1 : -1
  if (typeof a === 'string' || typeof b === 'string') return String(a).localeCompare(String(b)) * sign
  return (a - b) * sign
}

export function SortableTableHead({
  sortKey,
  sort,
  onToggle,
  className,
  align = 'left',
  children,
}: {
  sortKey: string
  sort: SortState | null
  onToggle: (key: string) => void
  className?: string
  align?: 'left' | 'center' | 'right'
  children: React.ReactNode
}) {
  const active = sort?.key === sortKey
  const Icon = !active ? ChevronsUpDown : sort.dir === 'asc' ? ArrowUp : ArrowDown
  return (
    <TableHead className={className}>
      <button
        type="button"
        onClick={() => onToggle(sortKey)}
        className={cn(
          'hover:text-foreground flex w-full cursor-pointer items-center gap-1 transition-colors',
          align === 'center' && 'justify-center',
          align === 'right' && 'justify-end',
          active && 'text-foreground font-semibold',
        )}
        title={active ? (sort.dir === 'asc' ? 'Sorted ascending' : 'Sorted descending') : 'Sort by this column'}
      >
        {children}
        <Icon className={cn('h-3 w-3 shrink-0', active ? 'opacity-100' : 'opacity-40')} />
      </button>
    </TableHead>
  )
}
