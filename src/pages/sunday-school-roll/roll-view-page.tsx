import {ScaledPage, type ZoomMode} from '@/components/print/scaled-page'
import {RollRowOverlay} from '@/components/sunday-school-roll/roll-row-overlay'
import {RollSheetPage} from '@/components/sunday-school-roll/roll-sheet-page'
import {Button} from '@/components/ui/button'
import {Card, CardContent} from '@/components/ui/card'
import {Input} from '@/components/ui/input'
import {PageSpinner} from '@/components/ui/spinner'
import {UnsavedChangesDialog} from '@/components/unsaved-changes-dialog'
import {useUnsavedChanges} from '@/hooks/use-unsaved-changes'
import {exportFixedPagePdf} from '@/lib/fixed-page-pdf'
import {fetchSchedulesSettings, schedulesKeys} from '@/lib/schedules-api'
import {
  type RollSheet,
  deleteSundaySchoolRoll,
  fetchSundaySchoolRoll,
  saveRollSheets,
  sundaySchoolRollKeys,
  updateSundaySchoolRoll,
} from '@/lib/sunday-school-roll-api'
import {
  type Quarter,
  ROLL_ROW_COUNT,
  quarterSlug,
  quarterTitleLabel,
  scholarCount,
  scholarLines,
  sheetPageCount,
  sortScholars,
  sundaysInQuarter,
} from '@/lib/sunday-school-roll-core'
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'
import {
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  ArrowUpAZ,
  Download,
  Lock,
  LockOpen,
  Plus,
  Save,
  Trash2,
} from 'lucide-react'
import {useEffect, useRef, useState} from 'react'
import {useNavigate, useParams} from 'react-router-dom'
import {toast} from 'sonner'

const ZOOMS: {value: ZoomMode; label: string}[] = [
  {value: 'fit', label: 'Fit'},
  {value: 1, label: '100%'},
  {value: 1.5, label: '150%'},
]

type SheetDraft = {label: string; scholars: string}

const toDraft = (sheets: RollSheet[]): SheetDraft[] => sheets.map((s) => ({label: s.label, scholars: s.scholars}))

/** Row index -> text, for the rows one printed page covers. */
function rowsForOverlay(scholars: string, page: number): Record<number, string> {
  const lines = scholarLines(scholars)
  const out: Record<number, string> = {}
  for (let i = 0; i < ROLL_ROW_COUNT; i++) {
    const row = page * ROLL_ROW_COUNT + i
    out[row] = lines[row] ?? ''
  }
  return out
}

/** Write one row back into the roster, growing the line list to reach it. */
function withRow(scholars: string, row: number, value: string): string {
  const lines = scholarLines(scholars)
  while (lines.length <= row) lines.push('')
  lines[row] = value
  while (lines.length && lines[lines.length - 1].trim() === '') lines.pop()
  return lines.join('\n')
}

export function RollViewPage() {
  const {id} = useParams<{id: string}>()
  const rollId = Number(id)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [zoom, setZoom] = useState<ZoomMode>('fit')
  const [editMode, setEditMode] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [drafts, setDrafts] = useState<SheetDraft[] | null>(null)
  const [focus, setFocus] = useState<{sheet: number; row: number} | null>(null)
  // One ref per printed page, in PDF order. Rebuilt every render.
  const pageRefs = useRef<(HTMLDivElement | null)[]>([])

  const {data: roll, isLoading} = useQuery({
    queryKey: sundaySchoolRollKeys.detail(rollId),
    queryFn: () => fetchSundaySchoolRoll(rollId),
    enabled: Number.isFinite(rollId),
  })
  const {data: settings} = useQuery({queryKey: schedulesKeys.settings, queryFn: fetchSchedulesSettings})

  // Reseed the working copy whenever the server row changes. Same pattern as
  // the Music Schedule service editor.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setDrafts(roll ? toDraft(roll.sheets) : null), [roll])

  const save = useMutation({
    mutationFn: (sheets: SheetDraft[]) => saveRollSheets(rollId, sheets),
    onSuccess: () => {
      queryClient.invalidateQueries({queryKey: sundaySchoolRollKeys.all})
      toast.success('Saved')
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed to save'),
  })

  const patch = useMutation({
    mutationFn: (body: {status?: 'draft' | 'final'}) => updateSundaySchoolRoll(rollId, body),
    onSuccess: () => queryClient.invalidateQueries({queryKey: sundaySchoolRollKeys.all}),
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed to update'),
  })

  const remove = useMutation({
    mutationFn: () => deleteSundaySchoolRoll(rollId),
    onSuccess: () => {
      queryClient.invalidateQueries({queryKey: sundaySchoolRollKeys.all})
      navigate('/schedules/sunday-school-rolls')
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed to delete'),
  })

  const dirty = !!roll && !!drafts && JSON.stringify(drafts) !== JSON.stringify(toDraft(roll.sheets))
  const blocker = useUnsavedChanges(dirty)

  if (isLoading || !roll || !settings || !drafts) return <PageSpinner />

  const quarter = roll.quarter as Quarter
  const dates = sundaysInQuarter(roll.year, quarter)
  const titlePrefix = settings.sundaySchoolRoll.titlePrefix
  const locked = roll.status === 'final' || !editMode

  const patchSheet = (i: number, next: Partial<SheetDraft>) =>
    setDrafts((prev) => prev!.map((s, j) => (j === i ? {...s, ...next} : s)))

  const moveSheet = (i: number, delta: number) =>
    setDrafts((prev) => {
      const next = [...prev!]
      const target = i + delta
      if (target < 0 || target >= next.length) return prev
      ;[next[i], next[target]] = [next[target], next[i]]
      return next
    })

  // Flat list of every printed page, in PDF order. A sheet contributes more
  // than one only when its roster outgrows the grid.
  const printedPages = drafts.flatMap((sheet, sheetIndex) =>
    Array.from({length: sheetPageCount(sheet.scholars)}, (_, page) => ({sheet, sheetIndex, page})),
  )
  const registerPage = (index: number) => (node: HTMLDivElement | null) => {
    pageRefs.current[index] = node
  }
  const overflowing = drafts.filter((s) => sheetPageCount(s.scholars) > 1)

  return (
    <div className="space-y-6 p-4 md:p-8">
      <UnsavedChangesDialog blocker={blocker} onSave={() => save.mutateAsync(drafts)} what="your edits to this roll" />

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => navigate('/schedules/sunday-school-rolls')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h2 className="text-2xl font-bold">{quarterTitleLabel(roll.year, quarter)}</h2>
        <span
          className={
            roll.status === 'final'
              ? 'rounded bg-green-100 px-2 py-0.5 text-xs text-green-800'
              : 'bg-muted rounded px-2 py-0.5 text-xs'
          }
        >
          {roll.status}
        </span>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="flex gap-1">
            {ZOOMS.map((z) => (
              <Button
                key={String(z.value)}
                size="sm"
                variant={zoom === z.value ? 'default' : 'outline'}
                onClick={() => setZoom(z.value)}
              >
                {z.label}
              </Button>
            ))}
          </div>
          <Button size="sm" disabled={!dirty || save.isPending} onClick={() => save.mutate(drafts)}>
            <Save className="mr-1 h-4 w-4" />
            {save.isPending ? 'Saving…' : 'Save'}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={exporting}
            onClick={async () => {
              const nodes = pageRefs.current.slice(0, printedPages.length).filter((n): n is HTMLDivElement => !!n)
              if (nodes.length !== printedPages.length) return
              setExporting(true)
              try {
                await exportFixedPagePdf(nodes, `attendance-${quarterSlug(roll.year, quarter)}`, 'landscape')
              } catch (e) {
                toast.error(e instanceof Error ? e.message : 'Export failed')
              } finally {
                setExporting(false)
              }
            }}
          >
            <Download className="mr-1 h-4 w-4" />
            {exporting ? 'Exporting…' : 'PDF'}
          </Button>
          <Button size="sm" variant={editMode ? 'default' : 'outline'} onClick={() => setEditMode((v) => !v)}>
            {editMode ? 'Editing' : 'Edit'}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => patch.mutate({status: roll.status === 'final' ? 'draft' : 'final'})}
          >
            {roll.status === 'final' ? (
              <>
                <LockOpen className="mr-1 h-4 w-4" />
                Reopen
              </>
            ) : (
              <>
                <Lock className="mr-1 h-4 w-4" />
                Finalize
              </>
            )}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              if (confirm(`Delete the ${quarterTitleLabel(roll.year, quarter)} roll? This cannot be undone.`))
                remove.mutate()
            }}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Sheet index — jump between the sheets without scrolling five pages. */}
      <div className="bg-background/95 sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b py-3 text-sm backdrop-blur">
        {drafts.map((s, i) => (
          <a
            key={i}
            href={`#roll-sheet-${i}`}
            className="hover:bg-muted rounded px-2 py-1"
            onClick={(e) => {
              e.preventDefault()
              document.getElementById(`roll-sheet-${i}`)?.scrollIntoView({behavior: 'smooth', block: 'start'})
            }}
          >
            {s.label || `Sheet ${i + 1}`}
            <span className="text-muted-foreground ml-1">({scholarCount(s.scholars)})</span>
          </a>
        ))}
        <span className="text-muted-foreground ml-auto">
          {printedPages.length} page{printedPages.length === 1 ? '' : 's'} · {dates.length} Sundays
        </span>
        {!locked && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setDrafts((prev) => [...prev!, {label: '', scholars: ''}])}
          >
            <Plus className="mr-1 h-4 w-4" />
            Add sheet
          </Button>
        )}
      </div>

      {overflowing.length > 0 && (
        <div className="flex items-start gap-2 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            {overflowing.map((s) => (
              <div key={s.label}>
                <strong>{s.label || 'Untitled sheet'}</strong> has {scholarCount(s.scholars)} names — more than the{' '}
                {ROLL_ROW_COUNT} rows on a sheet, so it prints on {sheetPageCount(s.scholars)} pages.
              </div>
            ))}
            <div className="mt-1">The PDF will be {printedPages.length} pages. Split the class to keep it to one.</div>
          </div>
        </div>
      )}

      <div className="mx-auto max-w-[1400px] space-y-8">
        {drafts.map((sheet, sheetIndex) => (
          <Card key={sheetIndex} id={`roll-sheet-${sheetIndex}`} className="scroll-mt-20 gap-0 overflow-hidden py-0">
            <div className="flex flex-wrap items-center gap-2 border-b px-6 py-4">
              <Input
                value={sheet.label}
                disabled={locked}
                placeholder="Class — e.g. 3 yrs - Kindergarten"
                className="max-w-xs"
                onChange={(e) => patchSheet(sheetIndex, {label: e.target.value})}
              />
              <span className="text-muted-foreground text-sm">{scholarCount(sheet.scholars)} names</span>
              {!locked && (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => patchSheet(sheetIndex, {scholars: sortScholars(sheet.scholars)})}
                  >
                    <ArrowUpAZ className="mr-1 h-4 w-4" />
                    Sort A–Z
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    disabled={sheetIndex === 0}
                    onClick={() => moveSheet(sheetIndex, -1)}
                  >
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    disabled={sheetIndex === drafts.length - 1}
                    onClick={() => moveSheet(sheetIndex, 1)}
                  >
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => {
                      if (confirm(`Remove the "${sheet.label || 'untitled'}" sheet from this roll?`))
                        setDrafts((prev) => prev!.filter((_, j) => j !== sheetIndex))
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </>
              )}
            </div>

            <CardContent className="space-y-6 p-6 md:p-8">
              {Array.from({length: sheetPageCount(sheet.scholars)}, (_, page) => {
                const flatIndex = printedPages.findIndex((p) => p.sheetIndex === sheetIndex && p.page === page)
                return (
                  <RollPage
                    key={page}
                    registerPage={registerPage(flatIndex)}
                    titlePrefix={titlePrefix}
                    year={roll.year}
                    quarter={quarter}
                    sheet={sheet}
                    page={page}
                    dates={dates}
                    logoPath={settings.logoPath}
                    zoom={zoom}
                    locked={locked}
                    focusRow={focus?.sheet === sheetIndex ? focus.row : null}
                    onFocusRow={(row) => setFocus(row == null ? null : {sheet: sheetIndex, row})}
                    onRowChange={(row, value) =>
                      patchSheet(sheetIndex, {scholars: withRow(sheet.scholars, row, value)})
                    }
                  />
                )
              })}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}

/** One printed page plus, when editing, the inputs laid over its Name column. */
function RollPage({
  registerPage,
  titlePrefix,
  year,
  quarter,
  sheet,
  page,
  dates,
  logoPath,
  zoom,
  locked,
  focusRow,
  onFocusRow,
  onRowChange,
}: {
  /** Hands this page's node to the parent, in PDF order, for the export. */
  registerPage: (node: HTMLDivElement | null) => void
  titlePrefix: string
  year: number
  quarter: Quarter
  sheet: SheetDraft
  page: number
  dates: string[]
  logoPath: string | null
  zoom: ZoomMode
  locked: boolean
  focusRow: number | null
  onFocusRow: (row: number | null) => void
  onRowChange: (row: number, value: string) => void
}) {
  const localRef = useRef<HTMLDivElement>(null)

  return (
    <ScaledPage zoom={zoom} orientation="landscape">
      <div className="relative">
        <RollSheetPage
          ref={(node) => {
            localRef.current = node
            registerPage(node)
          }}
          titlePrefix={titlePrefix}
          year={year}
          quarter={quarter}
          label={sheet.label}
          scholars={sheet.scholars}
          dates={dates}
          logoPath={logoPath}
          page={page}
        />
        {!locked && (
          <RollRowOverlay
            pageRef={localRef}
            rows={rowsForOverlay(sheet.scholars, page)}
            onChange={onRowChange}
            focusRow={focusRow}
            onFocusRow={onFocusRow}
            deps={`${dates.length}:${sheet.scholars}`}
          />
        )}
      </div>
    </ScaledPage>
  )
}
