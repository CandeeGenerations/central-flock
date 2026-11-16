import {AIProgress} from '@/components/ai-progress'
import {Badge} from '@/components/ui/badge'
import {Button} from '@/components/ui/button'
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card'
import {type EventsStoryRun, type EventsStoryRunStatus} from '@/lib/api'
import {ExternalLink} from 'lucide-react'

import {formatPostTime} from './format'

const STATUS: Record<
  EventsStoryRunStatus,
  {label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'}
> = {
  editing: {label: 'Choosing events', variant: 'secondary'},
  drafting: {label: 'Drafting', variant: 'secondary'},
  awaiting_approval: {label: 'Awaiting approval', variant: 'default'},
  scheduling: {label: 'Scheduling', variant: 'secondary'},
  scheduled: {label: 'Scheduled', variant: 'outline'},
  failed: {label: 'Failed', variant: 'destructive'},
  discarded: {label: 'Discarded', variant: 'outline'},
}

export function RunStatusBadge({status}: {status: EventsStoryRunStatus}) {
  const s = STATUS[status]
  return <Badge variant={s.variant}>{s.label}</Badge>
}

const FAILED_AT: Record<string, string> = {
  draft: 'Drafting failed',
  commit: 'Saving in Canva failed',
  export: 'Exporting or scheduling failed (already saved in Canva)',
  schedule: 'Scheduling failed (already saved in Canva)',
}

export interface LateSuggestion {
  postDate: string
  postMinute: number
}

// The open Story Run after the picker: progress while working, then the preview and its actions.
export function OpenRunCard({
  run,
  busy,
  late,
  onApprove,
  onApproveAt,
  onDismissLate,
  onRetry,
  onDiscard,
  onRedraft,
  onEdit,
}: {
  run: EventsStoryRun
  busy: boolean
  // Set when Approve found the chosen time had passed: undefined = not late, null = no good time found.
  late: LateSuggestion | null | undefined
  onApprove: () => void
  onApproveAt: (time: LateSuggestion) => void
  onDismissLate: () => void
  onRetry: () => void
  onDiscard: () => void
  onRedraft: () => void
  onEdit: () => void
}) {
  const working = run.status === 'drafting' || run.status === 'scheduling'
  const savedInCanva = run.failedStep === 'export' || run.failedStep === 'schedule'
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
        <CardTitle className="text-base">Story for {formatPostTime(run.postDate, run.postMinute)}</CardTitle>
        <RunStatusBadge status={run.status} />
      </CardHeader>
      <CardContent className="space-y-4">
        {working && <AIProgress message={run.progressMessage} progress={run.progressPct} />}

        {run.status === 'failed' && (
          <p className="text-sm text-destructive break-words">
            {FAILED_AT[run.failedStep ?? 'draft'] ?? 'Failed'}: {run.error}
          </p>
        )}
        {run.status === 'awaiting_approval' && run.error && (
          <p className="text-sm text-amber-700 dark:text-amber-400">{run.error}</p>
        )}

        {run.previewPath && run.status !== 'drafting' && (
          <div className="flex justify-center">
            <img
              src={run.exportPath ?? run.previewPath}
              alt="Draft of the Events Story"
              className="w-full max-w-[320px] rounded-md border shadow-sm"
            />
          </div>
        )}

        <ol className="space-y-1 text-sm">
          {run.lines.map((l, i) => (
            <li key={i} className="flex gap-2">
              <span className="w-14 shrink-0 text-muted-foreground">
                {l.month} {l.dayNumber}
              </span>
              <span className="min-w-0">
                <span className="text-muted-foreground">{l.dayTimeLine}</span> · {l.line1}
                {l.line2 ? ` ${l.line2}` : ''}
              </span>
            </li>
          ))}
        </ol>

        {late !== undefined && (
          <div className="space-y-2 rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm">
            <p>
              {formatPostTime(run.postDate, run.postMinute)} has passed or is too close.
              {late ? ` Post ${formatPostTime(late.postDate, late.postMinute)} instead?` : ' Choose a new time.'}
            </p>
            <div className="flex flex-wrap justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={onDismissLate} disabled={busy}>
                Cancel
              </Button>
              {late && (
                <Button size="sm" onClick={() => onApproveAt(late)} disabled={busy}>
                  Approve for {formatPostTime(late.postDate, late.postMinute)}
                </Button>
              )}
            </div>
          </div>
        )}

        {run.status === 'awaiting_approval' && late === undefined && (
          <p className="text-xs text-muted-foreground">
            Nothing is saved in Canva yet. Approve saves the design, exports it, and schedules it in Metricool as a
            Facebook and Instagram Story.
          </p>
        )}

        {!working && (
          // Secondary actions first, the primary one last and right-aligned.
          <div className="flex flex-wrap justify-end gap-2">
            {run.metricoolPlannerUrl && (
              <Button variant="ghost" asChild>
                <a href={run.metricoolPlannerUrl} target="_blank" rel="noreferrer">
                  Open in Metricool <ExternalLink className="ml-1 h-4 w-4" />
                </a>
              </Button>
            )}
            {(run.status === 'awaiting_approval' || (run.status === 'failed' && !savedInCanva)) && (
              <>
                <Button variant="ghost" onClick={onDiscard} disabled={busy}>
                  Discard
                </Button>
                <Button variant="outline" onClick={onRedraft} disabled={busy}>
                  Redraft
                </Button>
                <Button variant="outline" onClick={onEdit} disabled={busy}>
                  Edit events
                </Button>
              </>
            )}
            {run.status === 'failed' && (
              <Button onClick={onRetry} disabled={busy}>
                {savedInCanva ? 'Retry scheduling' : 'Retry'}
              </Button>
            )}
            {run.status === 'awaiting_approval' && late === undefined && (
              <Button onClick={onApprove} disabled={busy}>
                Approve & schedule
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
