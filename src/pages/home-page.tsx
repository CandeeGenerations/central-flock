import {Badge} from '@/components/ui/badge'
import {Button} from '@/components/ui/button'
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card'
import {PageSpinner} from '@/components/ui/spinner'
import {
  type HomeAttention,
  type HomeResponse,
  type HomeScheduledMessage,
  type HomeUpcomingChurchEvent,
  checkAuthStatus,
  fetchHome,
  logout,
} from '@/lib/api'
import {queryKeys} from '@/lib/query-keys'
import {type RecentEntity, fetchRecents} from '@/lib/usage-api'
import {cn} from '@/lib/utils'
import {useQuery, useQueryClient} from '@tanstack/react-query'
import {
  AlertTriangle,
  Baby,
  BookOpen,
  Cake,
  Calendar,
  CalendarCheck,
  FileText,
  FolderOpen,
  Hash,
  Heart,
  LogOut,
  MessageSquare,
  Music,
  Quote,
  ScrollText,
  Send,
  Settings,
  Sparkles,
  Tent,
  Users,
} from 'lucide-react'
import type {LucideIcon} from 'lucide-react'
import type {ReactNode} from 'react'
import {Link} from 'react-router-dom'

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function formatEventDate(month: number, day: number): string {
  return `${MONTH_NAMES[month - 1]} ${day}`
}

function daysLabel(days: number): string {
  if (days === 0) return 'Today'
  if (days === 1) return 'Tomorrow'
  return `${days} days`
}

export function HomePage() {
  const queryClient = useQueryClient()
  const {data, isLoading} = useQuery({queryKey: queryKeys.home, queryFn: fetchHome})
  const {data: authStatus} = useQuery({queryKey: ['auth-status'], queryFn: checkAuthStatus})
  const {data: recents} = useQuery({queryKey: queryKeys.usageRecents, queryFn: fetchRecents})

  if (isLoading || !data) return <PageSpinner />

  const {
    upcomingBirthdays,
    upcomingAnniversaries,
    upcomingChurchEvents,
    calendarColors,
    stats,
    attention,
    scheduledMessages,
  } = data

  // Merge and sort upcoming celebrations
  const celebrations = [
    ...upcomingBirthdays.map((b) => ({...b, eventType: 'birthday' as const})),
    ...upcomingAnniversaries.map((a) => ({...a, eventType: 'anniversary' as const})),
  ].sort((a, b) => a.daysUntil - b.daysUntil)

  return (
    <div className="p-4 md:p-6 space-y-6">
      <h1 className="text-2xl font-bold">Home</h1>

      {/* Needs attention */}
      <NeedsAttention attention={attention} />

      {/* Jump back in */}
      <JumpBackIn recents={recents ?? []} />

      {/* Upcoming */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <UpcomingCard
          events={upcomingChurchEvents}
          scheduledMessages={scheduledMessages}
          calendarColors={calendarColors}
        />
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Cake className="h-4 w-4 text-muted-foreground" />
              Upcoming Celebrations
            </CardTitle>
          </CardHeader>
          <CardContent>
            {celebrations.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No birthdays or anniversaries in the next 14 days.
              </p>
            ) : (
              <div className="space-y-1">
                {celebrations.map((event) => (
                  <Link
                    key={`${event.eventType}-${event.personId}`}
                    to={`/people/${event.personId}`}
                    className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-muted/50 transition-colors"
                  >
                    {event.eventType === 'birthday' ? (
                      <Cake className="h-4 w-4 text-pink-500 shrink-0" />
                    ) : (
                      <Heart className="h-4 w-4 text-red-500 shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{event.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {event.eventType === 'birthday' && 'turningAge' in event && event.turningAge
                          ? `Turning ${event.turningAge}`
                          : event.eventType === 'anniversary' && 'years' in event && event.years
                            ? `${event.years} year${event.years !== 1 ? 's' : ''}`
                            : event.eventType === 'birthday'
                              ? 'Birthday'
                              : 'Anniversary'}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <Badge
                        variant={event.daysUntil === 0 ? 'default' : 'secondary'}
                        className={cn(event.daysUntil === 0 && 'bg-green-600 text-white')}
                      >
                        {daysLabel(event.daysUntil)}
                      </Badge>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {formatEventDate(event.month, event.day)}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Tools */}
      <section>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Tools</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <ToolCard to="/dashboard" icon={MessageSquare} title="Messaging">
            <p className="text-sm text-muted-foreground">
              {stats.people.toLocaleString()} people &middot; {stats.groups.toLocaleString()} groups
            </p>
            <p className="text-sm text-muted-foreground">
              {stats.messagesSentThisMonth.toLocaleString()} sent this month
            </p>
          </ToolCard>
          <ToolCard to="/devotions/stats" icon={BookOpen} title="Devotions">
            <p className="text-sm text-muted-foreground">
              {stats.devotionsTotal.toLocaleString()} total &middot; Latest #
              {stats.devotionsLatestNumber.toLocaleString()}
            </p>
            <p className="text-sm text-muted-foreground">{stats.devotionsCompletionRate}% pipeline completion</p>
          </ToolCard>
          <ToolCard to="/nursery" icon={Baby} title="Nursery Schedule">
            <p className="text-sm text-muted-foreground">Generate and manage monthly nursery schedules</p>
          </ToolCard>
          <ToolCard to="/sermons/research" icon={ScrollText} title="Sermon Prep">
            <p className="text-sm text-muted-foreground">{stats.quotesTotal.toLocaleString()} quotes</p>
            <p className="text-sm text-muted-foreground">AI-powered topic research</p>
          </ToolCard>
          <ToolCard to="/calendar" icon={Calendar} title="Calendar">
            <p className="text-sm text-muted-foreground">
              {stats.upcomingChurchEventsTotal.toLocaleString()} events in next 30 days
            </p>
          </ToolCard>
        </div>
      </section>

      {/* Stats footer */}
      <StatsFooter stats={stats} />

      {/* Mobile settings & logout */}
      <div className="md:hidden grid grid-cols-2 gap-3 pt-2">
        <Link to="/settings">
          <Button variant="outline" className="w-full">
            <Settings className="h-4 w-4 mr-2" />
            Settings
          </Button>
        </Link>
        {authStatus?.authRequired && (
          <Button
            variant="outline"
            className="w-full"
            onClick={async () => {
              await logout()
              queryClient.invalidateQueries({queryKey: ['auth-status']})
            }}
          >
            <LogOut className="h-4 w-4 mr-2" />
            Logout
          </Button>
        )}
      </div>
    </div>
  )
}

// --- Needs attention -------------------------------------------------------

function NeedsAttention({attention}: {attention: HomeAttention}) {
  const segments: {label: string; to: string}[] = []
  if (attention.draftsOlderThan2Days > 0)
    segments.push({
      label: `${attention.draftsOlderThan2Days} draft${attention.draftsOlderThan2Days !== 1 ? 's' : ''}`,
      to: '/messages?tab=drafts',
    })
  if (attention.rsvpsNeedingReplies > 0)
    segments.push({
      label: `${attention.rsvpsNeedingReplies} RSVP${attention.rsvpsNeedingReplies !== 1 ? 's' : ''} need replies`,
      to: '/rsvp',
    })
  if (attention.nurseryNextMonthUnfinalized)
    segments.push({label: `Nursery (${attention.nurseryNextMonthLabel})`, to: '/nursery'})
  if (attention.devotionsIncomplete > 0)
    segments.push({
      label: `${attention.devotionsIncomplete} devotion${attention.devotionsIncomplete !== 1 ? 's' : ''}`,
      to: '/devotions/stats',
    })

  if (segments.length === 0) return null

  return (
    <div className="flex flex-wrap items-center gap-x-1 gap-y-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm">
      <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-500 shrink-0" />
      <span className="font-medium text-amber-700 dark:text-amber-400 mr-1">Needs attention</span>
      {segments.map((seg, i) => (
        <span key={seg.to} className="flex items-center gap-1">
          {i > 0 && <span className="text-muted-foreground">&middot;</span>}
          <Link to={seg.to} className="rounded px-1 py-0.5 font-medium hover:bg-amber-500/20 transition-colors">
            {seg.label}
          </Link>
        </span>
      ))}
    </div>
  )
}

// --- Jump back in ----------------------------------------------------------

const ENTITY_ICON: Record<string, LucideIcon> = {
  person: Users,
  group: FolderOpen,
  message: MessageSquare,
  template: FileText,
  devotion: BookOpen,
  passage: Sparkles,
  gwendolyn_devotion: BookOpen,
  quote: Quote,
  special: Music,
  hymn_search: Music,
  special_music_schedule: Music,
  nursery_schedule: Baby,
  fair_booth_schedule: Tent,
  rsvp_list: CalendarCheck,
}

function JumpBackIn({recents}: {recents: RecentEntity[]}) {
  if (recents.length === 0) return null
  const items = recents.slice(0, 8)
  return (
    <section>
      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Jump back in</h2>
      <div className="flex flex-wrap gap-2">
        {items.map((item) => {
          const Icon = ENTITY_ICON[item.entityType] ?? Hash
          return (
            <Link
              key={item.path}
              to={item.path}
              className="flex items-center gap-2 rounded-full border bg-card px-3 py-1.5 text-sm hover:bg-muted/50 transition-colors"
            >
              <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="font-medium truncate max-w-[200px]">{item.label}</span>
              <span className="text-xs text-muted-foreground">{item.typeLabel}</span>
            </Link>
          )
        })}
      </div>
    </section>
  )
}

// --- Upcoming (events + scheduled messages) --------------------------------

function formatChurchEventTime(event: HomeUpcomingChurchEvent): string {
  if (event.allDay) return 'All day'
  return formatTime(event.startDate)
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  const h = d.getHours()
  const m = d.getMinutes()
  const ampm = h < 12 ? 'AM' : 'PM'
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
  const mm = m > 0 ? `:${String(m).padStart(2, '0')}` : ''
  return `${h12}${mm} ${ampm}`
}

function relativeDay(iso: string): string {
  const d = new Date(iso)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const diff = Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Tomorrow'
  return `${diff} days`
}

type AgendaRow =
  | {kind: 'event'; sort: number; event: HomeUpcomingChurchEvent}
  | {kind: 'message'; sort: number; message: HomeScheduledMessage}

function UpcomingCard({
  events,
  scheduledMessages,
  calendarColors,
}: {
  events: HomeUpcomingChurchEvent[]
  scheduledMessages: HomeScheduledMessage[]
  calendarColors: Record<string, string>
}) {
  const rows: AgendaRow[] = [
    ...events.map((event) => ({kind: 'event' as const, sort: new Date(event.startDate).getTime(), event})),
    ...scheduledMessages
      .filter((m) => m.scheduledAt)
      .map((message) => ({kind: 'message' as const, sort: new Date(message.scheduledAt!).getTime(), message})),
  ].sort((a, b) => a.sort - b.sort)

  if (rows.length === 0) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="h-4 w-4" />
          Upcoming Events
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-1">
          {rows.map((row, idx) =>
            row.kind === 'event' ? (
              <Link
                key={`event-${row.event.id}-${idx}`}
                to="/calendar"
                className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-muted/50 transition-colors"
              >
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
                  style={{
                    backgroundColor: row.event.recurring
                      ? '#9CA3AF'
                      : (calendarColors[row.event.calendarName] ?? '#6B7280'),
                  }}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{row.event.title || '(No title)'}</p>
                  {row.event.location && (
                    <p className="text-xs text-muted-foreground truncate">{row.event.location.split('\n')[0]}</p>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <Badge variant="secondary" className="text-xs">
                    {relativeDay(row.event.startDate)}
                  </Badge>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{formatChurchEventTime(row.event)}</p>
                </div>
              </Link>
            ) : (
              <Link
                key={`msg-${row.message.id}`}
                to="/messages?tab=scheduled"
                className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-muted/50 transition-colors opacity-70"
              >
                <Send className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    Scheduled message &middot; {row.message.totalRecipients} recipient
                    {row.message.totalRecipients !== 1 ? 's' : ''}
                  </p>
                  {row.message.preview && (
                    <p className="text-xs text-muted-foreground truncate">{row.message.preview}</p>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <Badge variant="outline" className="text-xs">
                    {relativeDay(row.message.scheduledAt!)}
                  </Badge>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{formatTime(row.message.scheduledAt!)}</p>
                </div>
              </Link>
            ),
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// --- Tools -----------------------------------------------------------------

function ToolCard({
  to,
  icon: Icon,
  title,
  children,
}: {
  to: string
  icon: LucideIcon
  title: string
  children: ReactNode
}) {
  return (
    <Link to={to}>
      <Card className="hover:bg-muted/50 transition-colors cursor-pointer h-full">
        <CardContent className="flex items-start gap-4 p-5">
          <div className="rounded-lg bg-primary/10 p-3 shrink-0">
            <Icon className="h-6 w-6 text-primary" />
          </div>
          <div className="space-y-1">
            <h3 className="font-semibold">{title}</h3>
            {children}
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}

// --- Stats footer ----------------------------------------------------------

function StatsFooter({stats}: {stats: HomeResponse['stats']}) {
  const chips: {label: string; value: number; to: string; icon: LucideIcon}[] = [
    {label: 'People', value: stats.people, to: '/people', icon: Users},
    {label: 'Groups', value: stats.groups, to: '/groups', icon: FolderOpen},
    {label: 'Messages', value: stats.messagesSentThisMonth, to: '/messages', icon: MessageSquare},
    {label: 'Templates', value: stats.templates, to: '/templates', icon: FileText},
    {label: 'Devotions', value: stats.devotionsTotal, to: '/devotions', icon: BookOpen},
    {label: 'Latest', value: stats.devotionsLatestNumber, to: '/devotions', icon: Hash},
    {label: 'Quotes', value: stats.quotesTotal, to: '/sermons/quotes', icon: Quote},
    {label: 'Events', value: stats.upcomingChurchEventsTotal, to: '/calendar', icon: Calendar},
  ]
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-2 border-t pt-4 text-sm text-muted-foreground">
      {chips.map((chip) => {
        const Icon = chip.icon
        return (
          <Link
            key={chip.label}
            to={chip.to}
            className="flex items-center gap-1.5 hover:text-foreground transition-colors"
          >
            <Icon className="h-3.5 w-3.5 shrink-0" />
            <span>{chip.label}</span>
            <span className="font-semibold text-foreground">{chip.value.toLocaleString()}</span>
          </Link>
        )
      })}
    </div>
  )
}
