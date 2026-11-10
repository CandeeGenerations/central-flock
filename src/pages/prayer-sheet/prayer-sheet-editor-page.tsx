import {ColorSwatches} from '@/components/prayer-sheet/color-swatches'
import {
  HALF_SHEET_HEIGHT,
  HALF_SHEET_WIDTH,
  PrayerSheetBack,
  PrayerSheetFront,
} from '@/components/prayer-sheet/prayer-sheet-preview'
import {Button} from '@/components/ui/button'
import {DatePicker} from '@/components/ui/date-time-picker'
import {Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle} from '@/components/ui/dialog'
import {Input} from '@/components/ui/input'
import {Label} from '@/components/ui/label'
import {Sheet, SheetContent, SheetHeader, SheetTitle} from '@/components/ui/sheet'
import {PageSpinner} from '@/components/ui/spinner'
import {ZoomableImage} from '@/components/zoomable-image'
import {usePersistedState} from '@/hooks/use-persisted-state'
import type {PrayerSheetEdition, PrayerSheetEntry, PrayerSheetSunday} from '@/lib/api'
import {
  addPrayerSheetEntry,
  addPrayerSheetSunday,
  deletePrayerSheetEntry,
  deletePrayerSheetSunday,
  fetchPrayerSheetEdition,
  fetchPrayerSheetMinistryItems,
  fetchPrayerSheetSettings,
  updatePrayerSheetEdition,
  updatePrayerSheetEntry,
} from '@/lib/api'
import {queryKeys} from '@/lib/query-keys'
import {cn} from '@/lib/utils'
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'
import {ArrowLeft, ChevronLeft, ChevronRight, Columns2, Download, Eye, Plus, Trash2} from 'lucide-react'
import {useCallback, useEffect, useRef, useState} from 'react'
import {Link, useParams} from 'react-router-dom'
import {toast} from 'sonner'

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

function formatSundayHeading(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  return `Sunday, ${MONTH_NAMES[d.getMonth()]} ${d.getDate()}`
}

// ─── Inline entry list ────────────────────────────────────────────────────────

interface EntryListProps {
  sunday: PrayerSheetSunday
  /** Resolves to the new entry's id, or undefined if adding failed. */
  onAdd: (sundayId: number) => Promise<number | undefined>
  onUpdate: (id: number, text: string) => void
  onDelete: (id: number) => void
}

function focusAtEnd(el: HTMLInputElement) {
  el.focus()
  el.setSelectionRange(el.value.length, el.value.length)
}

function EntryList({sunday, onAdd, onUpdate, onDelete}: EntryListProps) {
  const inputRefs = useRef<Map<number, HTMLInputElement>>(new Map())
  // A new entry's field may mount after its add resolves (the refetch renders later),
  // so its id waits here and the field focuses itself when it mounts.
  const focusOnMount = useRef<number | null>(null)

  async function addAndFocus() {
    const newId = await onAdd(sunday.id)
    if (newId === undefined) return
    const el = inputRefs.current.get(newId)
    if (el) focusAtEnd(el)
    else focusOnMount.current = newId
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, entry: PrayerSheetEntry, idx: number) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      const next = sunday.entries[idx + 1]
      const nextEl = next && inputRefs.current.get(next.id)
      if (nextEl) focusAtEnd(nextEl)
      else void addAndFocus()
    } else if (e.key === 'Backspace' && e.currentTarget.value === '' && sunday.entries.length > 1) {
      e.preventDefault()
      onDelete(entry.id)
      const prevEntry = sunday.entries[idx - 1]
      if (prevEntry) {
        setTimeout(() => inputRefs.current.get(prevEntry.id)?.focus(), 0)
      }
    }
  }

  return (
    <div className="space-y-1.5">
      {sunday.entries.map((entry, idx) => (
        <div key={entry.id} className="flex items-center gap-1">
          <Input
            ref={(el) => {
              if (!el) {
                inputRefs.current.delete(entry.id)
                return
              }
              inputRefs.current.set(entry.id, el)
              if (focusOnMount.current === entry.id) {
                focusOnMount.current = null
                focusAtEnd(el)
              }
            }}
            className="h-8 flex-1"
            // Uncontrolled: the query cache notifies after the keystroke, and a controlled
            // value arriving that late resets the caret to the end of the field.
            defaultValue={entry.text}
            onChange={(e) => onUpdate(entry.id, e.target.value)}
            onKeyDown={(e) => handleKeyDown(e, entry, idx)}
            placeholder="Name – description"
          />
          <Button
            variant="ghost"
            size="icon-xs"
            className="text-muted-foreground hover:text-destructive shrink-0"
            onClick={() => onDelete(entry.id)}
            title="Remove entry"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}
      <div className="flex gap-2 pt-1">
        <button
          className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
          onClick={() => void addAndFocus()}
        >
          <Plus className="w-3 h-3" /> Add entry
        </button>
      </div>
    </div>
  )
}

// ─── Main editor ──────────────────────────────────────────────────────────────

// Scales the true-size sheet to fit its box both ways, keeping the 5.5×8.5 shape.
function FitSheet({children}: {children: React.ReactNode}) {
  const [box, setBox] = useState<HTMLDivElement | null>(null)
  const [scale, setScale] = useState(0.5)
  useEffect(() => {
    if (!box) return
    const observer = new ResizeObserver(() => {
      setScale(Math.max(0.2, Math.min(box.clientWidth / HALF_SHEET_WIDTH, box.clientHeight / HALF_SHEET_HEIGHT)))
    })
    observer.observe(box)
    return () => observer.disconnect()
  }, [box])

  return (
    <div ref={setBox} className="absolute inset-0 flex items-center justify-center">
      <div className="shrink-0 shadow-lg" style={{width: HALF_SHEET_WIDTH * scale, height: HALF_SHEET_HEIGHT * scale}}>
        <div
          style={{
            width: HALF_SHEET_WIDTH,
            height: HALF_SHEET_HEIGHT,
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
          }}
        >
          {children}
        </div>
      </div>
    </div>
  )
}

// Both halves' top bars share one height so the split lines up.
const BAR = 'flex h-14 shrink-0 items-center gap-2 border-b bg-background px-4'

export function PrayerSheetEditorPage() {
  const {id} = useParams<{id: string}>()
  const editionId = Number(id)
  const queryClient = useQueryClient()

  const [previewSide, setPreviewSide] = useState<'front' | 'back'>('front')
  const [previewOpen, setPreviewOpen] = useState(false)
  const [comparePhoto, setComparePhoto] = usePersistedState('prayer-sheet:compare-photo', true)
  const [addSundayOpen, setAddSundayOpen] = useState(false)
  const [newSundayDate, setNewSundayDate] = useState('')

  const {data: edition, isLoading} = useQuery({
    queryKey: queryKeys.prayerSheetEdition(editionId),
    queryFn: () => fetchPrayerSheetEdition(editionId),
  })
  const {data: settings} = useQuery({
    queryKey: queryKeys.prayerSheetSettings,
    queryFn: fetchPrayerSheetSettings,
  })
  const {data: ministryItems = []} = useQuery({
    queryKey: queryKeys.prayerSheetMinistryItems,
    queryFn: fetchPrayerSheetMinistryItems,
  })

  // Entry typing edits the cached edition directly (instant input and live preview) and
  // saves after a pause. Pending saves are flushed before any refetch so a reload can't
  // bring back the server's older text.
  const pendingSaves = useRef(new Map<number, {timer: ReturnType<typeof setTimeout>; text: string}>())

  const flushEntrySaves = useCallback(async () => {
    const saves = [...pendingSaves.current].map(([entryId, pending]) => {
      clearTimeout(pending.timer)
      return updatePrayerSheetEntry(entryId, {text: pending.text})
    })
    pendingSaves.current.clear()
    try {
      await Promise.all(saves)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save entry')
    }
  }, [])

  useEffect(() => () => void flushEntrySaves(), [flushEntrySaves])

  function editEntryText(entryId: number, text: string) {
    queryClient.setQueryData<PrayerSheetEdition>(queryKeys.prayerSheetEdition(editionId), (old) =>
      old
        ? {
            ...old,
            sundays: old.sundays.map((s) => ({
              ...s,
              entries: s.entries.map((e) => (e.id === entryId ? {...e, text} : e)),
            })),
          }
        : old,
    )
    const previous = pendingSaves.current.get(entryId)
    if (previous) clearTimeout(previous.timer)
    pendingSaves.current.set(entryId, {text, timer: setTimeout(() => void flushEntrySaves(), 500)})
  }

  const invalidate = useCallback(async () => {
    await flushEntrySaves()
    // The editions table shows color, Sunday and entry counts, so it goes stale too.
    queryClient.invalidateQueries({queryKey: ['prayerSheetEditions']})
    queryClient.invalidateQueries({queryKey: queryKeys.prayerSheetEditionYears})
    return queryClient.invalidateQueries({queryKey: queryKeys.prayerSheetEdition(editionId)})
  }, [queryClient, editionId, flushEntrySaves])

  const updateEdition = useMutation({
    mutationFn: (data: Parameters<typeof updatePrayerSheetEdition>[1]) => updatePrayerSheetEdition(editionId, data),
    onSuccess: () => invalidate(),
  })

  const addSunday = useMutation({
    mutationFn: (date: string) => addPrayerSheetSunday(editionId, date),
    onSuccess: () => {
      invalidate()
      setAddSundayOpen(false)
      setNewSundayDate('')
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed to add Sunday'),
  })

  const removeSunday = useMutation({
    mutationFn: deletePrayerSheetSunday,
    onSuccess: () => invalidate(),
  })

  const addEntry = useMutation({
    mutationFn: (sundayId: number) => addPrayerSheetEntry(sundayId, ''),
    onSuccess: () => invalidate(),
  })

  const deleteEntry = useMutation({
    mutationFn: deletePrayerSheetEntry,
    onSuccess: () => invalidate(),
  })

  async function handleExportPdf() {
    if (!edition || !settings) return
    const {toCanvas} = await import('html-to-image')
    const {jsPDF} = await import('jspdf')

    const frontEl = document.getElementById('prayer-sheet-front-capture')
    const backEl = document.getElementById('prayer-sheet-back-capture')
    if (!frontEl || !backEl) return

    toast.info('Generating PDF…')

    // 11" × 8.5" landscape in mm
    const doc = new jsPDF({orientation: 'landscape', unit: 'mm', format: 'letter'})
    const pageW = 279.4
    const halfW = pageW / 2
    const pageH = 215.9

    // Page 1: two fronts
    const frontCanvas = await toCanvas(frontEl, {pixelRatio: 2})
    const frontImg = frontCanvas.toDataURL('image/jpeg', 0.95)
    doc.addImage(frontImg, 'JPEG', 0, 0, halfW, pageH)
    doc.addImage(frontImg, 'JPEG', halfW, 0, halfW, pageH)

    // Page 2: two backs
    doc.addPage()
    const backCanvas = await toCanvas(backEl, {pixelRatio: 2})
    const backImg = backCanvas.toDataURL('image/jpeg', 0.95)
    doc.addImage(backImg, 'JPEG', 0, 0, halfW, pageH)
    doc.addImage(backImg, 'JPEG', halfW, 0, halfW, pageH)

    const latestDate = edition.sundays[edition.sundays.length - 1]?.sundayDate ?? 'unknown'
    doc.save(`prayer-sheet-${latestDate}.pdf`)
  }

  if (isLoading || !edition || !settings) return <PageSpinner />

  const splitAt = edition.columnSplit ?? Math.ceil(edition.sundays.length / 2)
  const showPhoto = comparePhoto && !!edition.sourcePhotoPath
  const latestSunday = edition.sundays[edition.sundays.length - 1]?.sundayDate
  const titleDate = latestSunday
    ? new Date(latestSunday + 'T12:00:00').toLocaleDateString('en-US', {month: 'long', day: 'numeric', year: 'numeric'})
    : 'Prayer Sheet'

  return (
    // The shell's <main> pads its bottom (pb-48 for the phone tab bar, md:pb-8); grow into that
    // padding and cancel it with a matching negative margin so this full-height editor leaves no
    // empty band. On a phone the editor pads its own scroll instead so the last entry clears the tab bar.
    <div className="-mb-48 flex h-[calc(100%+12rem)] overflow-hidden md:-mb-8 md:h-[calc(100%+2rem)]">
      {/* ── Left: editor ── */}
      <div
        className={cn(
          'flex w-full shrink-0 flex-col overflow-y-auto pb-48 md:border-r md:pb-0',
          showPhoto ? 'md:w-1/4 md:min-w-[300px]' : 'md:w-2/5 md:min-w-[340px]',
        )}
      >
        {/* Header */}
        <div className={cn(BAR, 'sticky top-0 z-10')}>
          <Button variant="ghost" size="icon" aria-label="Back" asChild>
            <Link to="/prayer-sheet">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <h2 className="min-w-0 truncate text-2xl font-bold">{titleDate}</h2>
          <Button
            size="sm"
            variant="outline"
            className="ml-auto shrink-0 md:hidden"
            aria-label="Preview"
            onClick={() => setPreviewOpen(true)}
          >
            <Eye className="h-4 w-4 sm:mr-1" />
            <span className="hidden sm:inline">Preview</span>
          </Button>
          <Button size="sm" className="shrink-0 md:ml-auto" aria-label="Download" onClick={handleExportPdf}>
            <Download className="h-4 w-4 sm:mr-1" />
            <span className="hidden sm:inline">Download</span>
          </Button>
        </div>

        {/* Color picker */}
        <div className="px-4 py-3 border-b space-y-2">
          <Label className="text-xs text-muted-foreground">Theme color</Label>
          <ColorSwatches value={edition.themeColor} onChange={(themeColor) => updateEdition.mutate({themeColor})} />
        </div>

        {/* Column split control */}
        {edition.sundays.length > 2 && (
          <div className="px-4 py-2 border-b flex items-center gap-2 text-sm">
            <span className="text-muted-foreground text-xs">Column split:</span>
            <button
              className="p-0.5 hover:bg-muted rounded"
              disabled={splitAt <= 1}
              onClick={() => updateEdition.mutate({columnSplit: splitAt - 1})}
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-xs font-mono w-12 text-center">
              {splitAt} / {edition.sundays.length - splitAt}
            </span>
            <button
              className="p-0.5 hover:bg-muted rounded"
              disabled={splitAt >= edition.sundays.length - 1}
              onClick={() => updateEdition.mutate({columnSplit: splitAt + 1})}
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            {edition.columnSplit !== null && (
              <button
                className="text-xs text-muted-foreground hover:text-foreground ml-1"
                onClick={() => updateEdition.mutate({columnSplit: null})}
              >
                Reset
              </button>
            )}
          </div>
        )}

        {/* Sunday groupings */}
        <div className="flex-1 px-4 py-3 space-y-4">
          {edition.sundays.map((sunday) => (
            <div key={sunday.id} className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold underline">{formatSundayHeading(sunday.sundayDate)}</span>
                <button
                  className="text-xs text-muted-foreground hover:text-destructive"
                  onClick={() => {
                    if (confirm(`Remove ${formatSundayHeading(sunday.sundayDate)}?`)) {
                      removeSunday.mutate(sunday.id)
                    }
                  }}
                >
                  Remove
                </button>
              </div>
              <EntryList
                sunday={sunday}
                onAdd={(sundayId) =>
                  addEntry.mutateAsync(sundayId).then(
                    (entry) => entry.id,
                    (e: unknown) => {
                      toast.error(e instanceof Error ? e.message : 'Failed to add entry')
                      return undefined
                    },
                  )
                }
                onUpdate={editEntryText}
                onDelete={(entryId) => deleteEntry.mutate(entryId)}
              />
            </div>
          ))}

          <Button variant="outline" size="sm" className="w-full" onClick={() => setAddSundayOpen(true)}>
            <Plus className="w-4 h-4 mr-1" />
            Add Sunday
          </Button>
        </div>
      </div>

      {/* ── Right: preview (a full-screen sheet on a phone, below) ── */}
      <div className="bg-muted/30 hidden flex-1 flex-col overflow-hidden md:flex">
        <div className={BAR}>
          {(
            [
              ['front', 'Front'],
              ['back', 'Back'],
            ] as const
          ).map(([side, label]) => (
            <Button
              key={side}
              size="sm"
              variant={previewSide === side ? 'default' : 'outline'}
              onClick={() => setPreviewSide(side)}
            >
              {label}
            </Button>
          ))}
          {edition.sourcePhotoPath && (
            <Button
              size="sm"
              aria-pressed={comparePhoto}
              variant={comparePhoto ? 'default' : 'outline'}
              className="ml-auto"
              onClick={() => setComparePhoto(!comparePhoto)}
            >
              <Columns2 className="mr-1 h-4 w-4" />
              Compare with photo
            </Button>
          )}
        </div>

        <div className="flex min-h-0 flex-1 gap-4 p-6">
          {/* While comparing, sheet and photo split the remaining 75% as 40:35. */}
          <div className="relative min-w-0 flex-[40]">
            <FitSheet>
              {previewSide === 'back' ? (
                <PrayerSheetBack ministryItems={ministryItems} themeColor={edition.themeColor} />
              ) : (
                <PrayerSheetFront edition={edition} settings={settings} />
              )}
            </FitSheet>
          </div>
          {showPhoto && edition.sourcePhotoPath && (
            <ZoomableImage
              src={edition.sourcePhotoPath}
              alt="Photo this edition was imported from"
              className="min-w-0 flex-[35] rounded border"
            />
          )}
        </div>

        {/* Hidden capture targets for PDF export (full-size, off-screen) */}
        <div
          style={{
            position: 'fixed',
            left: -9999,
            top: 0,
            pointerEvents: 'none',
          }}
        >
          <div id="prayer-sheet-front-capture">
            <PrayerSheetFront edition={edition} settings={settings} />
          </div>
          <div id="prayer-sheet-back-capture">
            <PrayerSheetBack ministryItems={ministryItems} themeColor={edition.themeColor} />
          </div>
        </div>
      </div>

      <Sheet open={previewOpen} onOpenChange={setPreviewOpen}>
        <SheetContent side="bottom" className="gap-0 p-0 data-[side=bottom]:h-[92dvh]">
          <SheetHeader className="flex-row items-center gap-2 border-b px-4 py-3">
            <SheetTitle className="sr-only">Preview</SheetTitle>
            {(
              [
                ['front', 'Front'],
                ['back', 'Back'],
              ] as const
            ).map(([side, label]) => (
              <Button
                key={side}
                size="sm"
                variant={previewSide === side ? 'default' : 'outline'}
                onClick={() => setPreviewSide(side)}
              >
                {label}
              </Button>
            ))}
          </SheetHeader>
          <div className="bg-muted/30 relative min-h-0 flex-1 p-4">
            {previewOpen ? (
              <FitSheet>
                {previewSide === 'back' ? (
                  <PrayerSheetBack ministryItems={ministryItems} themeColor={edition.themeColor} />
                ) : (
                  <PrayerSheetFront edition={edition} settings={settings} />
                )}
              </FitSheet>
            ) : null}
          </div>
        </SheetContent>
      </Sheet>

      {/* Add Sunday dialog */}
      <Dialog open={addSundayOpen} onOpenChange={setAddSundayOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Sunday</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label>Sunday date</Label>
            <DatePicker value={newSundayDate} onChange={setNewSundayDate} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddSundayOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => newSundayDate && addSunday.mutate(newSundayDate)}
              disabled={!newSundayDate || addSunday.isPending}
            >
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
