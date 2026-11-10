// Year Copy: build this year's Calendar Print from last year's (CONTEXT.md → Year Copy).
// Destructive for the target year's Events and Day Overrides, so the confirm step says exactly
// what goes; it is one History Change, so the summary offers Undo.
import {invalidateCalendarPrint} from '@/components/calendar-print/history-controls'
import {Button} from '@/components/ui/button'
import {Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle} from '@/components/ui/dialog'
import {type YearCopyResult, fetchYearCopyPreview, runYearCopy, undoCalendarPrint} from '@/lib/api'
import {queryKeys} from '@/lib/query-keys'
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'
import {useState} from 'react'
import {toast} from 'sonner'

function firstLine(title: string): string {
  return (
    title
      .split('\n')
      .find((l) => l.trim())
      ?.trim() ?? title
  )
}

function shortDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

export function YearCopyDialog({
  open,
  onOpenChange,
  toYear,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  toYear: number
}) {
  const fromYear = toYear - 1
  const queryClient = useQueryClient()
  const [result, setResult] = useState<YearCopyResult | null>(null)

  const close = () => {
    onOpenChange(false)
    setResult(null)
  }

  const previewQuery = useQuery({
    queryKey: queryKeys.calendarPrintYearCopyPreview(fromYear, toYear),
    queryFn: () => fetchYearCopyPreview(fromYear, toYear),
    enabled: open && !result,
  })

  const copyMutation = useMutation({
    mutationFn: () => runYearCopy(fromYear, toYear),
    onSuccess: (r) => {
      invalidateCalendarPrint(queryClient)
      setResult(r)
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const undoMutation = useMutation({
    mutationFn: undoCalendarPrint,
    onSuccess: (r) => {
      invalidateCalendarPrint(queryClient)
      toast.success(`Undid “${r.description}”`)
      close()
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const preview = previewQuery.data

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : close())}>
      <DialogContent className="!max-w-[min(96vw,560px)]">
        <DialogHeader>
          <DialogTitle>{result ? `${toYear} copied from ${fromYear}` : `Copy ${fromYear} into ${toYear}?`}</DialogTitle>
        </DialogHeader>

        {result ? (
          <div className="space-y-3 text-sm">
            <p>
              Placed {plural(result.copied, 'Event')} and {plural(result.overrides, 'Day Override')} on {toYear}'s
              calendar. Look it over month by month — fix a wrong date in the Event form, where its Repeats rule can be
              corrected too.
            </p>
            <ListSection
              title={`Not placed — the rule lands outside ${toYear}. Add these by hand:`}
              items={result.outOfYear.map((o) => `${firstLine(o.title)} → ${shortDate(o.date)}`)}
            />
            <ListSection
              title="Two Events now share a day but had different schedules — check these days:"
              items={result.conflicts.map((c) => `${shortDate(c.date)}: ${c.titles.map(firstLine).join(', ')}`)}
            />
            <ListSection title="Skipped (marked “Doesn't repeat”):" items={result.skipped.map(firstLine)} />
          </div>
        ) : !preview ? (
          <p className="text-sm text-muted-foreground">{previewQuery.isError ? 'Could not load.' : 'Checking…'}</p>
        ) : preview.sourceEvents === 0 ? (
          <p className="text-sm">{fromYear} has no Events to copy.</p>
        ) : (
          <div className="space-y-3 text-sm">
            <p>
              Places {plural(preview.toCopy, 'Event')} from {fromYear} on their {toYear} dates, keeping each on its
              weekday and moving holidays by their Repeats rule. Each day's schedule choices come along.
            </p>
            {(preview.existingEvents > 0 || preview.existingOverrides > 0) && (
              <p className="rounded-md border border-destructive/40 bg-destructive/5 p-2.5 text-destructive">
                This replaces {toYear}: {plural(preview.existingEvents, 'Event')} and{' '}
                {plural(preview.existingOverrides, 'Day Override')} already there will be deleted. Themes and verses
                you've typed stay.
              </p>
            )}
            <ListSection title="Skipped (marked “Doesn't repeat”):" items={preview.skipped.map(firstLine)} />
            <ListSection
              title={`Lands outside ${toYear} — will need placing by hand:`}
              items={preview.outOfYear.map((o) => `${firstLine(o.title)} → ${shortDate(o.date)}`)}
            />
            <p className="text-xs text-muted-foreground">You can undo the whole copy from History.</p>
          </div>
        )}

        <DialogFooter>
          {result ? (
            <>
              <Button variant="outline" onClick={() => undoMutation.mutate()} disabled={undoMutation.isPending}>
                Undo copy
              </Button>
              <Button onClick={close}>Done</Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={close}>
                Cancel
              </Button>
              <Button
                variant={preview && preview.existingEvents + preview.existingOverrides > 0 ? 'destructive' : 'default'}
                disabled={!preview || preview.sourceEvents === 0 || copyMutation.isPending}
                onClick={() => copyMutation.mutate()}
              >
                {preview && preview.existingEvents + preview.existingOverrides > 0
                  ? `Replace ${toYear}`
                  : `Copy into ${toYear}`}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ListSection({title, items}: {title: string; items: string[]}) {
  if (!items.length) return null
  return (
    <div className="space-y-1">
      <div className="font-medium">{title}</div>
      <ul className="list-disc pl-5 text-muted-foreground">
        {items.map((it, i) => (
          <li key={i}>{it}</li>
        ))}
      </ul>
    </div>
  )
}
