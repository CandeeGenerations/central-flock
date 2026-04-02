import {Badge} from '@/components/ui/badge'
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card'
import {PageSpinner} from '@/components/ui/spinner'
import {fetchDevotionStats, type DevotionStats} from '@/lib/devotion-api'
import {useQuery} from '@tanstack/react-query'
import {AlertTriangle, ArrowRight, BookOpen, CheckCircle2, Hash, PieChartIcon} from 'lucide-react'
import {Link} from 'react-router-dom'
import {Cell, Pie, PieChart, ResponsiveContainer, Tooltip} from 'recharts'

const TYPE_COLORS: Record<string, string> = {
  original: '#ef4444',
  favorite: '#a855f7',
  guest: '#3b82f6',
  revisit: '#22c55e',
}

const SPEAKER_COLORS: Record<string, string> = {
  Tyler: '#10b981',
  Gabe: '#06b6d4',
  Ed: '#8b5cf6',
}

const TYPE_LABELS: Record<string, string> = {
  original: 'Original',
  favorite: 'Favorite',
  guest: 'Guest',
  revisit: 'Revisit',
}

const PIPELINE_STEPS = [
  {key: 'produced', label: 'Produced'},
  {key: 'rendered', label: 'Rendered'},
  {key: 'youtube', label: 'YouTube'},
  {key: 'facebookInstagram', label: 'Facebook/Instagram'},
  {key: 'podcast', label: 'Podcast'},
] as const

interface AuditSummary {
  issueCount: number
  totalDevotions: number
}

function fetchAuditSummary() {
  return fetch('/api/devotions/audit', {credentials: 'include'}).then((r) => r.json()) as Promise<AuditSummary>
}

function fetchDuplicateScriptureCount() {
  return fetch('/api/devotions/scriptures/duplicates', {credentials: 'include'})
    .then((r) => r.json())
    .then((data: {reference: string}[]) => data.length)
}

export function DevotionStatsPage() {
  const {data: stats, isLoading: statsLoading} = useQuery({
    queryKey: ['devotion-stats'],
    queryFn: fetchDevotionStats,
  })

  const {data: audit} = useQuery({
    queryKey: ['devotion-audit-summary'],
    queryFn: fetchAuditSummary,
  })

  const {data: dupScriptureCount} = useQuery({
    queryKey: ['scripture-duplicate-count'],
    queryFn: fetchDuplicateScriptureCount,
  })

  if (statsLoading || !stats) return <PageSpinner />

  const allStepsComplete = (d: DevotionStats['recentIncomplete'][number]) =>
    d.produced && d.rendered && d.youtube && d.facebookInstagram && d.podcast

  const completeCount = stats.total > 0 ? stats.byType.reduce((acc, t) => acc + t.count, 0) : 0
  const trueCompletionRate =
    completeCount > 0
      ? Math.round(
          ((completeCount - stats.recentIncomplete.filter((d) => !allStepsComplete(d)).length) / completeCount) * 100,
        )
      : 0

  // Build pie chart data: Tyler gets own slice, Gabe+Ed combined as "Other Guests"
  const pieData: {name: string; value: number; color: string; pct: number}[] = []
  for (const t of stats.byType) {
    if (t.type === 'guest' && stats.bySpeaker.length > 0) {
      const tyler = stats.bySpeaker.find((s) => s.speaker === 'Tyler')
      const otherGuests = stats.bySpeaker.filter((s) => s.speaker !== 'Tyler')
      const otherCount = otherGuests.reduce((sum, s) => sum + s.count, 0)
      if (tyler) {
        pieData.push({
          name: 'Tyler',
          value: tyler.count,
          color: SPEAKER_COLORS.Tyler,
          pct: stats.total > 0 ? Math.round((tyler.count / stats.total) * 100) : 0,
        })
      }
      if (otherCount > 0) {
        pieData.push({
          name: 'Other Guests',
          value: otherCount,
          color: '#6b7280',
          pct: stats.total > 0 ? Math.round((otherCount / stats.total) * 100) : 0,
        })
      }
    } else {
      pieData.push({
        name: TYPE_LABELS[t.type] || t.type,
        value: t.count,
        color: TYPE_COLORS[t.type] || '#6b7280',
        pct: stats.total > 0 ? Math.round((t.count / stats.total) * 100) : 0,
      })
    }
  }
  pieData.sort((a, b) => b.value - a.value)

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Devotion Stats</h2>
      </div>

      {/* Row 1 - Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <StatCard icon={<Hash className="h-4 w-4" />} label="Total Devotions" value={stats.total.toLocaleString()} />
        <StatCard icon={<Hash className="h-4 w-4" />} label="Latest Number" value={`#${stats.latestNumber}`} />
        <StatCard
          icon={<CheckCircle2 className="h-4 w-4" />}
          label="Completion Rate"
          value={`${trueCompletionRate}%`}
          sublabel="All 5 steps done"
        />
        <Link to="/devotions/audit">
          <StatCard
            icon={<AlertTriangle className="h-4 w-4" />}
            label="Audit Issues"
            value={audit?.issueCount != null ? String(audit.issueCount) : '...'}
            sublabel="View audit report"
            alert={!!audit?.issueCount}
          />
        </Link>
        <Link to="/devotions/scriptures">
          <StatCard
            icon={<BookOpen className="h-4 w-4" />}
            label="Duplicate Verses"
            value={dupScriptureCount != null ? String(dupScriptureCount) : '...'}
            sublabel="View scripture lookup"
          />
        </Link>
      </div>

      {/* Row 2 - Type Breakdown + Pipeline side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PieChartIcon className="h-4 w-4" />
              Type Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent>
            {pieData.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No devotion data yet.</p>
            ) : (
              <div className="flex flex-col sm:flex-row items-center gap-6">
                <div className="shrink-0">
                  <ResponsiveContainer width={200} height={200}>
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={55}
                        outerRadius={85}
                        paddingAngle={2}
                        dataKey="value"
                        strokeWidth={0}
                      >
                        {pieData.map((entry) => (
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
                  {pieData.map((d) => (
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

        {/* Pipeline Completion Rates */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" />
              Pipeline Completion Rates
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {PIPELINE_STEPS.map((step) => {
                const rate = stats.completionRates[step.key]
                return (
                  <div key={step.key} className="space-y-1.5">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{step.label}</span>
                      <span className="text-muted-foreground">{rate}%</span>
                    </div>
                    <div className="h-2.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${rate}%`,
                          backgroundColor: rate >= 100 ? '#22c55e' : rate >= 50 ? '#f59e0b' : '#ef4444',
                        }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Row 3 - Recent Incomplete */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            Recent Incomplete Devotions
          </CardTitle>
        </CardHeader>
        <CardContent>
          {stats.recentIncomplete.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">All devotions are complete!</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-3 font-medium text-muted-foreground">#</th>
                    <th className="text-left py-2 px-3 font-medium text-muted-foreground">Date</th>
                    <th className="text-left py-2 px-3 font-medium text-muted-foreground">Type</th>
                    <th className="text-left py-2 px-3 font-medium text-muted-foreground">Missing Steps</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.recentIncomplete.slice(0, 10).map((d) => {
                    const missing = PIPELINE_STEPS.filter((step) => !d[step.key]).map((step) => step.label)
                    return (
                      <tr key={d.id} className="border-b last:border-0">
                        <td className="py-2 px-3">
                          <Link to={`/devotions/${d.id}`} className="text-primary hover:underline font-medium">
                            #{String(d.number).padStart(3, '0')}
                          </Link>
                        </td>
                        <td className="py-2 px-3 text-muted-foreground">{d.date}</td>
                        <td className="py-2 px-3">
                          <Badge
                            variant="secondary"
                            style={{
                              backgroundColor: `${TYPE_COLORS[d.devotionType] || '#6b7280'}20`,
                              color: TYPE_COLORS[d.devotionType] || '#6b7280',
                            }}
                          >
                            {TYPE_LABELS[d.devotionType] || d.devotionType}
                          </Badge>
                        </td>
                        <td className="py-2 px-3">
                          <div className="flex flex-wrap gap-1">
                            {missing.map((m) => (
                              <Badge key={m} variant="outline" className="text-xs text-muted-foreground">
                                {m}
                              </Badge>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function StatCard({
  icon,
  label,
  value,
  sublabel,
  alert,
}: {
  icon: React.ReactNode
  label: string
  value: string
  sublabel?: string
  alert?: boolean
}) {
  return (
    <Card className="bg-card shadow-none hover:bg-muted/50 transition-colors">
      <div className="px-4 pt-3 pb-3 md:px-5 md:pt-4 md:pb-4 space-y-1">
        <p className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
          {icon}
          {label}
        </p>
        <span className={`text-3xl md:text-[28px] font-bold leading-none block ${alert ? 'text-amber-500' : ''}`}>
          {value}
        </span>
        {sublabel && (
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            {sublabel}
            <ArrowRight className="h-3 w-3" />
          </p>
        )}
      </div>
    </Card>
  )
}
