import {formatPostTime} from '@/components/events-story/format'
import {NewStoryFlow} from '@/components/events-story/new-story-flow'
import {type LateSuggestion, OpenRunCard, RunStatusBadge} from '@/components/events-story/run-card'
import {Button} from '@/components/ui/button'
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card'
import {Pagination} from '@/components/ui/pagination'
import {
  approveEventsStoryRun,
  discardEventsStoryRun,
  fetchEventsStoryRuns,
  fetchOpenEventsStoryRun,
  redraftEventsStoryRun,
  reopenEventsStoryRun,
  retryEventsStoryRun,
} from '@/lib/api'
import {queryKeys} from '@/lib/query-keys'
import {keepPreviousData, useMutation, useQuery, useQueryClient} from '@tanstack/react-query'
import {ExternalLink, Images, Plus} from 'lucide-react'
import {useEffect, useRef, useState} from 'react'
import {useSearchParams} from 'react-router-dom'
import {toast} from 'sonner'

const PAGE_SIZE = 10

// Weekly Events Story: pick five Calendar Print Events, draft the Canva design, approve, schedule.
// Every stage lives on the server (the Story Run), so a refresh or another device resumes it.
export function EventsStoryPage() {
  const queryClient = useQueryClient()
  // New Story state lives in the URL (?new=1&week=YYYY-MM-DD) so a refresh lands back on the same
  // step; once the picker autosaves, the 'editing' run on the server carries it.
  const [params, setParams] = useSearchParams()
  const composing = params.get('new') === '1'
  const week = params.get('week')
  const setComposing = (on: boolean, nextWeek: string | null = null) =>
    setParams(on ? {new: '1', ...(nextWeek ? {week: nextWeek} : {})} : {}, {replace: true})
  const [late, setLate] = useState<LateSuggestion | null | undefined>(undefined)

  // The open run; polled every second while the server is drafting or scheduling it.
  const open = useQuery({
    queryKey: queryKeys.eventsStoryOpenRun,
    queryFn: fetchOpenEventsStoryRun,
    refetchInterval: (q) => {
      const s = q.state.data?.status
      return s === 'drafting' || s === 'scheduling' ? 1000 : false
    },
  })
  const current = open.data ?? undefined

  const [page, setPage] = useState(1)
  const past = useQuery({
    queryKey: queryKeys.eventsStoryRuns(page, PAGE_SIZE),
    queryFn: () => fetchEventsStoryRuns(page, PAGE_SIZE),
    placeholderData: keepPreviousData,
  })
  // A run finishing scheduling moves into Past Stories.
  const lastStatus = useRef(current?.status)
  useEffect(() => {
    if (lastStatus.current && lastStatus.current !== current?.status) {
      void queryClient.invalidateQueries({queryKey: ['events-story', 'runs']})
    }
    lastStatus.current = current?.status
  }, [current?.status, queryClient])
  const editing = current?.status === 'editing' ? current : undefined
  const refresh = () => queryClient.invalidateQueries({queryKey: ['events-story']})

  const onError = (error: Error) => toast.error(error.message)
  const discard = useMutation({mutationFn: discardEventsStoryRun, onSuccess: () => refresh(), onError})
  const redraft = useMutation({mutationFn: redraftEventsStoryRun, onSuccess: () => refresh(), onError})
  const retry = useMutation({mutationFn: retryEventsStoryRun, onSuccess: () => refresh(), onError})
  // "Edit events": discard the Canva draft and go back to the picker with the same lines.
  const reopen = useMutation({mutationFn: reopenEventsStoryRun, onSuccess: () => refresh(), onError})
  const approve = useMutation({
    mutationFn: ({id, time}: {id: number; time?: LateSuggestion}) => approveEventsStoryRun(id, time),
    onSuccess: (result) => {
      if (result.ok) {
        setLate(undefined)
        refresh()
      } else setLate(result.suggestion)
    },
    onError,
  })

  const busy = discard.isPending || redraft.isPending || retry.isPending || reopen.isPending || approve.isPending
  // Wait for the open run before mounting the flow: it snapshots the run it resumes on mount.
  const showFlow = open.isSuccess && (Boolean(editing) || (composing && !current))

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Images className="h-6 w-6" />
          <h1 className="text-2xl font-bold">Events Story</h1>
        </div>
        {open.isSuccess && !showFlow && !current && (
          <Button onClick={() => setComposing(true)}>
            <Plus className="mr-1 h-4 w-4" /> New Story
          </Button>
        )}
      </div>

      <div className="max-w-3xl space-y-4">
        {showFlow && (
          <NewStoryFlow
            // One key for the whole flow: the run appearing after the first autosave (or refetching)
            // must not remount it — that used to reset the picker and re-run /prepare.
            key="flow"
            run={editing}
            week={week}
            onWeek={(w) => setComposing(true, w)}
            onCancel={(runId) => {
              setComposing(false)
              if (runId) discard.mutate(runId)
            }}
            onDrafted={() => {
              setComposing(false)
              refresh()
            }}
          />
        )}

        {current && !editing && (
          <OpenRunCard
            run={current}
            busy={busy}
            late={late}
            onApprove={() => approve.mutate({id: current.id})}
            onApproveAt={(time) => approve.mutate({id: current.id, time})}
            onDismissLate={() => setLate(undefined)}
            onRetry={() => retry.mutate(current.id)}
            onDiscard={() => discard.mutate(current.id)}
            onRedraft={() => redraft.mutate(current.id)}
            onEdit={() => reopen.mutate(current.id)}
          />
        )}

        {!showFlow && !current && past.data?.total === 0 && (
          <p className="text-sm text-muted-foreground">
            No Stories yet. Start one to pick this week's five events from the printed calendar.
          </p>
        )}

        {past.data && past.data.total > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Past Stories</CardTitle>
            </CardHeader>
            <CardContent className="divide-y">
              {past.data.runs.map((r) => (
                <div key={r.id} className="flex items-center gap-3 py-2">
                  {r.exportPath || r.previewPath ? (
                    <img
                      src={r.exportPath ?? r.previewPath!}
                      alt=""
                      className="h-16 w-9 shrink-0 rounded border object-cover"
                    />
                  ) : (
                    <div className="h-16 w-9 shrink-0 rounded border bg-muted" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">{formatPostTime(r.postDate, r.postMinute)}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {r.lines.map((l) => l.line1).join(' · ')}
                    </div>
                  </div>
                  {r.metricoolPlannerUrl && (
                    <a href={r.metricoolPlannerUrl} target="_blank" rel="noreferrer" aria-label="Open in Metricool">
                      <ExternalLink className="h-4 w-4 text-muted-foreground" />
                    </a>
                  )}
                  <RunStatusBadge status={r.status} />
                </div>
              ))}
              {past.data.total > PAGE_SIZE && (
                <div className="pt-3">
                  <Pagination
                    page={page}
                    pageSize={PAGE_SIZE}
                    total={past.data.total}
                    onPageChange={setPage}
                    noun="stories"
                  />
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
