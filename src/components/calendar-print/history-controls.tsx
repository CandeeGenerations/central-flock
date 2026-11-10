// Undo / Redo / History for Calendar Print — one linear timeline for every year, like a
// document's history (CONTEXT.md → History, docs/adr/0041). Undo reverses the latest Change;
// Restore to here rolls back everything after an older one and is itself undoable.
import {Button} from '@/components/ui/button'
import {Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle} from '@/components/ui/sheet'
import {
  type CalendarPrintHistoryEntry,
  fetchCalendarPrintHistory,
  redoCalendarPrint,
  restoreCalendarPrint,
  undoCalendarPrint,
} from '@/lib/api'
import {queryKeys} from '@/lib/query-keys'
import {type QueryClient, useMutation, useQuery, useQueryClient} from '@tanstack/react-query'
import {History, Redo2, Undo2} from 'lucide-react'
import {useEffect, useState} from 'react'
import {toast} from 'sonner'

// Every Calendar Print query may be stale after a Change made through History.
export function invalidateCalendarPrint(queryClient: QueryClient) {
  queryClient.invalidateQueries({queryKey: ['calendarPrintPage']})
  queryClient.invalidateQueries({queryKey: queryKeys.calendarPrintDefaultSchedule})
  queryClient.invalidateQueries({queryKey: queryKeys.calendarPrintHistory})
  queryClient.invalidateQueries({queryKey: ['calendarPrintYearCopyPreview']})
}

function formatWhen(createdAt: string): string {
  return new Date(createdAt.replace(' ', 'T') + 'Z').toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false
  return el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)
}

export function HistoryControls() {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)

  const historyQuery = useQuery({
    queryKey: queryKeys.calendarPrintHistory,
    queryFn: fetchCalendarPrintHistory,
  })
  const canUndo = historyQuery.data?.canUndo ?? false
  const canRedo = historyQuery.data?.canRedo ?? false

  const redoMutation = useMutation({
    mutationFn: redoCalendarPrint,
    onSuccess: (r) => {
      invalidateCalendarPrint(queryClient)
      toast.success(`Redid “${r.description}”`)
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const undoMutation = useMutation({
    mutationFn: undoCalendarPrint,
    onSuccess: (r) => {
      invalidateCalendarPrint(queryClient)
      toast.success(`Undid “${r.description}”`, {action: {label: 'Redo', onClick: () => redoMutation.mutate()}})
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const restoreMutation = useMutation({
    mutationFn: (id: number) => restoreCalendarPrint(id),
    onSuccess: (r) => {
      invalidateCalendarPrint(queryClient)
      toast.success(r.description, {action: {label: 'Undo', onClick: () => undoMutation.mutate()}})
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const busy = undoMutation.isPending || redoMutation.isPending || restoreMutation.isPending

  // ⌘Z / ⇧⌘Z (Ctrl on other platforms) when not typing in a field or working in a dialog.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'z') return
      if (isTypingTarget(e.target) || document.querySelector('[role="dialog"]')) return
      e.preventDefault()
      if (busy) return
      if (e.shiftKey) {
        if (canRedo) redoMutation.mutate()
      } else if (canUndo) {
        undoMutation.mutate()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, canUndo, canRedo, undoMutation, redoMutation])

  const entries = historyQuery.data?.entries ?? []
  const latestActiveId = entries.find((e) => !e.undone)?.id

  return (
    <>
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="icon"
          title="Undo (⌘Z)"
          aria-label="Undo"
          disabled={!canUndo || busy}
          onClick={() => undoMutation.mutate()}
        >
          <Undo2 className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          title="Redo (⇧⌘Z)"
          aria-label="Redo"
          disabled={!canRedo || busy}
          onClick={() => redoMutation.mutate()}
        >
          <Redo2 className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
          <History className="h-4 w-4 mr-1.5" /> History
        </Button>
      </div>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full sm:!max-w-md">
          <SheetHeader>
            <SheetTitle>Calendar History</SheetTitle>
            <SheetDescription>
              Every change to the printed calendar, newest first. Restore to here rolls back everything after it — and
              can itself be undone.
            </SheetDescription>
          </SheetHeader>
          <div className="flex-1 overflow-auto px-4 pb-4 space-y-1.5">
            {entries.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">No changes yet.</p>
            ) : (
              entries.map((entry) => (
                <HistoryRow
                  key={entry.id}
                  entry={entry}
                  isCurrent={entry.id === latestActiveId}
                  disabled={busy}
                  onRestore={() => restoreMutation.mutate(entry.id)}
                />
              ))
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}

function HistoryRow({
  entry,
  isCurrent,
  disabled,
  onRestore,
}: {
  entry: CalendarPrintHistoryEntry
  isCurrent: boolean
  disabled: boolean
  onRestore: () => void
}) {
  return (
    <div className={`rounded-md border p-2.5 text-sm ${entry.undone ? 'opacity-50' : 'bg-card'}`}>
      <div className={`break-words ${entry.undone ? 'line-through' : ''}`}>{entry.description}</div>
      <div className="mt-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          {formatWhen(entry.createdAt)}
          {entry.undone && ' · undone'}
          {isCurrent && ' · current'}
        </span>
        {!entry.undone && !isCurrent && (
          <button
            type="button"
            className="underline hover:text-foreground disabled:opacity-50"
            disabled={disabled}
            onClick={onRestore}
          >
            Restore to here
          </button>
        )}
      </div>
    </div>
  )
}
