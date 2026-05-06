import {Badge} from '@/components/ui/badge'
import {Button} from '@/components/ui/button'
import {Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle} from '@/components/ui/dialog'
import {SearchInput} from '@/components/ui/search-input'
import {useDebouncedValue} from '@/hooks/use-debounced-value'
import {formatFullName} from '@/lib/format'
import {queryKeys} from '@/lib/query-keys'
import {type NonEntryPerson, addRsvpEntries, fetchRsvpNonEntries} from '@/lib/rsvp-api'
import {cn} from '@/lib/utils'
import {useInfiniteQuery, useMutation, useQueryClient} from '@tanstack/react-query'
import {X} from 'lucide-react'
import {useCallback, useMemo, useRef, useState} from 'react'
import {toast} from 'sonner'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  listId: number
}

export function RsvpAddPersonDialog({open, onOpenChange, listId}: Props) {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search, 250)
  const [highlightIndex, setHighlightIndex] = useState(-1)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [selectedPeople, setSelectedPeople] = useState<NonEntryPerson[]>([])
  const searchRef = useRef<HTMLInputElement>(null)

  const {
    data: nonEntriesData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: queryKeys.rsvpNonEntries(listId, debouncedSearch || undefined),
    queryFn: ({pageParam}) =>
      fetchRsvpNonEntries(listId, {
        search: debouncedSearch || undefined,
        page: pageParam,
        limit: 30,
      }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      const totalPages = Math.ceil(lastPage.total / lastPage.limit)
      return lastPage.page < totalPages ? lastPage.page + 1 : undefined
    },
    enabled: open,
  })

  const candidates = useMemo(() => nonEntriesData?.pages.flatMap((p) => p.data) || [], [nonEntriesData])
  const visible = useMemo(() => candidates.filter((p) => !selectedIds.has(p.id)), [candidates, selectedIds])

  const select = (p: NonEntryPerson) => {
    setSelectedIds((prev) => new Set([...prev, p.id]))
    setSelectedPeople((prev) => [...prev, p])
    setSearch('')
    setHighlightIndex(-1)
    searchRef.current?.focus()
  }

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (visible.length === 0) return
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setHighlightIndex((i) => Math.min(i + 1, visible.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setHighlightIndex((i) => Math.max(i - 1, 0))
      } else if (e.key === 'Enter' && highlightIndex >= 0 && visible[highlightIndex]) {
        e.preventDefault()
        select(visible[highlightIndex])
      }
    },
    [visible, highlightIndex],
  )

  const observerRef = useRef<IntersectionObserver | null>(null)
  const sentinelRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (observerRef.current) observerRef.current.disconnect()
      if (!node) return
      observerRef.current = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) fetchNextPage()
      })
      observerRef.current.observe(node)
    },
    [hasNextPage, isFetchingNextPage, fetchNextPage],
  )

  const addMutation = useMutation({
    mutationFn: () => addRsvpEntries(listId, [...selectedIds]),
    onSuccess: ({added}) => {
      queryClient.invalidateQueries({queryKey: queryKeys.rsvpList(listId)})
      queryClient.invalidateQueries({queryKey: ['rsvpNonEntries', String(listId)]})
      queryClient.invalidateQueries({queryKey: ['rsvpLists']})
      toast.success(`Added ${added} ${added === 1 ? 'person' : 'people'}`)
      reset()
      onOpenChange(false)
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const reset = () => {
    setSelectedIds(new Set())
    setSelectedPeople([])
    setSearch('')
    setHighlightIndex(-1)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset()
        onOpenChange(o)
      }}
    >
      <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Add People to RSVP List</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <SearchInput
            ref={searchRef}
            placeholder="Search people..."
            value={search}
            onChange={(v) => {
              setSearch(v)
              setHighlightIndex(-1)
            }}
            onKeyDown={handleKeyDown}
            hideShortcut
          />
          <div className="rounded-xl overflow-hidden bg-popover/70 backdrop-blur-2xl backdrop-saturate-150 shadow-lg ring-1 ring-foreground/5 dark:ring-foreground/10">
            <div className="max-h-48 overflow-auto p-1.5">
              {visible.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-3">No people to add</p>
              ) : (
                visible.map((p, i) => (
                  <button
                    key={p.id}
                    ref={i === highlightIndex ? (el) => el?.scrollIntoView({block: 'nearest'}) : undefined}
                    type="button"
                    className={cn(
                      'flex items-center gap-2.5 w-full px-3 py-2 rounded-lg cursor-pointer text-sm font-medium text-left',
                      i === highlightIndex ? 'bg-foreground/10' : 'hover:bg-foreground/10',
                    )}
                    onClick={() => select(p)}
                  >
                    <span>{formatFullName(p)}</span>
                    <span className="text-muted-foreground ml-auto">{p.phoneDisplay}</span>
                  </button>
                ))
              )}
              <div ref={sentinelRef} className="h-1" />
              {isFetchingNextPage && <p className="text-center text-muted-foreground text-sm py-2">Loading more...</p>}
            </div>
          </div>
          {selectedPeople.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {selectedPeople.map((p) => (
                <Badge
                  key={p.id}
                  className="gap-1 cursor-pointer bg-teal-100 text-teal-800 hover:bg-teal-200 dark:bg-teal-900 dark:text-teal-200 dark:hover:bg-teal-800 border-0"
                  onClick={() => {
                    setSelectedIds((prev) => {
                      const next = new Set(prev)
                      next.delete(p.id)
                      return next
                    })
                    setSelectedPeople((prev) => prev.filter((sp) => sp.id !== p.id))
                  }}
                >
                  {formatFullName(p)}
                  <X className="h-3 w-3 ml-0.5" />
                </Badge>
              ))}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={selectedIds.size === 0 || addMutation.isPending} onClick={() => addMutation.mutate()}>
            Add {selectedIds.size} {selectedIds.size === 1 ? 'Person' : 'People'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
