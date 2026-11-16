import {AIProgress} from '@/components/ai-progress'
import {Button} from '@/components/ui/button'
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card'
import {Checkbox} from '@/components/ui/checkbox'
import {Input} from '@/components/ui/input'
import {Label} from '@/components/ui/label'
import {
  type ConnectionCheck,
  type ConnectionProvider,
  type EventsStoryDay,
  type EventsStoryPrepare,
  type EventsStoryRun,
  type StoryCandidate,
  type StoryLineDraft,
  createEventsStoryRun,
  fetchEventsStoryDay,
  prepareEventsStory,
  startConnection,
} from '@/lib/api'
import {queryKeys} from '@/lib/query-keys'
import {cn} from '@/lib/utils'
import {useMutation, useQuery} from '@tanstack/react-query'
import {AlertTriangle, CheckCircle2, XCircle} from 'lucide-react'
import {useEffect, useMemo, useState} from 'react'
import {toast} from 'sonner'

import {formatDate, formatMinute, formatPostTime, minuteToTimeInput, timeInputToMinute} from './format'

const STORY_SIZE = 5

const keyOf = (c: {eventIds: number[]}) => c.eventIds.join('-')

type LineEdits = Pick<StoryLineDraft, 'dayTimeLine' | 'line1' | 'line2'>

// Staged messages while /prepare checks both Connections and asks Metricool for best times.
// Mounted only while loading, so each load starts from the first message.
const PREPARE_STAGES = [
  {message: 'Checking Canva & Metricool…', progress: 15},
  {message: 'Finding the best time to post…', progress: 40},
  {message: 'Loading upcoming events…', progress: 65},
  {message: 'Almost ready…', progress: 85},
]

function PrepareProgress() {
  const [step, setStep] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setStep((s) => Math.min(s + 1, PREPARE_STAGES.length - 1)), 1500)
    return () => clearInterval(id)
  }, [])
  const stage = PREPARE_STAGES[step]
  return <AIProgress message={stage.message} progress={stage.progress} />
}

export function NewStoryFlow({
  initialLines,
  onCreated,
  onCancel,
}: {
  // When editing a previous draft: its five lines, re-selected and pre-filled.
  initialLines?: StoryLineDraft[]
  onCreated: (run: EventsStoryRun) => void
  onCancel: () => void
}) {
  const prepare = useQuery({
    queryKey: queryKeys.eventsStoryPrepare,
    queryFn: prepareEventsStory,
    staleTime: 0,
    gcTime: 0,
    retry: false,
  })

  const [postDate, setPostDate] = useState<string | null>(null)
  const effectiveDate = postDate ?? prepare.data?.postDate ?? null
  const overridden = Boolean(postDate && postDate !== prepare.data?.postDate)

  const day = useQuery({
    queryKey: queryKeys.eventsStoryDay(effectiveDate ?? ''),
    queryFn: () => fetchEventsStoryDay(effectiveDate!),
    enabled: Boolean(prepare.data?.ready && overridden && effectiveDate),
    retry: false,
  })
  const dayData: EventsStoryDay | undefined = overridden ? day.data : prepare.data

  if (prepare.isLoading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <PrepareProgress />
        </CardContent>
      </Card>
    )
  }
  if (prepare.error || !prepare.data) {
    return (
      <Card>
        <CardContent className="space-y-3 pt-6">
          <p className="text-sm text-destructive">{prepare.error?.message ?? "Couldn't start a new Story"}</p>
          <div className="flex gap-2">
            <Button onClick={() => prepare.refetch()}>Try again</Button>
            <Button variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }
  if (!prepare.data.ready) {
    return <ConnectionsBlocker prep={prepare.data} onRetry={() => prepare.refetch()} onCancel={onCancel} />
  }

  return (
    <StoryForm
      key={`${effectiveDate}:${dayData ? 'ready' : 'loading'}`}
      prep={prepare.data}
      day={dayData}
      dayLoading={overridden && day.isLoading}
      dayError={overridden ? day.error?.message : undefined}
      postDate={effectiveDate!}
      onPostDate={(d) => setPostDate(d)}
      initialLines={initialLines}
      onCreated={onCreated}
      onCancel={onCancel}
    />
  )
}

function ConnectionsBlocker({
  prep,
  onRetry,
  onCancel,
}: {
  prep: EventsStoryPrepare
  onRetry: () => void
  onCancel: () => void
}) {
  const reconnect = useMutation({
    mutationFn: startConnection,
    onSuccess: ({url}) => {
      window.location.href = url
    },
    onError: (error) => toast.error(error.message),
  })
  const rows: [ConnectionProvider, string][] = [
    ['canva', 'Canva'],
    ['metricool', 'Metricool'],
  ]
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Connections need attention</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Both Canva and Metricool must be connected before a Story can be drafted.
        </p>
        {rows.map(([id, label]) => (
          <ConnectionLine
            key={id}
            label={label}
            check={prep.connections[id]}
            onReconnect={() => reconnect.mutate(id)}
            busy={reconnect.isPending}
          />
        ))}
        <div className="flex gap-2">
          <Button variant="outline" onClick={onRetry}>
            Check again
          </Button>
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function ConnectionLine({
  label,
  check,
  onReconnect,
  busy,
}: {
  label: string
  check: ConnectionCheck
  onReconnect: () => void
  busy: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border p-3">
      <div className="flex min-w-0 items-center gap-2">
        {check.ok ? (
          <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" />
        ) : (
          <XCircle className="h-4 w-4 shrink-0 text-destructive" />
        )}
        <div className="min-w-0">
          <div className="font-medium">{label}</div>
          {!check.ok && <div className="text-xs text-muted-foreground break-words">{check.message}</div>}
        </div>
      </div>
      {!check.ok && check.reason !== 'not_configured' && (
        <Button size="sm" onClick={onReconnect} disabled={busy}>
          Reconnect
        </Button>
      )}
    </div>
  )
}

function StoryForm({
  prep,
  day,
  dayLoading,
  dayError,
  postDate,
  onPostDate,
  initialLines,
  onCreated,
  onCancel,
}: {
  prep: EventsStoryPrepare
  day: EventsStoryDay | undefined
  dayLoading: boolean
  dayError?: string
  postDate: string
  onPostDate: (date: string) => void
  initialLines?: StoryLineDraft[]
  onCreated: (run: EventsStoryRun) => void
  onCancel: () => void
}) {
  const candidates = useMemo(() => day?.candidates ?? [], [day])
  const hours = useMemo(() => day?.hours ?? [], [day])

  // Keyed on the day (see NewStoryFlow), so these start from that day's data: the best hour, and
  // the first five events — or a previous draft's events when editing it.
  const [postMinute, setPostMinute] = useState<number | null>(() => (hours.length > 0 ? hours[0].hour * 60 : null))
  const [selected, setSelected] = useState<string[]>(() => {
    const keys = new Set(candidates.map(keyOf))
    const fromDraft = (initialLines ?? []).map(keyOf).filter((k) => keys.has(k))
    return fromDraft.length > 0 ? fromDraft : candidates.slice(0, STORY_SIZE).map(keyOf)
  })
  const [edits, setEdits] = useState<Record<string, LineEdits>>(() =>
    Object.fromEntries(
      (initialLines ?? []).map((l) => [keyOf(l), {dayTimeLine: l.dayTimeLine, line1: l.line1, line2: l.line2}]),
    ),
  )

  const toggle = (key: string) => {
    setSelected((cur) => {
      if (cur.includes(key)) return cur.filter((k) => k !== key)
      if (cur.length >= STORY_SIZE) {
        toast.info(`An Events Story holds ${STORY_SIZE} events — untick one first`)
        return cur
      }
      return [...cur, key]
    })
  }

  const lineFor = (c: StoryCandidate): StoryLineDraft => {
    const e = edits[keyOf(c)]
    return {
      eventIds: c.eventIds,
      date: c.date,
      endDate: c.endDate,
      dayNumber: c.dayNumber,
      month: c.month,
      dayTimeLine: e?.dayTimeLine ?? c.dayTimeLine,
      line1: e?.line1 ?? c.line1,
      line2: e ? e.line2 : c.line2,
    }
  }

  const chosen = candidates.filter((c) => selected.includes(keyOf(c)))

  const create = useMutation({
    mutationFn: createEventsStoryRun,
    onSuccess: onCreated,
    onError: (error) => toast.error(error.message),
  })

  const canDraft = chosen.length === STORY_SIZE && postMinute !== null && chosen.every((c) => lineFor(c).line1.trim())

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">When to post</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label htmlFor="post-date">Day</Label>
              <Input
                id="post-date"
                type="date"
                value={postDate}
                min={prep.today}
                max={prep.maxDate}
                onChange={(e) => e.target.value && onPostDate(e.target.value)}
                className="w-44"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="post-time">Time</Label>
              <Input
                id="post-time"
                type="time"
                step={900}
                value={postMinute !== null ? minuteToTimeInput(postMinute) : ''}
                onChange={(e) => setPostMinute(timeInputToMinute(e.target.value))}
                className="w-36"
              />
            </div>
            {postDate !== prep.postDate && (
              <Button variant="ghost" size="sm" onClick={() => onPostDate(prep.postDate)}>
                Back to default ({formatDate(prep.postDate)})
              </Button>
            )}
          </div>

          {hours.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {hours.slice(0, 3).map((h, i) => (
                <Button
                  key={h.hour}
                  size="sm"
                  variant={postMinute === h.hour * 60 ? 'default' : 'outline'}
                  onClick={() => setPostMinute(h.hour * 60)}
                >
                  {formatMinute(h.hour * 60)}
                  {i === 0 && ' · best'}
                </Button>
              ))}
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            {day?.hoursSource === 'metricool'
              ? 'Best hours from Metricool for Facebook and Instagram combined.'
              : 'Metricool best times unavailable — defaulting to 10 am.'}
            {postMinute === null && ' No good hour is left on this day; pick a time or another day.'}
          </p>
          {day && day.scheduledThatWeek.length > 0 && (
            <p className="flex items-start gap-1.5 text-sm text-amber-700 dark:text-amber-400">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              This week already has a scheduled Story (
              {day.scheduledThatWeek.map((r) => formatPostTime(r.postDate, r.postMinute)).join(', ')}).
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-base">Events</CardTitle>
          <span className={cn('text-sm', chosen.length === STORY_SIZE ? 'text-muted-foreground' : 'text-destructive')}>
            {chosen.length} of {STORY_SIZE} chosen
          </span>
        </CardHeader>
        <CardContent className="space-y-2">
          {dayLoading && <AIProgress message="Loading events for that day…" progress={50} />}
          {dayError && <p className="text-sm text-destructive">{dayError}</p>}
          {!dayLoading && candidates.length === 0 && (
            <p className="text-sm text-muted-foreground">No confirmed events on the printed calendar from this day.</p>
          )}
          {candidates.map((c) => {
            const key = keyOf(c)
            const isOn = selected.includes(key)
            const line = lineFor(c)
            const setField = (field: keyof LineEdits, value: string) =>
              setEdits((cur) => ({
                ...cur,
                [key]: {...line, ...cur[key], [field]: field === 'line2' ? value || null : value},
              }))
            return (
              <div key={key} className={cn('rounded-md border p-3', isOn && 'border-primary/50 bg-primary/5')}>
                <label className="flex cursor-pointer items-start gap-3">
                  <Checkbox checked={isOn} onCheckedChange={() => toggle(key)} className="mt-1" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <span className="font-medium">
                        {formatDate(c.date)}
                        {c.endDate && ` – ${formatDate(c.endDate)}`}
                      </span>
                      <span className="text-sm text-muted-foreground">{c.title.replace(/\s*\n+\s*/g, ' · ')}</span>
                    </div>
                    {c.warnings.map((w) => (
                      <p key={w} className="mt-1 flex items-start gap-1 text-xs text-amber-700 dark:text-amber-400">
                        <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                        {w}
                      </p>
                    ))}
                  </div>
                </label>
                {isOn && (
                  <div className="mt-3 grid gap-2 pl-7 sm:grid-cols-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Day / time</Label>
                      <Input value={line.dayTimeLine} onChange={(e) => setField('dayTimeLine', e.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Title line 1</Label>
                      <Input value={line.line1} onChange={(e) => setField('line1', e.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Title line 2</Label>
                      <Input
                        value={line.line2 ?? ''}
                        placeholder="(one line)"
                        onChange={(e) => setField('line2', e.target.value)}
                      />
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button
          disabled={!canDraft || create.isPending}
          onClick={() => create.mutate({postDate, postMinute: postMinute!, lines: chosen.map(lineFor)})}
        >
          Make draft
        </Button>
        <Button variant="ghost" onClick={onCancel} disabled={create.isPending}>
          Cancel
        </Button>
      </div>
    </div>
  )
}
