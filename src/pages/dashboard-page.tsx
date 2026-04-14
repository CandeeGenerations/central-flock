import {Button} from '@/components/ui/button'
import {Calendar} from '@/components/ui/calendar'
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card'
import {Popover, PopoverContent, PopoverTrigger} from '@/components/ui/popover'
import {PageSpinner} from '@/components/ui/spinner'
import {checkAuthStatus, fetchStats, fetchStatsOverTime, logout} from '@/lib/api'
import {queryKeys} from '@/lib/query-keys'
import {cn} from '@/lib/utils'
import {useQuery, useQueryClient} from '@tanstack/react-query'
import {BookOpen, CalendarIcon, LogOut, MessageSquare, Plus, Settings} from 'lucide-react'
import {useEffect, useMemo, useState} from 'react'
import type {DateRange} from 'react-day-picker'
import {Link} from 'react-router-dom'
import {Area, AreaChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis} from 'recharts'

const isMac = typeof navigator !== 'undefined' && navigator.platform.toUpperCase().includes('MAC')

const DONUT_COLORS = {
  sent: '#22c55e',
  failed: '#ef4444',
  skipped: '#eab308',
}

const PEOPLE_COLORS = {
  active: '#4f46e5',
  inactive: '#a5b4fc',
  doNotContact: '#ef4444',
}

type RangePreset = 'last7' | 'last30' | 'last90' | 'last12m' | 'all' | 'custom'

const PRESETS: {key: RangePreset; label: string}[] = [
  {key: 'last7', label: 'Last 7 days'},
  {key: 'last30', label: 'Last 30 days'},
  {key: 'last90', label: 'Last 90 days'},
  {key: 'last12m', label: 'Last 12 months'},
  {key: 'all', label: 'All time'},
  {key: 'custom', label: 'Custom range'},
]

function getPresetRange(preset: RangePreset): {from?: string; to?: string} {
  if (preset === 'all') return {}
  const now = new Date()
  const y = now.getUTCFullYear()
  const m = now.getUTCMonth()
  const d = now.getUTCDate()
  const to = new Date(Date.UTC(y, m, d + 1))
  const toStr = to.toISOString().slice(0, 10)
  let from: Date
  switch (preset) {
    case 'last7':
      from = new Date(Date.UTC(y, m, d - 7))
      break
    case 'last30':
      from = new Date(Date.UTC(y, m, d - 30))
      break
    case 'last90':
      from = new Date(Date.UTC(y, m, d - 90))
      break
    case 'last12m':
      from = new Date(Date.UTC(y - 1, m, d))
      break
    default:
      return {}
  }
  return {from: from.toISOString().slice(0, 10), to: toStr}
}

function formatRangeLabel(preset: RangePreset, customRange?: DateRange): string {
  if (preset !== 'custom') return PRESETS.find((p) => p.key === preset)!.label
  if (!customRange?.from) return 'Select dates...'
  const fmt = (d: Date) => d.toLocaleDateString('en-US', {month: 'short', day: 'numeric', year: 'numeric'})
  if (!customRange.to) return fmt(customRange.from)
  return `${fmt(customRange.from)} – ${fmt(customRange.to)}`
}

export function DashboardPage() {
  const {data: authStatus} = useQuery({queryKey: ['auth-status'], queryFn: checkAuthStatus})
  const qc = useQueryClient()
  const [preset, setPreset] = useState<RangePreset>(() => {
    const saved = localStorage.getItem('dashboard-range-preset')
    return saved && PRESETS.some((p) => p.key === saved) ? (saved as RangePreset) : 'last12m'
  })
  const [customRange, setCustomRange] = useState<DateRange | undefined>(() => {
    try {
      const saved = localStorage.getItem('dashboard-range-custom')
      if (!saved) return undefined
      const parsed = JSON.parse(saved)
      return {
        from: parsed.from ? new Date(parsed.from) : undefined,
        to: parsed.to ? new Date(parsed.to) : undefined,
      }
    } catch {
      return undefined
    }
  })
  const [pickerOpen, setPickerOpen] = useState(false)

  useEffect(() => {
    localStorage.setItem('dashboard-range-preset', preset)
  }, [preset])

  useEffect(() => {
    if (customRange?.from) {
      localStorage.setItem(
        'dashboard-range-custom',
        JSON.stringify({from: customRange.from.toISOString(), to: customRange.to?.toISOString()}),
      )
    }
  }, [customRange])

  const chartParams = useMemo(() => {
    if (preset === 'custom' && customRange?.from) {
      const from = customRange.from.toISOString().slice(0, 10)
      const to = customRange.to
        ? new Date(
            Date.UTC(customRange.to.getUTCFullYear(), customRange.to.getUTCMonth(), customRange.to.getUTCDate() + 1),
          )
            .toISOString()
            .slice(0, 10)
        : undefined
      return {from, to}
    }
    return getPresetRange(preset)
  }, [preset, customRange])

  const {data: stats, isLoading} = useQuery({
    queryKey: queryKeys.stats,
    queryFn: fetchStats,
  })

  const {data: overTime} = useQuery({
    queryKey: [...queryKeys.statsOverTime, chartParams.from, chartParams.to],
    queryFn: () => fetchStatsOverTime(chartParams),
  })

  if (isLoading || !stats) return <PageSpinner />

  const {people, groups, messages, drafts} = stats
  const totalProcessed = messages.totalSent + messages.totalFailed + messages.totalSkipped
  const successRate = totalProcessed > 0 ? Math.round((messages.totalSent / totalProcessed) * 100) : 0
  const failedPct = totalProcessed > 0 ? Math.round((messages.totalFailed / totalProcessed) * 100) : 0
  const skippedPct = totalProcessed > 0 ? Math.round((messages.totalSkipped / totalProcessed) * 100) : 0

  const deliveryData = [
    {name: 'Sent', value: messages.totalSent, pct: successRate, color: DONUT_COLORS.sent},
    {name: 'Failed', value: messages.totalFailed, pct: failedPct, color: DONUT_COLORS.failed},
    {name: 'Skipped', value: messages.totalSkipped, pct: skippedPct, color: DONUT_COLORS.skipped},
  ]

  const peopleData = [
    {name: 'Active', value: people.active, color: PEOPLE_COLORS.active},
    {name: 'Inactive', value: people.inactive, color: PEOPLE_COLORS.inactive},
    {name: 'Do Not Contact', value: people.doNotContact, color: PEOPLE_COLORS.doNotContact},
  ]

  const peoplePcts = peopleData.map((d) => ({
    ...d,
    pct: people.total > 0 ? Math.round((d.value / people.total) * 100) : 0,
  }))

  const overTimeData = overTime?.data ?? []

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <h2 className="text-2xl font-bold">Dashboard</h2>
        <div className="hidden md:flex items-center gap-2">
          <Link to="/messages/compose">
            <Button size="sm">
              <MessageSquare className="h-4 w-4 mr-2" />
              Compose
              <kbd className="ml-2 pointer-events-none text-[10px] font-medium opacity-60 border rounded px-1 py-0.5">
                {isMac ? '⌘' : 'Ctrl+'}J
              </kbd>
            </Button>
          </Link>
          <Link to="/people?add=1">
            <Button size="sm" variant="outline">
              <Plus className="h-4 w-4 mr-2" />
              Add Person
              <kbd className="ml-2 pointer-events-none text-[10px] font-medium opacity-60 border rounded px-1 py-0.5">
                {isMac ? '⌘' : 'Ctrl+'}P
              </kbd>
            </Button>
          </Link>
        </div>
      </div>

      {/* Row 1 — Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <StatCard label="People" value={people.total} to="/people" />
        <StatCard label="Groups" value={groups.total} to="/groups" />
        <StatCard label="Messages Sent" value={messages.totalSent} to="/messages" />
        <StatCard label="Scheduled Messages" value={messages.scheduledMessages.length} to="/messages?tab=scheduled" />
        <StatCard label="Draft Messages" value={drafts.total} to="/messages?tab=drafts" />
      </div>

      {/* Row 2 — Donut charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Delivery Overview</CardTitle>
          </CardHeader>
          <CardContent>
            {totalProcessed === 0 ? (
              <p className="text-center text-muted-foreground py-8">No messages processed yet.</p>
            ) : (
              <div className="flex flex-col sm:flex-row items-center gap-6">
                <div className="shrink-0">
                  <ResponsiveContainer width={180} height={180}>
                    <PieChart>
                      <Pie
                        data={deliveryData}
                        cx="50%"
                        cy="50%"
                        innerRadius={55}
                        outerRadius={80}
                        paddingAngle={2}
                        dataKey="value"
                        strokeWidth={0}
                      >
                        {deliveryData.map((entry) => (
                          <Cell key={entry.name} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        content={({active, payload}) => {
                          if (!active || !payload?.length) return null
                          const d = payload[0].payload
                          return (
                            <div className="rounded-lg border bg-card px-3 py-2 shadow-md text-sm">
                              <span className="font-medium">{d.name}</span>: {d.value} ({d.pct}%)
                            </div>
                          )
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-3">
                  {deliveryData.map((d) => (
                    <div key={d.name} className="flex items-center gap-2.5">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{backgroundColor: d.color}} />
                      <span className="text-sm">
                        {d.name} &ndash; <span className="font-semibold">{d.pct}%</span>{' '}
                        <span className="text-muted-foreground">({d.value.toLocaleString()})</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>People Overview</CardTitle>
          </CardHeader>
          <CardContent>
            {people.total === 0 ? (
              <p className="text-center text-muted-foreground py-8">No people added yet.</p>
            ) : (
              <div className="flex flex-col sm:flex-row items-center gap-6">
                <div className="shrink-0">
                  <ResponsiveContainer width={180} height={180}>
                    <PieChart>
                      <Pie
                        data={peopleData}
                        cx="50%"
                        cy="50%"
                        innerRadius={55}
                        outerRadius={80}
                        paddingAngle={2}
                        dataKey="value"
                        strokeWidth={0}
                      >
                        {peopleData.map((entry) => (
                          <Cell key={entry.name} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        content={({active, payload}) => {
                          if (!active || !payload?.length) return null
                          const d = payload[0].payload
                          return (
                            <div className="rounded-lg border bg-card px-3 py-2 shadow-md text-sm">
                              <span className="font-medium">{d.name}</span>: {d.value}
                            </div>
                          )
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-3">
                  {peoplePcts.map((d) => (
                    <div key={d.name} className="flex items-center gap-2.5">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{backgroundColor: d.color}} />
                      <span className="text-sm">
                        {d.name} &ndash; <span className="font-semibold">{d.pct}%</span>{' '}
                        <span className="text-muted-foreground">({d.value.toLocaleString()})</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Row 3 — Messages Over Time (area chart with date picker) */}
      <Card>
        <CardHeader className="flex-col sm:flex-row items-start sm:items-center justify-between gap-2 space-y-0">
          <CardTitle>Messages Over Time</CardTitle>
          <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
            <PopoverTrigger asChild>
              <button className="flex items-center gap-1.5 rounded-3xl border border-transparent bg-input/50 px-3 py-2 text-sm whitespace-nowrap transition-[color,box-shadow,background-color] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 h-9 cursor-pointer">
                <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                {formatRangeLabel(preset, customRange)}
              </button>
            </PopoverTrigger>
            <PopoverContent
              className="w-auto gap-0 p-0 bg-popover/70 backdrop-blur-2xl backdrop-saturate-150"
              align="end"
            >
              <div className="flex">
                <div className={cn('p-1.5 space-y-0.5', preset === 'custom' && 'border-r')}>
                  {PRESETS.map((p) => (
                    <button
                      key={p.key}
                      className={cn(
                        'block w-full text-left text-sm px-3 py-2 rounded-2xl font-medium transition-colors cursor-pointer',
                        preset === p.key ? 'bg-foreground/10' : 'hover:bg-foreground/10',
                      )}
                      onClick={() => {
                        setPreset(p.key)
                        if (p.key !== 'custom') {
                          setPickerOpen(false)
                        }
                      }}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                {preset === 'custom' && (
                  <div className="p-2">
                    <Calendar
                      mode="range"
                      selected={customRange}
                      onSelect={(range) => {
                        setCustomRange(range)
                        if (range?.from && range?.to) {
                          setPickerOpen(false)
                        }
                      }}
                      numberOfMonths={window.innerWidth < 640 ? 1 : 2}
                      disabled={{after: new Date()}}
                    />
                  </div>
                )}
              </div>
            </PopoverContent>
          </Popover>
        </CardHeader>
        <CardContent>
          {overTimeData.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No message data for this period.</p>
          ) : (
            <ResponsiveContainer width="100%" height={250}>
              <AreaChart data={overTimeData}>
                <defs>
                  <linearGradient id="sentGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.2} />
                    <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis
                  dataKey="label"
                  tick={{fontSize: 11, fill: 'var(--muted-foreground)'}}
                  axisLine={{stroke: 'var(--border)'}}
                  tickLine={false}
                  padding={{left: 10, right: 10}}
                  interval="preserveStartEnd"
                />
                <YAxis
                  allowDecimals={false}
                  tick={{fontSize: 12, fill: 'var(--muted-foreground)'}}
                  axisLine={false}
                  tickLine={false}
                  width={35}
                />
                <Tooltip
                  content={({active, payload, label}) => {
                    if (!active || !payload?.length) return null
                    return (
                      <div className="rounded-lg border bg-card px-3 py-2 shadow-md">
                        <p className="text-sm font-medium mb-1">{label}</p>
                        {payload.map((entry) => (
                          <p key={entry.name} className="text-xs text-muted-foreground">
                            <span
                              className="inline-block w-2 h-2 rounded-full mr-1.5"
                              style={{backgroundColor: entry.color}}
                            />
                            {entry.name}: <span className="font-medium text-foreground">{entry.value}</span>
                          </p>
                        ))}
                      </div>
                    )
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="sent"
                  stroke="var(--primary)"
                  strokeWidth={2}
                  fill="url(#sentGradient)"
                  name="Sent"
                />
                <Area
                  type="monotone"
                  dataKey="failed"
                  stroke="var(--destructive)"
                  strokeWidth={2}
                  fill="transparent"
                  name="Failed"
                />
                <Area
                  type="monotone"
                  dataKey="skipped"
                  stroke="var(--muted-foreground)"
                  strokeWidth={2}
                  fill="transparent"
                  strokeDasharray="4 4"
                  name="Skipped"
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Mobile settings & logout links */}
      <div className="md:hidden flex flex-col gap-3 pt-4">
        <Link to="/devotions/stats">
          <Button variant="outline" className="w-full">
            <BookOpen className="h-4 w-4 mr-2" />
            Devotions
          </Button>
        </Link>
        <div className="grid grid-cols-2 gap-3">
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
                qc.invalidateQueries({queryKey: ['auth-status']})
              }}
            >
              <LogOut className="h-4 w-4 mr-2" />
              Logout
            </Button>
          )}
        </div>
      </div>
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
          <span className="text-3xl md:text-[28px] font-bold leading-none">{value.toLocaleString()}</span>
        </CardContent>
      </Card>
    </Link>
  )
}
