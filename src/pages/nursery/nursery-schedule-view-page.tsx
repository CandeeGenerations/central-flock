import {NurserySchedulePreview} from '@/components/nursery/nursery-schedule-preview'
import {ScheduleActionsToolbar} from '@/components/schedule/schedule-actions-toolbar'
import {SchedulePreviewFrame} from '@/components/schedule/schedule-preview-frame'
import {SendScheduleDialog} from '@/components/schedule/send-schedule-dialog'
import {Button} from '@/components/ui/button'
import {Card, CardContent} from '@/components/ui/card'
import {PageSpinner} from '@/components/ui/spinner'
import {describeExportError, useScheduleExport} from '@/hooks/use-schedule-export'
import {
  fetchNurserySchedule,
  fetchNurseryWorkers,
  fetchServiceConfig,
  updateAssignment,
  updateScheduleStatus,
} from '@/lib/nursery-api'
import {nurseryKeys} from '@/lib/nursery-query-keys'
import {fetchSchedulesSettings, schedulesKeys} from '@/lib/schedules-api'
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'
import {ArrowLeft} from 'lucide-react'
import {useCallback, useRef, useState} from 'react'
import {useNavigate, useParams} from 'react-router-dom'
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

export function NurseryScheduleViewPage() {
  const {id} = useParams<{id: string}>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const previewRef = useRef<HTMLDivElement>(null)
  const [editMode, setEditMode] = useState(false)
  const [sendOpen, setSendOpen] = useState(false)

  const {exporting, setExporting, generateImage, exportAs} = useScheduleExport(previewRef)

  const {data: schedule, isLoading} = useQuery({
    queryKey: nurseryKeys.schedule(Number(id)),
    queryFn: () => fetchNurserySchedule(Number(id)),
  })

  const {data: serviceConfig} = useQuery({queryKey: nurseryKeys.serviceConfig, queryFn: fetchServiceConfig})
  const {data: workers} = useQuery({queryKey: nurseryKeys.workers, queryFn: fetchNurseryWorkers})
  const {data: settings} = useQuery({queryKey: schedulesKeys.settings, queryFn: fetchSchedulesSettings})

  const assignmentMutation = useMutation({
    mutationFn: ({assignmentId, workerId}: {assignmentId: number; workerId: number | null}) =>
      updateAssignment(assignmentId, workerId),
    onSuccess: () => {
      queryClient.invalidateQueries({queryKey: nurseryKeys.schedule(Number(id))})
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Failed to update'),
  })

  const finalizeMutation = useMutation({
    mutationFn: () => updateScheduleStatus(Number(id), 'final'),
    onSuccess: () => {
      queryClient.invalidateQueries({queryKey: nurseryKeys.schedule(Number(id))})
      queryClient.invalidateQueries({queryKey: nurseryKeys.schedules})
      setEditMode(false)
      toast.success('Schedule finalized')
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Failed to finalize'),
  })

  const reopenMutation = useMutation({
    mutationFn: () => updateScheduleStatus(Number(id), 'draft'),
    onSuccess: () => {
      queryClient.invalidateQueries({queryKey: nurseryKeys.schedule(Number(id))})
      queryClient.invalidateQueries({queryKey: nurseryKeys.schedules})
      toast.success('Schedule reopened as draft')
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Failed to reopen'),
  })

  const handleAssignmentChange = useCallback(
    (assignmentId: number, workerId: number | null) => {
      assignmentMutation.mutate({assignmentId, workerId})
    },
    [assignmentMutation],
  )

  async function handleExport(format: 'pdf' | 'jpg') {
    if (!schedule) return
    const monthName = MONTH_NAMES[schedule.month - 1]
    const filename = `Nursery Schedule - ${monthName} ${schedule.year}`
    try {
      const wasEditing = editMode
      if (wasEditing) setEditMode(false)
      await exportAs(format, {filename})
      if (wasEditing) setEditMode(true)
      toast.success(`Exported as ${format.toUpperCase()}`)
    } catch (error) {
      console.error('Export error:', error)
      toast.error(`Export failed: ${describeExportError(error)}`)
    }
  }

  if (isLoading) return <PageSpinner />
  if (!schedule || !serviceConfig) return <div className="p-6 text-muted-foreground">Schedule not found</div>

  const isDraft = schedule.status === 'draft'
  const title = `${settings?.nursery.titlePrefix ?? 'Nursery Schedule'} - ${MONTH_NAMES[schedule.month - 1]} ${schedule.year}`

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/nursery')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-2xl font-bold">
          {MONTH_NAMES[schedule.month - 1]} {schedule.year}
        </h1>
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

      {schedule.overlap?.missing && (
        <div className="rounded-md border border-amber-500/40 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          No schedule found for{' '}
          <strong>
            {MONTH_NAMES[schedule.overlap.priorMonth - 1]} {schedule.overlap.priorYear}
          </strong>
          . The borrowed-pair dates ({schedule.overlap.borrowDates.join(', ')}) have no prior-month continuity.
        </div>
      )}
      {schedule.overlap && !schedule.overlap.missing && (
        <div className="rounded-md border border-blue-500/30 bg-blue-50 px-4 py-3 text-sm text-blue-900 dark:bg-blue-950/30 dark:text-blue-200">
          Borrowed-pair dates ({schedule.overlap.borrowDates.join(', ')}) are carried over from{' '}
          <strong>
            {MONTH_NAMES[schedule.overlap.priorMonth - 1]} {schedule.overlap.priorYear}
          </strong>{' '}
          ({schedule.overlap.priorScheduleStatus}). Edit those cells from the{' '}
          {MONTH_NAMES[schedule.overlap.priorMonth - 1]} schedule.
        </div>
      )}

      <Card>
        <CardContent className="overflow-x-auto">
          <SchedulePreviewFrame
            ref={previewRef}
            title={title}
            logoPath={settings?.logoPath}
            footerBlocks={settings?.nursery.footerBlocks}
            exporting={exporting}
          >
            <NurserySchedulePreview
              assignments={schedule.assignments}
              serviceConfig={serviceConfig}
              editMode={isDraft && editMode}
              workers={workers}
              onAssignmentChange={handleAssignmentChange}
              exporting={exporting}
              onCarryoverClick={(a) => a.sourceScheduleId && navigate(`/nursery/${a.sourceScheduleId}`)}
            />
          </SchedulePreviewFrame>
        </CardContent>
      </Card>

      <SendScheduleDialog
        open={sendOpen}
        onOpenChange={setSendOpen}
        recipientStorageKey="nursery.lastRecipientId"
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
    </div>
  )
}
