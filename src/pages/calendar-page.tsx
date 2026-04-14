import {Button} from '@/components/ui/button'
import {Calendar as CalendarWidget} from '@/components/ui/calendar'
import {Card, CardContent} from '@/components/ui/card'
import {Pagination} from '@/components/ui/pagination'
import {PageSpinner} from '@/components/ui/spinner'
import {type CalendarEvent, fetchCalendarEvents, fetchSettings, triggerCalendarSync} from '@/lib/api'
import {queryKeys} from '@/lib/query-keys'
import {cn} from '@/lib/utils'
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'
import {CalendarDays, Calendar as CalendarIcon, MapPin, RefreshCw, Settings} from 'lucide-react'
import {useMemo, useState} from 'react'
import {Link} from 'react-router-dom'

const DAYS_AHEAD = 180
const PAGE_SIZE = 10

const MONTHS_LONG = [
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

function ordinalSuffix(n: number): string {
  const v = n % 100
  if (v >= 11 && v <= 13) return 'th'
  switch (n % 10) {
    case 1:
      return 'st'
    case 2:
      return 'nd'
    case 3:
      return 'rd'
    default:
      return 'th'
  }
}

function formatDatePart(d: Date): string {
  const day = d.getDate()
  return `${MONTHS_LONG[d.getMonth()]} ${day}${ordinalSuffix(day)}, ${d.getFullYear()}`
}

function formatTimePart(d: Date): string {
  const h = d.getHours()
  const ampm = h < 12 ? 'AM' : 'PM'
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${h12}:${mm} ${ampm}`
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function formatFullDateTime(event: CalendarEvent): string {
  const start = new Date(event.startDate)
  const end = new Date(event.endDate)
  const startDate = formatDatePart(start)
  if (event.allDay) {
    const lastDay = new Date(end.getTime() - 1)
    if (sameDay(start, lastDay)) return `${startDate} · All day`
    return `${startDate} – ${formatDatePart(lastDay)} · All day`
  }
  if (sameDay(start, end)) return `${startDate} at ${formatTimePart(start)} – ${formatTimePart(end)}`
  return `${startDate} ${formatTimePart(start)} – ${formatDatePart(end)} ${formatTimePart(end)}`
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function eventDayKeys(event: CalendarEvent): string[] {
  const start = new Date(event.startDate)
  const end = new Date(event.endDate)
  const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate())
  const endBoundary = event.allDay ? new Date(end.getTime() - 1) : end
  const endDay = new Date(endBoundary.getFullYear(), endBoundary.getMonth(), endBoundary.getDate())
  const keys: string[] = []
  for (let i = 0; cursor <= endDay && i < 366; i++) {
    keys.push(dayKey(cursor))
    cursor.setDate(cursor.getDate() + 1)
  }
  return keys
}

function ColorDot({color, className}: {color: string; className?: string}) {
  return <span className={cn('inline-block rounded-full shrink-0', className)} style={{backgroundColor: color}} />
}

function formatRelative(iso: string | null | undefined): string {
  if (!iso) return 'never'
  const then = new Date(iso).getTime()
  const diff = Date.now() - then
  if (diff < 60_000) return 'just now'
  const mins = Math.round(diff / 60_000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.round(hrs / 24)
  return `${days}d ago`
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

export function CalendarPage() {
  const [displayedMonth, setDisplayedMonth] = useState<Date>(() => startOfMonth(new Date()))
  const [page, setPage] = useState(1)
  const [dismissedMissing, setDismissedMissing] = useState<Set<string>>(new Set())
  const [enabledCalendars, setEnabledCalendars] = useState<Set<string> | null>(null)

  const queryClient = useQueryClient()
  const {data: settings} = useQuery({queryKey: queryKeys.settings, queryFn: fetchSettings})

  const configuredCalendars: string[] = useMemo(() => {
    const raw = settings?.churchCalendarNames
    if (!raw) return []
    try {
      return JSON.parse(raw) as string[]
    } catch {
      return []
    }
  }, [settings])

  const {data, isLoading, error, refetch, isFetching} = useQuery({
    queryKey: ['calendar-events', DAYS_AHEAD],
    queryFn: () => fetchCalendarEvents(DAYS_AHEAD),
    enabled: configuredCalendars.length > 0,
    retry: false,
  })

  const syncMutation = useMutation({
    mutationFn: triggerCalendarSync,
    onSettled: () => {
      queryClient.invalidateQueries({queryKey: ['calendar-events']})
    },
  })

  const handleSync = () => syncMutation.mutate()
  const isBusy = isFetching || syncMutation.isPending

  const effectiveEnabled = useMemo(() => {
    if (enabledCalendars !== null) return enabledCalendars
    const names = data?.calendarNames ?? configuredCalendars
    return new Set(names)
  }, [enabledCalendars, data, configuredCalendars])

  const toggleCalendar = (name: string) => {
    setEnabledCalendars((prev) => {
      const base = prev ?? new Set(data?.calendarNames ?? configuredCalendars)
      const next = new Set(base)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  const allCalendarNames = data?.calendarNames ?? configuredCalendars

  const visibleEvents = useMemo(() => {
    if (!data?.events) return []
    return data.events.filter((e) => effectiveEnabled.has(e.calendarName))
  }, [data, effectiveEnabled])

  const daysWithEvents = useMemo(() => {
    const set = new Set<string>()
    const out: Date[] = []
    for (const event of visibleEvents) {
      for (const key of eventDayKeys(event)) {
        if (set.has(key)) continue
        set.add(key)
        const [y, m, d] = key.split('-').map(Number)
        out.push(new Date(y, m - 1, d))
      }
    }
    return out
  }, [visibleEvents])

  const monthEvents = useMemo(() => {
    const monthStart = new Date(displayedMonth.getFullYear(), displayedMonth.getMonth(), 1).getTime()
    const monthEnd = new Date(displayedMonth.getFullYear(), displayedMonth.getMonth() + 1, 1).getTime()
    return visibleEvents
      .filter((e) => {
        const start = new Date(e.startDate).getTime()
        const end = new Date(e.endDate).getTime()
        return start < monthEnd && end > monthStart
      })
      .sort((a, b) => a.startDate.localeCompare(b.startDate))
  }, [visibleEvents, displayedMonth])

  const filterKey = `${displayedMonth.getTime()}|${[...effectiveEnabled].sort().join(',')}`
  const [lastFilterKey, setLastFilterKey] = useState(filterKey)
  if (lastFilterKey !== filterKey) {
    setLastFilterKey(filterKey)
    setPage(1)
  }

  const paginatedEvents = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE
    return monthEvents.slice(start, start + PAGE_SIZE)
  }, [monthEvents, page])

  const missingToShow = (data?.missing ?? []).filter((m) => !dismissedMissing.has(m))

  if (configuredCalendars.length === 0 && !isLoading) {
    return (
      <div className="p-4 md:p-6 space-y-6">
        <CalendarHeader onRefresh={handleSync} isFetching={isBusy} />
        <Card>
          <CardContent className="py-12 text-center space-y-3">
            <CalendarIcon className="h-10 w-10 text-muted-foreground mx-auto" />
            <p className="text-sm font-medium">No calendars configured</p>
            <p className="text-sm text-muted-foreground">Select calendars to display in Settings.</p>
            <Link to="/settings">
              <Button variant="outline" size="sm" className="mt-2">
                <Settings className="h-4 w-4 mr-2" />
                Open Settings
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (isLoading) return <PageSpinner />

  if (error) {
    const msg = error instanceof Error ? error.message : String(error)
    const isAccessDenied = msg.toLowerCase().includes('access denied') || msg.toLowerCase().includes('not authorized')
    return (
      <div className="p-4 md:p-6 space-y-6">
        <CalendarHeader onRefresh={handleSync} isFetching={isBusy} />
        <Card>
          <CardContent className="py-12 text-center space-y-3">
            <CalendarIcon className="h-10 w-10 text-muted-foreground mx-auto" />
            <p className="text-sm font-medium text-destructive">
              {isAccessDenied ? 'Calendar Access Denied' : 'Error loading events'}
            </p>
            {isAccessDenied ? (
              <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                Grant Calendar access in System Settings → Privacy &amp; Security → Calendars, then refresh.
              </p>
            ) : (
              <p className="text-sm text-muted-foreground max-w-sm mx-auto">{msg}</p>
            )}
            <Button variant="outline" size="sm" onClick={() => refetch()} className="mt-2">
              <RefreshCw className="h-4 w-4 mr-2" />
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  const lastSyncError = syncMutation.data?.ok === false ? syncMutation.data.error : data?.lastSyncError
  const hasEventsModifier = 'rdp-has-events'
  const monthLabel = `${MONTHS_LONG[displayedMonth.getMonth()]} ${displayedMonth.getFullYear()}`

  return (
    <div className="p-4 md:p-6 space-y-6">
      <CalendarHeader onRefresh={handleSync} isFetching={isBusy} lastSyncedAt={data?.lastSyncedAt ?? null} />

      {lastSyncError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          Last sync failed: {lastSyncError}
        </div>
      )}

      {missingToShow.map((name) => (
        <div
          key={name}
          className="flex items-center justify-between gap-2 rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm dark:border-yellow-900 dark:bg-yellow-950"
        >
          <span className="text-yellow-800 dark:text-yellow-200">
            Calendar &ldquo;{name}&rdquo; is no longer available — update in{' '}
            <Link to="/settings" className="underline">
              Settings
            </Link>
            .
          </span>
          <button
            onClick={() => setDismissedMissing((prev) => new Set([...prev, name]))}
            className="shrink-0 text-yellow-600 hover:text-yellow-800 dark:text-yellow-400 cursor-pointer"
          >
            ✕
          </button>
        </div>
      ))}

      {allCalendarNames.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {allCalendarNames.map((name) => {
            const color = data?.calendarColors?.[name] ?? '#6B7280'
            const isOn = effectiveEnabled.has(name)
            return (
              <button
                key={name}
                onClick={() => toggleCalendar(name)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1 rounded-full border text-sm font-medium transition-colors cursor-pointer',
                  isOn ? 'border-border bg-card' : 'border-border/50 bg-muted/30 text-muted-foreground',
                )}
              >
                <ColorDot color={color} className="h-2 w-2" />
                {name}
              </button>
            )
          })}
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          <div className="grid grid-cols-1 lg:grid-cols-5">
            {/* Events list */}
            <div className="lg:col-span-3 p-4 md:p-6 space-y-3 lg:border-r">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-lg font-semibold">Events in {monthLabel}</h2>
              </div>

              {monthEvents.length === 0 ? (
                <div className="py-12 text-center">
                  <p className="text-sm text-muted-foreground">No events in {monthLabel}.</p>
                </div>
              ) : (
                <>
                  <div className="rounded-lg border divide-y">
                    {paginatedEvents.map((event, idx) => {
                      const calendarColor = data?.calendarColors?.[event.calendarName] ?? '#6B7280'
                      const color = event.recurring ? '#9CA3AF' : calendarColor
                      const firstLineLocation = event.location ? event.location.split('\n')[0] : null
                      return (
                        <div key={`${event.id}-${idx}`} className="flex items-start gap-3 px-4 py-3">
                          <ColorDot color={color} className="h-2.5 w-2.5 mt-1.5" />
                          <div className="flex-1 min-w-0 space-y-1">
                            <p className="text-sm font-semibold truncate">{event.title || '(No title)'}</p>
                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <CalendarDays className="h-3 w-3 shrink-0" />
                                <span>{formatFullDateTime(event)}</span>
                              </span>
                              {firstLineLocation && (
                                <span className="flex items-center gap-1 min-w-0">
                                  <MapPin className="h-3 w-3 shrink-0" />
                                  <span className="truncate">{firstLineLocation}</span>
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  <Pagination
                    page={page}
                    pageSize={PAGE_SIZE}
                    total={monthEvents.length}
                    onPageChange={setPage}
                    noun="events"
                  />
                </>
              )}
            </div>

            {/* Month calendar sidebar */}
            <div className="lg:col-span-2 p-4 md:p-6 flex justify-center items-start">
              <CalendarWidget
                mode="single"
                month={displayedMonth}
                onMonthChange={setDisplayedMonth}
                style={{'--cell-size': '4rem'} as React.CSSProperties}
                className="[&_[data-day]]:pointer-events-none [&_[data-day]]:cursor-default [&_[data-day]]:hover:bg-transparent [&_[data-day]]:hover:text-foreground"
                modifiers={{[hasEventsModifier]: daysWithEvents}}
                modifiersClassNames={{
                  [hasEventsModifier]:
                    'relative after:content-[""] after:absolute after:bottom-2 after:left-1/2 after:-translate-x-1/2 after:h-1.5 after:w-1.5 after:rounded-full after:bg-primary',
                }}
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function CalendarHeader({
  onRefresh,
  isFetching,
  lastSyncedAt,
}: {
  onRefresh: () => void
  isFetching: boolean
  lastSyncedAt?: string | null
}) {
  return (
    <div className="flex items-center justify-between gap-4 flex-wrap">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <CalendarIcon className="h-6 w-6" />
          Calendar
        </h1>
        {lastSyncedAt !== undefined && (
          <p className="text-xs text-muted-foreground mt-1">Last synced {formatRelative(lastSyncedAt)}</p>
        )}
      </div>
      <Button variant="outline" size="sm" onClick={onRefresh} disabled={isFetching} title="Sync now">
        <RefreshCw className={cn('h-4 w-4', isFetching && 'animate-spin')} />
      </Button>
    </div>
  )
}
