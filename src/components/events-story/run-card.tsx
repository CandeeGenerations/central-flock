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

// The open Story Run: progress while Canva works, then the draft preview and its actions.
export function OpenRunCard({
  run,
  busy,
  onDiscard,
  onRedraft,
  onEdit,
}: {
  run: EventsStoryRun
  busy: boolean
  onDiscard: () => void
  onRedraft: () => void
  onEdit: () => void
}) {
  const working = run.status === 'drafting' || run.status === 'scheduling'
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
            {run.failedStep === 'draft' ? 'Drafting failed: ' : 'Failed: '}
            {run.error}
          </p>
        )}

        {run.previewPath && run.status !== 'drafting' && (
          <div className="flex justify-center">
            <img
              src={run.previewPath}
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

        {run.status === 'awaiting_approval' && (
          <p className="text-xs text-muted-foreground">
            Nothing is saved in Canva yet. Approving (save, export and schedule in Metricool) is the next piece to be
            built.
          </p>
        )}

        {!working && (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={onEdit} disabled={busy}>
              Edit events
            </Button>
            <Button variant="outline" onClick={onRedraft} disabled={busy}>
              Redraft
            </Button>
            <Button variant="ghost" onClick={onDiscard} disabled={busy}>
              Discard
            </Button>
            {run.metricoolPlannerUrl && (
              <Button variant="ghost" asChild>
                <a href={run.metricoolPlannerUrl} target="_blank" rel="noreferrer">
                  Open in Metricool <ExternalLink className="ml-1 h-4 w-4" />
                </a>
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
