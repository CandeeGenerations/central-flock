import {Button} from '@/components/ui/button'
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select'
import {ChevronLeft, ChevronRight} from 'lucide-react'

/** `'all'` puts every row on one page; the caller resolves it to a number. */
export type PageSize = number | 'all'

/** Resolve a PageSize against the row count, for slicing and for `pageSize`. */
export function resolvePageSize(size: PageSize, total: number): number {
  return size === 'all' ? Math.max(total, 1) : size
}

interface PaginationProps {
  page: number
  pageSize: number
  total: number
  onPageChange: (page: number) => void
  noun?: string
  // The size picker is opt-in: it renders only when both the options and the
  // handler are supplied, so callers that never wanted one are untouched.
  size?: PageSize
  sizeOptions?: PageSize[]
  onSizeChange?: (size: PageSize) => void
}

export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  noun = 'items',
  size,
  sizeOptions,
  onSizeChange,
}: PaginationProps) {
  const totalPages = Math.ceil(total / pageSize)
  const from = (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, total)
  const showPicker = sizeOptions && sizeOptions.length > 0 && onSizeChange && size !== undefined

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-muted-foreground text-sm">
        Showing {from.toLocaleString()}–{to.toLocaleString()} of {total.toLocaleString()} {noun}
      </p>
      <div className="flex items-center gap-2">
        {showPicker && (
          <Select value={String(size)} onValueChange={(v) => onSizeChange(v === 'all' ? 'all' : Number(v))}>
            <SelectTrigger size="sm" className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {sizeOptions.map((o) => (
                <SelectItem key={String(o)} value={String(o)}>
                  {o === 'all' ? `All ${noun}` : `${o} per page`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {totalPages > 1 && (
          <>
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
              <ChevronLeft className="mr-1 h-4 w-4" />
              Previous
            </Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>
              Next
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </>
        )}
      </div>
    </div>
  )
}
