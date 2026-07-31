// The Reminder Run queue for one fair: one Run per fair day, each firing the
// evening before the day it covers.
//
// The recipient count next to each pending Run is computed server-side on every
// fetch, never stored — a Run resolves its recipients when it fires, so the
// count has to be live or it would lie. See
// docs/adr/0018-fair-booth-reminder-runs.md.
import {Badge} from '@/components/ui/badge'
import {Button} from '@/components/ui/button'
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card'
import {Dialog, DialogContent, DialogHeader, DialogTitle} from '@/components/ui/dialog'
import {SearchableSelect} from '@/components/ui/searchable-select'
import {Spinner} from '@/components/ui/spinner'
import {type Template, fetchTemplates} from '@/lib/api'
import {formatShiftDate} from '@/lib/fair-booth-render'
import {
  type FairBoothReminderRun,
  cancelFairBoothReminder,
  fetchFairBoothReminderPreview,
  fetchFairBoothReminders,
  queueFairBoothReminders,
  rescheduleFairBoothReminder,
  schedulesKeys,
  sendFairBoothReminderNow,
} from '@/lib/schedules-api'
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'
import {AlertTriangle, Bell, Check, Eye, Send, X} from 'lucide-react'
import {useState} from 'react'
import {toast} from 'sonner'

// scheduled_at is UTC 'YYYY-MM-DD HH:MM:SS' (no zone marker) — same convention
// as messages.scheduled_at. Append Z so it isn't parsed as local.
function parseUtc(stamp: string): Date {
  return new Date(stamp.replace(' ', 'T') + 'Z')
}

function formatSendAt(stamp: string): string {
  return parseUtc(stamp).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

const STATUS_BADGE: Record<FairBoothReminderRun['status'], {label: string; className: string}> = {
  scheduled: {label: 'Scheduled', className: 'bg-blue-100 text-blue-900 dark:bg-blue-950 dark:text-blue-100'},
  sending: {label: 'Sending', className: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-100'},
  completed: {label: 'Sent', className: 'bg-green-100 text-green-900 dark:bg-green-950 dark:text-green-100'},
  skipped: {label: 'Skipped', className: 'bg-muted text-muted-foreground'},
  past_due: {label: 'Missed', className: 'bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-100'},
  canceled: {label: 'Canceled', className: 'bg-muted text-muted-foreground'},
}

interface Props {
  scheduleId: number
}

export function FairBoothRemindersCard({scheduleId}: Props) {
  const qc = useQueryClient()
  const [previewRunId, setPreviewRunId] = useState<number | null>(null)
  const [templateId, setTemplateId] = useState<string>('')

  const {data, isLoading} = useQuery({
    queryKey: schedulesKeys.fairBoothReminders(scheduleId),
    queryFn: () => fetchFairBoothReminders(scheduleId),
  })
  const {data: templates} = useQuery({queryKey: ['templates', ''], queryFn: () => fetchTemplates()})

  const invalidate = () => qc.invalidateQueries({queryKey: schedulesKeys.fairBoothReminders(scheduleId)})

  const queueMutation = useMutation({
    mutationFn: () => queueFairBoothReminders(scheduleId, Number(templateId)),
    onSuccess: (r) => {
      toast.success(r.created > 0 ? `Queued ${r.created} reminder${r.created === 1 ? '' : 's'}` : 'Already queued')
      invalidate()
    },
    onError: (e: Error) => toast.error(e.message),
  })
  const cancelMutation = useMutation({
    mutationFn: cancelFairBoothReminder,
    onSuccess: () => {
      toast.success('Reminder canceled')
      invalidate()
    },
    onError: (e: Error) => toast.error(e.message),
  })
  const rescheduleMutation = useMutation({
    mutationFn: rescheduleFairBoothReminder,
    onSuccess: () => {
      toast.success('Reminder re-queued')
      invalidate()
    },
    onError: (e: Error) => toast.error(e.message),
  })
  const sendNowMutation = useMutation({
    mutationFn: sendFairBoothReminderNow,
    onSuccess: (r) => {
      if (r.status === 'completed') toast.success(`Sending to ${r.sent} ${r.sent === 1 ? 'person' : 'people'}`)
      else toast.error(r.error || 'Nothing to send')
      invalidate()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const runs = data?.runs ?? []
  // Every template is listed rather than only the ones already containing
  // {{timeSlot}} — hiding the rest made a template you'd just edited look
  // missing. Ones that can't carry a Shift are flagged instead, and the server
  // still refuses to queue them.
  const templateOptions = (templates ?? []).map((t: Template) => ({
    value: String(t.id),
    label: t.content.includes('{{timeSlot}}') ? t.name : `${t.name}  — no {{timeSlot}}`,
  }))

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Bell className="h-4 w-4" /> Reminders
          {data?.sendTime && <span className="text-xs font-normal text-muted-foreground">at {data.sendTime}</span>}
        </CardTitle>
        {runs.length === 0 && (
          <div className="flex items-center gap-2">
            <SearchableSelect
              value={templateId}
              onValueChange={setTemplateId}
              options={templateOptions}
              placeholder="Pick a template"
              className="h-8 w-56"
            />
            <Button size="sm" disabled={!templateId || queueMutation.isPending} onClick={() => queueMutation.mutate()}>
              Queue reminders
            </Button>
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-1">
        {isLoading && <Spinner />}
        {!isLoading && runs.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Nothing queued. Pick a template containing <code className="text-xs">{'{{timeSlot}}'}</code> and queue one
            reminder per fair day — each goes out the evening before, to whoever is signed up for that day at that
            moment.
          </p>
        )}
        {runs.map((run) => {
          const badge = STATUS_BADGE[run.status]
          const pending = run.status === 'scheduled'
          return (
            <div key={run.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded border px-3 py-2 text-sm">
              <span className="font-medium tabular-nums">{formatSendAt(run.scheduledAt)}</span>
              <span className="text-muted-foreground">→</span>
              <span className="font-medium">{formatShiftDate(run.targetDay)}</span>
              <Badge variant="secondary" className={badge.className}>
                {badge.label}
              </Badge>
              <span className="text-muted-foreground text-xs">
                {run.status === 'completed' && run.message
                  ? `${run.message.sentCount}/${run.message.totalRecipients} sent`
                  : `${run.recipientCount} worker${run.recipientCount === 1 ? '' : 's'}`}
              </span>
              {run.error && (
                <span className="flex items-center gap-1 text-xs text-red-600 dark:text-red-400">
                  <AlertTriangle className="h-3 w-3" /> {run.error}
                </span>
              )}
              <div className="ml-auto flex items-center gap-1">
                <Button variant="ghost" size="sm" className="h-7" onClick={() => setPreviewRunId(run.id)}>
                  <Eye className="h-3 w-3 mr-1" /> Preview
                </Button>
                {run.status !== 'completed' && run.status !== 'sending' && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7"
                    disabled={sendNowMutation.isPending}
                    onClick={() => sendNowMutation.mutate(run.id)}
                  >
                    <Send className="h-3 w-3 mr-1" /> Send now
                  </Button>
                )}
                {pending && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7"
                    disabled={cancelMutation.isPending}
                    onClick={() => cancelMutation.mutate(run.id)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                )}
                {(run.status === 'canceled' || run.status === 'past_due' || run.status === 'skipped') && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7"
                    disabled={rescheduleMutation.isPending}
                    onClick={() => rescheduleMutation.mutate(run.id)}
                  >
                    <Check className="h-3 w-3 mr-1" /> Re-queue
                  </Button>
                )}
              </div>
            </div>
          )
        })}
      </CardContent>
      {previewRunId !== null && (
        <ReminderPreviewDialog runId={previewRunId} sendTime={data?.sendTime} onClose={() => setPreviewRunId(null)} />
      )}
    </Card>
  )
}

interface PreviewProps {
  runId: number
  sendTime?: string
  onClose: () => void
}

// Renders whatever the resolver produces right now. Explicitly labelled
// as-of-now: the Run will re-resolve at fire time, so this is a faithful
// preview of the logic, not a promise about the recipient list.
function ReminderPreviewDialog({runId, sendTime, onClose}: PreviewProps) {
  const {data, isLoading} = useQuery({
    queryKey: schedulesKeys.fairBoothReminderPreview(runId),
    queryFn: () => fetchFairBoothReminderPreview(runId),
    staleTime: 0,
  })

  const asOf = new Date().toLocaleTimeString(undefined, {hour: 'numeric', minute: '2-digit'})
  const willSend = (data?.recipients ?? []).filter((r) => !r.skipReason)

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      {/* DialogContent is normally the scroll container itself, but its close
          button is absolutely positioned inside it — with a long recipient list
          the button scrolls away down the page and the title goes with it. So
          this one is a flex column that does NOT scroll: header pinned, list
          scrolls on its own. gap-3 over the default gap-6 keeps the header from
          eating a third of a short dialog. */}
      <DialogContent className="flex flex-col gap-3 overflow-hidden sm:max-h-[85vh]">
        <DialogHeader className="shrink-0 pr-10">
          <DialogTitle>{data ? `Preview — ${formatShiftDate(data.targetDay)}` : 'Preview'}</DialogTitle>
          {data && !data.error && (
            <p className="text-xs text-muted-foreground">
              {willSend.length} recipient{willSend.length === 1 ? '' : 's'} · as of {asOf} — recomputed when it fires
              {sendTime ? ` at ${sendTime}` : ''}, so anyone who signs up between now and then is included.
            </p>
          )}
        </DialogHeader>
        {isLoading && <Spinner />}
        {data?.error && (
          <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-900 dark:border-red-800 dark:bg-red-950/40 dark:text-red-100">
            <AlertTriangle className="mr-1 inline h-4 w-4" />
            {data.error}
          </div>
        )}
        {data && !data.error && (
          // min-h-0 is what actually lets this shrink inside the flex column —
          // without it the list forces the dialog past the viewport instead.
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto">
            {data.recipients.map((r) => (
              <div key={r.personId} className="rounded border p-3">
                <div className="mb-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="font-medium">{r.name}</span>
                  <span className="text-xs text-muted-foreground">{r.phoneNumber ?? 'no phone'}</span>
                  {r.skipReason && (
                    <Badge variant="secondary" className="text-xs">
                      skipped — {r.skipReason === 'no_phone' ? 'no phone number' : 'inactive'}
                    </Badge>
                  )}
                </div>
                <pre className="whitespace-pre-wrap font-sans text-sm text-muted-foreground">{r.rendered}</pre>
              </div>
            ))}
            {data.recipients.length === 0 && (
              <p className="text-sm text-muted-foreground">Nobody is signed up for this day yet.</p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
