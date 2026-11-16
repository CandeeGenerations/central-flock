import {formatPostTime} from '@/components/events-story/format'
import {NewStoryFlow} from '@/components/events-story/new-story-flow'
import {OpenRunCard, RunStatusBadge} from '@/components/events-story/run-card'
import {Button} from '@/components/ui/button'
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card'
import {
  type EventsStoryRun,
  type StoryLineDraft,
  discardEventsStoryRun,
  fetchEventsStoryRuns,
  redraftEventsStoryRun,
} from '@/lib/api'
import {queryKeys} from '@/lib/query-keys'
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'
import {Images, Plus} from 'lucide-react'
import {useState} from 'react'
import {toast} from 'sonner'

const OPEN: EventsStoryRun['status'][] = ['drafting', 'awaiting_approval', 'scheduling', 'failed']

// Weekly Events Story: pick five Calendar Print Events, draft the Canva design, approve, schedule.
export function EventsStoryPage() {
  const queryClient = useQueryClient()
  const [composing, setComposing] = useState<{initialLines?: StoryLineDraft[]} | null>(null)

  // Polls every second while the server is drafting or scheduling the open run.
  const runs = useQuery({
    queryKey: queryKeys.eventsStoryRuns,
    queryFn: fetchEventsStoryRuns,
    refetchInterval: (q) =>
      q.state.data?.some((r) => r.status === 'drafting' || r.status === 'scheduling') ? 1000 : false,
  })
  const current = runs.data?.find((r) => OPEN.includes(r.status))

  const refresh = () => queryClient.invalidateQueries({queryKey: ['events-story']})

  const discard = useMutation({
    mutationFn: discardEventsStoryRun,
    onSuccess: () => refresh(),
    onError: (error) => toast.error(error.message),
  })
  const redraft = useMutation({
    mutationFn: redraftEventsStoryRun,
    onSuccess: () => refresh(),
    onError: (error) => toast.error(error.message),
  })
  // "Edit events": drop the draft (cancelling its Canva changes) and reopen the picker pre-filled.
  const editEvents = useMutation({
    mutationFn: (run: EventsStoryRun) => discardEventsStoryRun(run.id).then(() => run.lines),
    onSuccess: (lines) => {
      refresh()
      setComposing({initialLines: lines})
    },
    onError: (error) => toast.error(error.message),
  })

  const past = (runs.data ?? []).filter((r) => r.id !== current?.id && r.status !== 'discarded')
  const busy = discard.isPending || redraft.isPending || editEvents.isPending

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Images className="h-6 w-6" />
          <h1 className="text-2xl font-bold">Events Story</h1>
        </div>
        {!composing && !current && (
          <Button onClick={() => setComposing({})}>
            <Plus className="mr-1 h-4 w-4" /> New Story
          </Button>
        )}
      </div>

      <div className="max-w-3xl space-y-4">
        {composing && !current && (
          <NewStoryFlow
            initialLines={composing.initialLines}
            onCancel={() => setComposing(null)}
            onCreated={() => {
              setComposing(null)
              refresh()
            }}
          />
        )}

        {current && (
          <OpenRunCard
            run={current}
            busy={busy}
            onDiscard={() => discard.mutate(current.id)}
            onRedraft={() => redraft.mutate(current.id)}
            onEdit={() => editEvents.mutate(current)}
          />
        )}

        {!composing && !current && runs.data?.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No Stories yet. Start one to pick this week's five events from the printed calendar.
          </p>
        )}

        {past.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Past Stories</CardTitle>
            </CardHeader>
            <CardContent className="divide-y">
              {past.map((r) => (
                <div key={r.id} className="flex items-center gap-3 py-2">
                  {r.previewPath ? (
                    <img src={r.previewPath} alt="" className="h-16 w-9 shrink-0 rounded border object-cover" />
                  ) : (
                    <div className="h-16 w-9 shrink-0 rounded border bg-muted" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">{formatPostTime(r.postDate, r.postMinute)}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {r.lines.map((l) => l.line1).join(' · ')}
                    </div>
                  </div>
                  <RunStatusBadge status={r.status} />
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
