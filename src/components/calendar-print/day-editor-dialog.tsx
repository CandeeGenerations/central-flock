import {parseScheduleLine, weekdaySlug} from '@/components/calendar-print/calendar-grid'
import {Button} from '@/components/ui/button'
import {Checkbox} from '@/components/ui/checkbox'
import {Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle} from '@/components/ui/dialog'
import type {CalendarPrintEvent, NormalScheduleItem} from '@/lib/api'
import {Copy, Pencil, Plus, Trash2} from 'lucide-react'
import {useMemo, useState} from 'react'

function styleBadgeColor(style: string) {
  if (style === 'bold') return 'bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-100'
  if (style === 'no_kaya') return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-100'
  return 'bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-100'
}

function parseIso(date: string): Date {
  // Construct a local-date Date for the YYYY-MM-DD string (avoids UTC offset surprises).
  const [y, m, d] = date.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function formatLong(date: string): string {
  return parseIso(date).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  date: string | null
  monthLabel: string // "May" — for the "Apply to all Sundays in May" button
  dayEvents: CalendarPrintEvent[]
  scheduleItems: NormalScheduleItem[]
  // null = no override row yet (cell shows default "Normal Schedule" label).
  // [] = explicit empty override (cell shows nothing or label depending on showNormalScheduleLabel).
  // number[] = explicit selection.
  inlineItemIds: number[] | null
  showNoKaya: boolean
  showNormalScheduleLabel: boolean
  hasOverride: boolean
  onAddEvent: () => void
  onEditEvent: (event: CalendarPrintEvent) => void
  onDuplicateEvent: (event: CalendarPrintEvent) => void
  onDeleteEvent: (event: CalendarPrintEvent) => void
  onSaveInlineSelection: (ids: number[], showNoKaya: boolean, showNormalScheduleLabel: boolean) => void
  onApplyToAll: (ids: number[], showNoKaya: boolean, showNormalScheduleLabel: boolean) => void
  onUseDefaultLabel: () => void
  isSavingInline: boolean
}

export function DayEditorDialog({
  open,
  onOpenChange,
  date,
  monthLabel,
  dayEvents,
  scheduleItems,
  inlineItemIds,
  showNoKaya,
  showNormalScheduleLabel,
  hasOverride,
  onAddEvent,
  onEditEvent,
  onDuplicateEvent,
  onDeleteEvent,
  onSaveInlineSelection,
  onApplyToAll,
  onUseDefaultLabel,
  isSavingInline,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!max-w-[min(96vw,720px)] sm:!max-w-[min(96vw,720px)]">
        <DialogHeader>
          <DialogTitle>{date ? formatLong(date) : 'Day'}</DialogTitle>
        </DialogHeader>
        {open && date && (
          <DayEditorBody
            date={date}
            monthLabel={monthLabel}
            dayEvents={dayEvents}
            scheduleItems={scheduleItems}
            inlineItemIds={inlineItemIds}
            showNoKayaInitial={showNoKaya}
            showNormalScheduleLabelInitial={showNormalScheduleLabel}
            hasOverride={hasOverride}
            onAddEvent={onAddEvent}
            onEditEvent={onEditEvent}
            onDuplicateEvent={onDuplicateEvent}
            onDeleteEvent={onDeleteEvent}
            onSaveInlineSelection={onSaveInlineSelection}
            onApplyToAll={onApplyToAll}
            onUseDefaultLabel={onUseDefaultLabel}
            isSavingInline={isSavingInline}
            onClose={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function DayEditorBody({
  date,
  monthLabel,
  dayEvents,
  scheduleItems,
  inlineItemIds,
  showNoKayaInitial,
  showNormalScheduleLabelInitial,
  hasOverride,
  onAddEvent,
  onEditEvent,
  onDuplicateEvent,
  onDeleteEvent,
  onSaveInlineSelection,
  onApplyToAll,
  onUseDefaultLabel,
  isSavingInline,
  onClose,
}: {
  date: string
  monthLabel: string
  dayEvents: CalendarPrintEvent[]
  scheduleItems: NormalScheduleItem[]
  inlineItemIds: number[] | null
  showNoKayaInitial: boolean
  showNormalScheduleLabelInitial: boolean
  hasOverride: boolean
  onAddEvent: () => void
  onEditEvent: (event: CalendarPrintEvent) => void
  onDuplicateEvent: (event: CalendarPrintEvent) => void
  onDeleteEvent: (event: CalendarPrintEvent) => void
  onSaveInlineSelection: (ids: number[], showNoKaya: boolean, showNormalScheduleLabel: boolean) => void
  onApplyToAll: (ids: number[], showNoKaya: boolean, showNormalScheduleLabel: boolean) => void
  onUseDefaultLabel: () => void
  isSavingInline: boolean
  onClose: () => void
}) {
  const dow = parseIso(date).getDay()
  const slug = weekdaySlug(dow)

  const eligibleItems = useMemo(
    () =>
      scheduleItems.filter((it) => it.type === 'line' && (slug ? it.eligibleDays.split(',').includes(slug) : false)),
    [scheduleItems, slug],
  )

  // Seed state: null = no override yet → default to all-checked; array (even empty) =
  // explicit saved state → load verbatim.
  const [picked, setPicked] = useState<Set<number>>(() =>
    inlineItemIds === null ? new Set(eligibleItems.map((it) => it.id)) : new Set(inlineItemIds),
  )
  const [showNoKaya, setShowNoKaya] = useState<boolean>(showNoKayaInitial)
  const [showLabel, setShowLabel] = useState<boolean>(showNormalScheduleLabelInitial)

  const toggle = (id: number) => {
    setPicked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  const resetToDefault = () => setPicked(new Set(eligibleItems.map((it) => it.id)))
  const clearAll = () => setPicked(new Set())

  // Return picked ids in the master schedule's own order, not click order.
  const pickedArray = () => eligibleItems.filter((it) => picked.has(it.id)).map((it) => it.id)

  const slotDayLabel = slug === 'sun' ? 'Sundays' : slug === 'wed' ? 'Wednesdays' : slug === 'sat' ? 'Saturdays' : ''

  const overflowTone =
    picked.size <= 3
      ? {text: 'fits comfortably', color: 'text-emerald-700 dark:text-emerald-300'}
      : picked.size === 4
        ? {text: 'tight on space', color: 'text-amber-700 dark:text-amber-300'}
        : {text: 'may clip on print', color: 'text-red-700 dark:text-red-300'}

  return (
    <div className="space-y-4">
      {/* Events section */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Events</h3>
          <Button size="sm" variant="outline" onClick={onAddEvent}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Add event
          </Button>
        </div>
        {dayEvents.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">No events on this day.</p>
        ) : (
          <div className="space-y-1.5">
            {dayEvents.map((event) => (
              <div key={event.id} className="flex items-start gap-2 p-2 rounded-md border bg-card text-sm">
                <span
                  className={`px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase ${styleBadgeColor(event.style)}`}
                >
                  {event.style.replace('_', ' ')}
                </span>
                <span className="flex-1 break-words">
                  {event.title || <span className="italic text-muted-foreground">NO KAYA or Choir</span>}
                </span>
                <button
                  type="button"
                  className="opacity-60 hover:opacity-100"
                  title="Edit"
                  onClick={() => onEditEvent(event)}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  className="opacity-60 hover:opacity-100"
                  title="Duplicate"
                  onClick={() => onDuplicateEvent(event)}
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  className="opacity-60 hover:opacity-100 text-destructive"
                  title="Delete"
                  onClick={() => onDeleteEvent(event)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Inline Schedule section — Sun/Wed/Sat only */}
      {slug && (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold">
            Inline Schedule{' '}
            <span className="text-xs font-normal text-muted-foreground">(overrides "Normal Schedule" label)</span>
          </h3>
          {eligibleItems.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">
              No schedule items are eligible for {slotDayLabel}. Edit the master schedule to add some.
            </p>
          ) : (
            <>
              <div className="space-y-1 max-h-64 overflow-auto pr-1">
                {eligibleItems.map((item) => {
                  const checked = picked.has(item.id)
                  return (
                    <label
                      key={item.id}
                      className="flex items-start gap-2 p-1.5 rounded hover:bg-muted/40 cursor-pointer"
                    >
                      <Checkbox checked={checked} onCheckedChange={() => toggle(item.id)} aria-label={item.text} />
                      <div className="flex-1 text-sm">
                        {parseScheduleLine(item.text).map((seg, j) => (
                          <span key={j} style={{fontWeight: seg.bold || item.bold ? 700 : 400}}>
                            {seg.text}
                          </span>
                        ))}
                        <span className="ml-2 text-[10px] uppercase text-muted-foreground">
                          {item.bold ? 'bold · ' : ''}col {item.column}
                        </span>
                      </div>
                    </label>
                  )
                })}
              </div>
              <div className="text-xs flex items-center justify-between">
                <span className={overflowTone.color}>
                  {picked.size} of {eligibleItems.length} selected — {overflowTone.text}
                </span>
                <div className="flex gap-3">
                  <button
                    type="button"
                    className="underline text-muted-foreground hover:text-foreground"
                    onClick={resetToDefault}
                  >
                    Reset to default
                  </button>
                  <button
                    type="button"
                    className="underline text-muted-foreground hover:text-foreground"
                    onClick={clearAll}
                  >
                    Clear
                  </button>
                </div>
              </div>
              {picked.size === 0 && (
                <label className="flex items-center gap-2 text-xs cursor-pointer pt-1">
                  <Checkbox
                    checked={showLabel}
                    onCheckedChange={(v) => setShowLabel(!!v)}
                    aria-label="Show Normal Schedule label"
                  />
                  <span>
                    Show <em>Normal Schedule</em> label (when nothing is selected)
                  </span>
                </label>
              )}
            </>
          )}
        </section>
      )}

      {/* NO KAYA or Choir flag — Sundays only */}
      {slug === 'sun' && (
        <section className="space-y-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <Checkbox
              checked={showNoKaya}
              onCheckedChange={(v) => setShowNoKaya(!!v)}
              aria-label="Show NO KAYA or Choir"
            />
            <span className="text-sm">
              Show <span className="font-semibold text-pink-700 dark:text-pink-300">NO KAYA or Choir</span> on this day
            </span>
          </label>
        </section>
      )}

      <DialogFooter className="gap-2 flex-wrap">
        <Button variant="outline" onClick={onClose} disabled={isSavingInline}>
          Cancel
        </Button>
        {hasOverride && (
          <Button variant="outline" onClick={onUseDefaultLabel} disabled={isSavingInline}>
            Use default label
          </Button>
        )}
        {slug && eligibleItems.length > 0 && (
          <Button
            variant="outline"
            onClick={() => onApplyToAll(pickedArray(), showNoKaya, showLabel)}
            disabled={isSavingInline}
          >
            Apply to all {slotDayLabel} in {monthLabel}
          </Button>
        )}
        <Button onClick={() => onSaveInlineSelection(pickedArray(), showNoKaya, showLabel)} disabled={isSavingInline}>
          Save
        </Button>
      </DialogFooter>
    </div>
  )
}
