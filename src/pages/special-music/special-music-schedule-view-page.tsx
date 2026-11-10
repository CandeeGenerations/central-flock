import {ConfirmDialog} from '@/components/confirm-dialog'
import {DocumentHeader, SettingsAction} from '@/components/schedule/document-header'
import {ExportSchedulePdfDialog} from '@/components/schedule/export-schedule-pdf-dialog'
import {ScheduleCellEditor} from '@/components/schedule/schedule-cell-editor'
import {SchedulePreviewFrame} from '@/components/schedule/schedule-preview-frame'
import {SendScheduleDialog} from '@/components/schedule/send-schedule-dialog'
import {SpecialMusicSchedulePreview} from '@/components/schedule/special-music-schedule-preview'
import {Button} from '@/components/ui/button'
import {Card, CardContent} from '@/components/ui/card'
import {Dialog, DialogContent} from '@/components/ui/dialog'
import {Input} from '@/components/ui/input'
import {Label} from '@/components/ui/label'
import {PageSpinner} from '@/components/ui/spinner'
import {describeExportError, useScheduleExport} from '@/hooks/use-schedule-export'
import {useServiceTimes} from '@/hooks/use-service-times'
import {formatDate} from '@/lib/date'
import {
  type Household,
  type SpecialMusicCell,
  clearSpecialMusicCells,
  fetchHouseholds,
  fetchSchedulesSettings,
  fetchSpecialMusicCells,
  schedulesKeys,
  updateSchedule,
} from '@/lib/schedules-api'
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'
import {Eraser, MessageSquare} from 'lucide-react'
import {useRef, useState} from 'react'
import {useNavigate, useParams} from 'react-router-dom'
import {toast} from 'sonner'

interface OpenCell {
  date: string
  serviceTimeId: number
}

interface Recipient {
  key: string
  name: string
  cellIds: Set<number>
  dates: Set<string>
}

function buildSpecialMusicRecipients(cells: SpecialMusicCell[], households: Household[]): Recipient[] {
  const byKey = new Map<string, Recipient>()
  const upsert = (key: string, name: string, cellId: number, date: string) => {
    let r = byKey.get(key)
    if (!r) {
      r = {key, name, cellIds: new Set(), dates: new Set()}
      byKey.set(key, r)
    }
    r.cellIds.add(cellId)
    r.dates.add(date)
  }
  for (const c of cells) {
    for (const p of c.performers) {
      const name = p.displayName
        ? p.displayName
        : p.displayFirstNameOnly
          ? (p.firstName ?? '').trim() || `Person ${p.personId}`
          : [p.firstName, p.lastName].filter(Boolean).join(' ').trim() || `Person ${p.personId}`
      upsert(`person:${p.personId}`, name, c.id, c.date)
    }
    for (const g of c.guestPerformers) {
      const name = g.trim()
      if (!name) continue
      upsert(`guest:${name.toLowerCase()}`, name, c.id, c.date)
    }
    if (c.performers.length === 0 && c.guestPerformers.length === 0 && c.serviceLabel?.trim()) {
      const name = c.serviceLabel.trim()
      upsert(`label:${name.toLowerCase()}`, name, c.id, c.date)
    }
  }

  // Merge household members into a single recipient
  const personToHousehold = new Map<number, Household>()
  for (const h of households) {
    for (const m of h.members) personToHousehold.set(m.personId, h)
  }
  const mergedByHousehold = new Map<number, Recipient>()
  const consumed = new Set<string>()
  for (const h of households) {
    const memberKeys = h.members.map((m) => `person:${m.personId}`)
    const present = memberKeys.filter((k) => byKey.has(k))
    if (present.length === 0) continue
    const merged: Recipient = {
      key: `household:${h.id}`,
      name: h.name,
      cellIds: new Set(),
      dates: new Set(),
    }
    for (const k of memberKeys) {
      const r = byKey.get(k)
      if (r) {
        for (const id of r.cellIds) merged.cellIds.add(id)
        for (const d of r.dates) merged.dates.add(d)
        consumed.add(k)
      }
    }
    mergedByHousehold.set(h.id, merged)
  }

  const result: Recipient[] = []
  for (const r of byKey.values()) {
    if (!consumed.has(r.key)) result.push(r)
  }
  for (const r of mergedByHousehold.values()) result.push(r)
  return result.sort((a, b) => a.name.localeCompare(b.name))
}

export function SpecialMusicScheduleViewPage() {
  const {id} = useParams<{id: string}>()
  const scheduleId = Number(id)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const serviceTimes = useServiceTimes()
  const pageRef = useRef<HTMLDivElement>(null)
  const [sendOpen, setSendOpen] = useState(false)
  const [pdfOpen, setPdfOpen] = useState(false)
  const [openCell, setOpenCell] = useState<OpenCell | null>(null)
  const [highlightCellIds, setHighlightCellIds] = useState<Set<number>>(new Set())
  const [highlightDates, setHighlightDates] = useState<Set<string>>(new Set())
  const [recipientSubtitle, setRecipientSubtitle] = useState<string>('')
  const [labelDraft, setLabelDraft] = useState<string | null>(null)
  const [clearOpen, setClearOpen] = useState(false)

  const {exporting, generateImage, exportJpg, exportPackPdf, whileExporting} = useScheduleExport(pageRef)

  const {data, isLoading} = useQuery({
    queryKey: schedulesKeys.cells(scheduleId),
    queryFn: () => fetchSpecialMusicCells(scheduleId),
    enabled: !!scheduleId,
  })
  const {data: settings} = useQuery({queryKey: schedulesKeys.settings, queryFn: fetchSchedulesSettings})
  const {data: households} = useQuery({queryKey: schedulesKeys.households, queryFn: fetchHouseholds})

  const finalizeMutation = useMutation({
    mutationFn: () => updateSchedule(scheduleId, {status: 'final'}),
    onSuccess: () => {
      queryClient.invalidateQueries({queryKey: schedulesKeys.cells(scheduleId)})
      queryClient.invalidateQueries({queryKey: schedulesKeys.list('special_music')})
      toast.success('Schedule finalized')
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed to finalize'),
  })

  const reopenMutation = useMutation({
    mutationFn: () => updateSchedule(scheduleId, {status: 'draft'}),
    onSuccess: () => {
      queryClient.invalidateQueries({queryKey: schedulesKeys.cells(scheduleId)})
      queryClient.invalidateQueries({queryKey: schedulesKeys.list('special_music')})
      toast.success('Schedule reopened as draft')
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed to reopen'),
  })

  const renameMutation = useMutation({
    mutationFn: (scopeLabel: string) => updateSchedule(scheduleId, {scopeLabel}),
    onSuccess: () => {
      queryClient.invalidateQueries({queryKey: schedulesKeys.cells(scheduleId)})
      queryClient.invalidateQueries({queryKey: schedulesKeys.list('special_music')})
      setLabelDraft(null)
      toast.success('Renamed')
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed to rename'),
  })

  const clearMutation = useMutation({
    mutationFn: () => clearSpecialMusicCells(scheduleId),
    onSuccess: ({deleted}) => {
      queryClient.invalidateQueries({queryKey: schedulesKeys.cells(scheduleId)})
      queryClient.invalidateQueries({queryKey: schedulesKeys.list('special_music')})
      setClearOpen(false)
      toast.success(deleted === 0 ? 'Nothing to clear' : `Cleared ${deleted} entr${deleted === 1 ? 'y' : 'ies'}`)
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed to clear'),
  })

  async function handleExport(format: 'pdf' | 'jpg') {
    if (!data) return
    if (format === 'jpg') {
      const filename = `Special Music Schedule - ${data.schedule.scopeLabel}`
      try {
        await exportJpg(filename)
        toast.success('Exported as JPG')
      } catch (e) {
        console.error('Export error:', e)
        toast.error(`Export failed: ${describeExportError(e)}`)
      }
      return
    }
    // PDF flows through the export dialog so the user picks unhighlighted
    // copies + whether to include per-recipient highlighted pages.
    setPdfOpen(true)
  }

  type PagePlan = {cellIds: Set<number>; dates: Set<string>; subtitle: string}
  async function runPdfExport(opts: {unhighlightedCopies: number; selectedRecipientKeys: string[]}) {
    if (!data) return
    const filename = `Special Music Schedule - ${data.schedule.scopeLabel}`
    const allRecipients = buildSpecialMusicRecipients(data.cells, households ?? [])
    const selectedSet = new Set(opts.selectedRecipientKeys)
    const recipients = allRecipients.filter((r) => selectedSet.has(r.key))
    const pages: PagePlan[] = [
      ...Array.from({length: opts.unhighlightedCopies}, () => ({
        cellIds: new Set<number>(),
        dates: new Set<string>(),
        subtitle: '',
      })),
      ...recipients.map((r) => ({cellIds: r.cellIds, dates: r.dates, subtitle: r.name}) as PagePlan),
    ]
    if (pages.length === 0) return
    try {
      await exportPackPdf(pages, {
        filename,
        prepare: (p) => {
          setHighlightCellIds(p.cellIds)
          setHighlightDates(p.dates)
          setRecipientSubtitle(p.subtitle)
        },
      })
      setHighlightCellIds(new Set())
      setHighlightDates(new Set())
      setRecipientSubtitle('')
      toast.success(`Exported ${pages.length} page PDF`)
    } catch (e) {
      console.error('Export error:', e)
      toast.error(`Export failed: ${describeExportError(e)}`)
    }
  }

  if (isLoading) return <PageSpinner />
  if (!data) return <div className="text-muted-foreground p-6">Schedule not found</div>

  const {schedule, cells, doubleBookings} = data
  // Columns come from the configured Service Times, falling back to whatever
  // the cells themselves reference so an unset setting still renders. See
  // docs/adr/0025.
  // Computed regardless of date; the UI stops nagging about the past.
  // See docs/adr/0026.
  const todayIso = new Date().toISOString().slice(0, 10)
  const upcomingDoubleBookings = doubleBookings.filter((c) => c.date >= todayIso)
  const configuredIds = settings?.specialMusic.serviceTimeIds ?? []
  const cellIds = [...new Set(cells.map((c) => c.serviceTimeId).filter((v): v is number => v != null))]
  const previewServices = (configuredIds.length > 0 ? configuredIds : cellIds)
    .map((id) => ({id, label: serviceTimes.byId.get(id)?.name ?? `Service #${id}`}))
    .sort((a, b) => (serviceTimes.byId.get(a.id)?.sortOrder ?? 0) - (serviceTimes.byId.get(b.id)?.sortOrder ?? 0))
  const pdfRecipients = buildSpecialMusicRecipients(cells, households ?? []).map((r) => ({key: r.key, name: r.name}))
  const titlePrefix = settings?.specialMusic.titlePrefix ?? 'Special Music Schedule'
  const title = `${titlePrefix} - ${schedule.scopeLabel}`
  const isDraft = schedule.status === 'draft'
  const labelValue = labelDraft ?? schedule.scopeLabel
  const openCellModel: SpecialMusicCell | null = openCell
    ? (cells.find((c) => c.date === openCell.date && c.serviceTimeId === openCell.serviceTimeId) ?? null)
    : null

  return (
    <div className="space-y-6 p-4 md:p-6">
      <DocumentHeader
        onBack={() => navigate('/special-music')}
        title={schedule.scopeLabel}
        status={schedule.status}
        onFinalize={() => finalizeMutation.mutate()}
        onReopen={() => reopenMutation.mutate()}
        statusPending={finalizeMutation.isPending || reopenMutation.isPending}
        exporting={exporting}
        downloadDisabledReason={isDraft ? 'Finalize the schedule to export' : undefined}
        downloads={[
          {label: 'PDF', onSelect: () => handleExport('pdf')},
          {label: 'JPG', onSelect: () => handleExport('jpg')},
        ]}
        actions={
          <Button
            size="sm"
            variant="outline"
            disabled={isDraft}
            title={isDraft ? 'Finalize the schedule to send' : undefined}
            onClick={() => setSendOpen(true)}
          >
            <MessageSquare className="mr-1 h-4 w-4" />
            Send
          </Button>
        }
        settings={(close) => (
          <>
            <div className="space-y-1.5">
              <Label>Name</Label>
              <div className="flex gap-2">
                <Input
                  value={labelValue}
                  onChange={(e) => setLabelDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && labelValue.trim()) renameMutation.mutate(labelValue.trim())
                  }}
                />
                <Button
                  size="sm"
                  className="h-9"
                  disabled={!labelValue.trim() || labelValue === schedule.scopeLabel || renameMutation.isPending}
                  onClick={() => renameMutation.mutate(labelValue.trim())}
                >
                  Save
                </Button>
              </div>
            </div>
            {isDraft && cells.length > 0 ? (
              <div className="space-y-2 border-t pt-4">
                <SettingsAction
                  icon={<Eraser />}
                  destructive
                  onClick={() => {
                    close()
                    setClearOpen(true)
                  }}
                >
                  Clear all entries…
                </SettingsAction>
              </div>
            ) : null}
          </>
        )}
      />

      <Card>
        <CardContent>
          <SchedulePreviewFrame
            pageRef={pageRef}
            title={title}
            logoPath={settings?.logoPath}
            footerBlocks={settings?.specialMusic.footerBlocks}
            subtitle={recipientSubtitle}
            exporting={exporting}
            zoom="fit"
            settingsPath="/schedules/settings/special-music"
          >
            {(forExport) => (
              <SpecialMusicSchedulePreview
                scopeStart={schedule.scopeStart!}
                scopeEnd={schedule.scopeEnd!}
                cells={cells}
                services={previewServices}
                editMode={isDraft && !forExport}
                exporting={forExport}
                doubleBookings={upcomingDoubleBookings}
                onCellClick={(date, serviceTimeId) => setOpenCell({date, serviceTimeId})}
                highlightCellIds={highlightCellIds}
                highlightDates={highlightDates}
              />
            )}
          </SchedulePreviewFrame>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={clearOpen}
        onOpenChange={(v) => !v && setClearOpen(false)}
        title="Clear the whole schedule?"
        description={`Deletes all ${cells.length} special music ${
          cells.length === 1 ? 'entry' : 'entries'
        } between ${formatDate(schedule.scopeStart!)} and ${formatDate(
          schedule.scopeEnd!,
        )} — performers, song titles, links and notes. The entries belong to those dates, so any other schedule covering them is emptied too.`}
        confirmLabel="Clear all"
        variant="destructive"
        loading={clearMutation.isPending}
        onConfirm={() => clearMutation.mutate()}
      />

      <ExportSchedulePdfDialog
        open={pdfOpen}
        onOpenChange={setPdfOpen}
        recipients={pdfRecipients}
        onConfirm={runPdfExport}
      />

      <SendScheduleDialog
        open={sendOpen}
        onOpenChange={setSendOpen}
        recipientStorageKey="specialMusic.lastRecipientId"
        getImage={() => whileExporting(generateImage)}
        describeError={describeExportError}
      />

      {/* Cell editor as a centered Dialog. Tried a Popover anchored to a
          virtual trigger but it floated to the page corner; the editor's
          contents (multi-select + textareas) are big enough that a modal
          is the better fit anyway. */}
      <Dialog
        open={!!openCell}
        onOpenChange={(o) => {
          if (!o) setOpenCell(null)
        }}
      >
        <DialogContent className="max-w-md">
          {openCell ? (
            <ScheduleCellEditor
              date={openCell.date}
              serviceTimeId={openCell.serviceTimeId}
              cell={openCellModel}
              scheduleId={scheduleId}
              onClose={() => setOpenCell(null)}
              onSaved={() => {
                queryClient.invalidateQueries({queryKey: schedulesKeys.cells(scheduleId)})
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}
