import {ScheduleActionsToolbar} from '@/components/schedule/schedule-actions-toolbar'
import {ScheduleCellEditor} from '@/components/schedule/schedule-cell-editor'
import {SchedulePreviewFrame} from '@/components/schedule/schedule-preview-frame'
import {SendScheduleDialog} from '@/components/schedule/send-schedule-dialog'
import {SpecialMusicSchedulePreview} from '@/components/schedule/special-music-schedule-preview'
import {Button} from '@/components/ui/button'
import {Card, CardContent} from '@/components/ui/card'
import {Dialog, DialogContent} from '@/components/ui/dialog'
import {PageSpinner} from '@/components/ui/spinner'
import {describeExportError, useScheduleExport} from '@/hooks/use-schedule-export'
import {
  type SpecialMusicCell,
  fetchSchedulesSettings,
  fetchSpecialMusicCells,
  schedulesKeys,
  updateSchedule,
} from '@/lib/schedules-api'
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'
import {ArrowLeft} from 'lucide-react'
import {useRef, useState} from 'react'
import {useNavigate, useParams} from 'react-router-dom'
import {toast} from 'sonner'

interface OpenCell {
  date: string
  serviceType: 'sunday_am' | 'sunday_pm'
}

export function SpecialMusicScheduleViewPage() {
  const {id} = useParams<{id: string}>()
  const scheduleId = Number(id)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const previewRef = useRef<HTMLDivElement>(null)
  const [editMode, setEditMode] = useState(false)
  const [sendOpen, setSendOpen] = useState(false)
  const [openCell, setOpenCell] = useState<OpenCell | null>(null)

  const {exporting, setExporting, generateImage, exportAs} = useScheduleExport(previewRef)

  const {data, isLoading} = useQuery({
    queryKey: schedulesKeys.cells(scheduleId),
    queryFn: () => fetchSpecialMusicCells(scheduleId),
    enabled: !!scheduleId,
  })
  const {data: settings} = useQuery({queryKey: schedulesKeys.settings, queryFn: fetchSchedulesSettings})

  const finalizeMutation = useMutation({
    mutationFn: () => updateSchedule(scheduleId, {status: 'final'}),
    onSuccess: () => {
      queryClient.invalidateQueries({queryKey: schedulesKeys.cells(scheduleId)})
      queryClient.invalidateQueries({queryKey: schedulesKeys.list('special_music')})
      setEditMode(false)
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

  async function handleExport(format: 'pdf' | 'jpg') {
    if (!data) return
    const filename = `Special Music Schedule - ${data.schedule.scopeLabel}`
    try {
      const wasEditing = editMode
      if (wasEditing) setEditMode(false)
      await exportAs(format, {filename})
      if (wasEditing) setEditMode(true)
      toast.success(`Exported as ${format.toUpperCase()}`)
    } catch (e) {
      console.error('Export error:', e)
      toast.error(`Export failed: ${describeExportError(e)}`)
    }
  }

  if (isLoading) return <PageSpinner />
  if (!data) return <div className="text-muted-foreground p-6">Schedule not found</div>

  const {schedule, cells} = data
  const titlePrefix = settings?.specialMusic.titlePrefix ?? 'CBC Special Music Schedule'
  const title = `${titlePrefix} ${schedule.scopeLabel}`
  const openCellModel: SpecialMusicCell | null = openCell
    ? (cells.find((c) => c.date === openCell.date && c.serviceType === openCell.serviceType) ?? null)
    : null

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/special-music')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-2xl font-bold">{schedule.scopeLabel}</h1>
        <span className="text-muted-foreground text-sm">({schedule.status})</span>
      </div>

      <ScheduleActionsToolbar
        status={schedule.status}
        editMode={editMode}
        onToggleEdit={() => setEditMode(!editMode)}
        onFinalize={() => finalizeMutation.mutate()}
        onReopen={() => reopenMutation.mutate()}
        onExport={handleExport}
        onSend={() => setSendOpen(true)}
        finalizing={finalizeMutation.isPending}
        reopening={reopenMutation.isPending}
      />

      <Card>
        <CardContent className="overflow-x-auto">
          <SchedulePreviewFrame
            ref={previewRef}
            title={title}
            logoPath={settings?.logoPath}
            footerBlocks={settings?.specialMusic.footerBlocks}
            exporting={exporting}
          >
            <SpecialMusicSchedulePreview
              scopeStart={schedule.scopeStart!}
              scopeEnd={schedule.scopeEnd!}
              cells={cells}
              editMode={schedule.status === 'draft' && editMode}
              exporting={exporting}
              onCellClick={(date, serviceType) => setOpenCell({date, serviceType})}
            />
          </SchedulePreviewFrame>
        </CardContent>
      </Card>

      <SendScheduleDialog
        open={sendOpen}
        onOpenChange={setSendOpen}
        recipientStorageKey="specialMusic.lastRecipientId"
        getImage={async () => {
          const wasEditing = editMode
          if (wasEditing) setEditMode(false)
          setExporting(true)
          await new Promise((r) => setTimeout(r, 100))
          try {
            return await generateImage()
          } finally {
            setExporting(false)
            if (wasEditing) setEditMode(true)
          }
        }}
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
              serviceType={openCell.serviceType}
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
