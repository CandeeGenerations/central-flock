import {Badge} from '@/components/ui/badge'
import {Button} from '@/components/ui/button'
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card'
import {Dialog, DialogContent, DialogHeader, DialogTitle} from '@/components/ui/dialog'
import {Input} from '@/components/ui/input'
import {PageSpinner} from '@/components/ui/spinner'
import {
  type HomePinnedItem,
  fetchGroups,
  fetchHome,
  fetchPeople,
  fetchTemplates,
  pinHomeItem,
  unpinHomeItem,
} from '@/lib/api'
import {queryKeys} from '@/lib/query-keys'
import {cn} from '@/lib/utils'
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'
import {
  BookOpen,
  Cake,
  FileText,
  FolderOpen,
  FolderPlus,
  Heart,
  MessageSquare,
  Pin,
  PinOff,
  Plus,
  UserPlus,
  Users,
} from 'lucide-react'
import {useMemo, useState} from 'react'
import {Link} from 'react-router-dom'
import {toast} from 'sonner'

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function formatEventDate(month: number, day: number): string {
  return `${MONTH_NAMES[month - 1]} ${day}`
}

function daysLabel(days: number): string {
  if (days === 0) return 'Today'
  if (days === 1) return 'Tomorrow'
  return `${days} days`
}

const quickActions = [
  {icon: MessageSquare, label: 'Compose Message', to: '/messages/compose'},
  {icon: UserPlus, label: 'Add Person', to: '/people?add=1'},
  {icon: FolderPlus, label: 'Create Group', to: '/groups?add=1'},
  {icon: FileText, label: 'New Template', to: '/templates/new'},
]

function pinRoute(pin: HomePinnedItem): string {
  if (pin.type === 'person') return `/people/${pin.itemId}`
  if (pin.type === 'group') return `/groups/${pin.itemId}`
  return `/templates/${pin.itemId}/edit`
}

const PIN_TYPE_ICON = {
  person: Users,
  group: FolderOpen,
  template: FileText,
}

export function HomePage() {
  const queryClient = useQueryClient()
  const {data, isLoading} = useQuery({
    queryKey: queryKeys.home,
    queryFn: fetchHome,
  })

  const [pinDialogOpen, setPinDialogOpen] = useState(false)

  const unpinMutation = useMutation({
    mutationFn: (id: number) => unpinHomeItem(id),
    onSuccess: () => {
      queryClient.invalidateQueries({queryKey: queryKeys.home})
      toast.success('Unpinned')
    },
  })

  if (isLoading || !data) return <PageSpinner />

  const {upcomingBirthdays, upcomingAnniversaries, stats, pinnedItems} = data

  // Merge and sort upcoming events
  const events = [
    ...upcomingBirthdays.map((b) => ({...b, eventType: 'birthday' as const})),
    ...upcomingAnniversaries.map((a) => ({...a, eventType: 'anniversary' as const})),
  ].sort((a, b) => a.daysUntil - b.daysUntil)

  return (
    <div className="p-4 md:p-6 space-y-6">
      <h1 className="text-2xl font-bold">Home</h1>

      {/* Quick Actions */}
      <section>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Quick Actions</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {quickActions.map(({icon: Icon, label, to}) => (
            <Link key={to} to={to}>
              <Card
                size="sm"
                className="hover:bg-muted/50 transition-colors cursor-pointer h-full flex flex-col items-center justify-center gap-2 py-4"
              >
                <Icon className="h-6 w-6 text-primary" />
                <span className="text-sm font-medium text-center">{label}</span>
              </Card>
            </Link>
          ))}
        </div>
      </section>

      {/* Upcoming Events + Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Upcoming Events */}
        <Card>
          <CardHeader>
            <CardTitle>Upcoming Events</CardTitle>
          </CardHeader>
          <CardContent>
            {events.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No birthdays or anniversaries in the next 14 days.
              </p>
            ) : (
              <div className="space-y-1">
                {events.map((event) => (
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

        {/* At-a-Glance Stats */}
        <div className="grid grid-cols-2 gap-3 content-start">
          <StatCard label="People" value={stats.people} to="/people" />
          <StatCard label="Groups" value={stats.groups} to="/groups" />
          <StatCard label="Messages (month)" value={stats.messagesSentThisMonth} to="/messages" />
          <StatCard label="Templates" value={stats.templates} to="/templates" />
          <StatCard label="Devotions" value={stats.devotionsTotal} to="/devotions" />
          <StatCard label="Latest #" value={stats.devotionsLatestNumber} to="/devotions" />
        </div>
      </div>

      {/* Tool Launcher */}
      <section>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Tools</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Link to="/dashboard">
            <Card className="hover:bg-muted/50 transition-colors cursor-pointer h-full">
              <CardContent className="flex items-start gap-4 p-5">
                <div className="rounded-lg bg-primary/10 p-3 shrink-0">
                  <MessageSquare className="h-6 w-6 text-primary" />
                </div>
                <div className="space-y-1">
                  <h3 className="font-semibold">Messaging</h3>
                  <p className="text-sm text-muted-foreground">
                    {stats.people} people &middot; {stats.groups} groups
                  </p>
                  <p className="text-sm text-muted-foreground">{stats.messagesSentThisMonth} sent this month</p>
                </div>
              </CardContent>
            </Card>
          </Link>
          <Link to="/devotions/stats">
            <Card className="hover:bg-muted/50 transition-colors cursor-pointer h-full">
              <CardContent className="flex items-start gap-4 p-5">
                <div className="rounded-lg bg-primary/10 p-3 shrink-0">
                  <BookOpen className="h-6 w-6 text-primary" />
                </div>
                <div className="space-y-1">
                  <h3 className="font-semibold">Devotions</h3>
                  <p className="text-sm text-muted-foreground">
                    {stats.devotionsTotal} total &middot; Latest #{stats.devotionsLatestNumber}
                  </p>
                  <p className="text-sm text-muted-foreground">{stats.devotionsCompletionRate}% pipeline completion</p>
                </div>
              </CardContent>
            </Card>
          </Link>
        </div>
      </section>

      {/* Pinned Items */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Pinned</h2>
          <Button variant="ghost" size="sm" onClick={() => setPinDialogOpen(true)}>
            <Pin className="h-4 w-4 mr-1" />
            Pin Item
          </Button>
        </div>
        {pinnedItems.length === 0 ? (
          <Card size="sm" className="p-6">
            <p className="text-sm text-muted-foreground text-center">
              Pin people, groups, or templates for quick access.
            </p>
          </Card>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {pinnedItems.map((pin) => {
              const Icon = PIN_TYPE_ICON[pin.type]
              return (
                <Card key={pin.id} size="sm" className="group relative hover:bg-muted/50 transition-colors">
                  <Link to={pinRoute(pin)} className="block p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="text-sm font-medium truncate">{pin.name}</span>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{pin.subtitle}</p>
                  </Link>
                  <button
                    onClick={(e) => {
                      e.preventDefault()
                      unpinMutation.mutate(pin.id)
                    }}
                    className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-muted"
                  >
                    <PinOff className="h-3 w-3 text-muted-foreground" />
                  </button>
                </Card>
              )
            })}
          </div>
        )}
      </section>

      <PinDialog open={pinDialogOpen} onOpenChange={setPinDialogOpen} existingPins={pinnedItems} />
    </div>
  )
}

function StatCard({label, value, to}: {label: string; value: number; to: string}) {
  return (
    <Link to={to}>
      <Card size="sm" className="hover:bg-muted/50 transition-colors h-full">
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
        </CardHeader>
        <CardContent>
          <span className="text-2xl font-bold">{value.toLocaleString()}</span>
        </CardContent>
      </Card>
    </Link>
  )
}

function PinDialog({
  open,
  onOpenChange,
  existingPins,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  existingPins: HomePinnedItem[]
}) {
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<'person' | 'group' | 'template'>('person')
  const [search, setSearch] = useState('')

  const {data: people} = useQuery({
    queryKey: [...queryKeys.people, 'pin-search'],
    queryFn: () => fetchPeople({limit: 500}),
    enabled: open && tab === 'person',
  })

  const {data: groups} = useQuery({
    queryKey: [...queryKeys.groups, 'pin-search'],
    queryFn: fetchGroups,
    enabled: open && tab === 'group',
  })

  const {data: templates} = useQuery({
    queryKey: [...queryKeys.templates(), 'pin-search'],
    queryFn: () => fetchTemplates(),
    enabled: open && tab === 'template',
  })

  const pinnedSet = useMemo(() => new Set(existingPins.map((p) => `${p.type}:${p.itemId}`)), [existingPins])

  const pinMutation = useMutation({
    mutationFn: ({type, itemId}: {type: string; itemId: number}) => pinHomeItem(type, itemId),
    onSuccess: () => {
      queryClient.invalidateQueries({queryKey: queryKeys.home})
      toast.success('Pinned')
    },
    onError: (error) => {
      toast.error(error.message)
    },
  })

  const items = useMemo(() => {
    const q = search.toLowerCase()
    if (tab === 'person' && people) {
      return people.data
        .filter((p) => {
          const name = [p.firstName, p.lastName].filter(Boolean).join(' ').toLowerCase()
          return name.includes(q)
        })
        .map((p) => ({
          id: p.id,
          name: [p.firstName, p.lastName].filter(Boolean).join(' ') || 'Unknown',
          subtitle: p.phoneDisplay || '',
          pinned: pinnedSet.has(`person:${p.id}`),
        }))
    }
    if (tab === 'group' && groups) {
      return groups
        .filter((g) => g.name.toLowerCase().includes(q))
        .map((g) => ({
          id: g.id,
          name: g.name,
          subtitle: `${g.memberCount ?? 0} members`,
          pinned: pinnedSet.has(`group:${g.id}`),
        }))
    }
    if (tab === 'template' && templates) {
      return templates
        .filter((t) => t.name.toLowerCase().includes(q))
        .map((t) => ({
          id: t.id,
          name: t.name,
          subtitle: t.content.substring(0, 60) + (t.content.length > 60 ? '...' : ''),
          pinned: pinnedSet.has(`template:${t.id}`),
        }))
    }
    return []
  }, [tab, search, people, groups, templates, pinnedSet])

  const tabs: {key: typeof tab; label: string}[] = [
    {key: 'person', label: 'People'},
    {key: 'group', label: 'Groups'},
    {key: 'template', label: 'Templates'},
  ]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Pin Item</DialogTitle>
        </DialogHeader>
        <div className="flex gap-1 mb-3">
          {tabs.map(({key, label}) => (
            <button
              key={key}
              onClick={() => {
                setTab(key)
                setSearch('')
              }}
              className={cn(
                'px-3 py-1.5 rounded-md text-sm font-medium transition-colors cursor-pointer',
                tab === key ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/80',
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <Input placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} />
        <div className="max-h-64 overflow-y-auto space-y-1 mt-2">
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No items found.</p>
          ) : (
            items.map((item) => (
              <button
                key={item.id}
                disabled={item.pinned}
                onClick={() => pinMutation.mutate({type: tab, itemId: item.id})}
                className={cn(
                  'flex items-center gap-3 w-full px-3 py-2 rounded-md text-left transition-colors',
                  item.pinned ? 'opacity-50 cursor-not-allowed' : 'hover:bg-muted cursor-pointer',
                )}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{item.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{item.subtitle}</p>
                </div>
                {item.pinned ? (
                  <Badge variant="secondary">Pinned</Badge>
                ) : (
                  <Plus className="h-4 w-4 text-muted-foreground shrink-0" />
                )}
              </button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
