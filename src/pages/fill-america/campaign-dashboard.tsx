import {Button} from '@/components/ui/button'
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card'
import {DATE_RANGE_PRESETS, type DateRange, DateRangePicker} from '@/components/ui/date-range-picker'
import {Label} from '@/components/ui/label'
import {SearchableSelect} from '@/components/ui/searchable-select'
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select'
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from '@/components/ui/table'
import {linreg, trendDelta} from '@/lib/chart-math'
import {
  FA_METRIC_LABELS,
  type FaMetric,
  fetchEffortBoard,
  fetchFaSeries,
  fetchFaSummary,
  fetchHouseholdBoard,
  fetchHouseholds,
} from '@/lib/fill-america-api'
import {SEASONS, SEASON_LABELS, campaignShortLabel, seasonalPredecessors} from '@/lib/fill-america-core'
import {queryKeys} from '@/lib/query-keys'
import {useQuery} from '@tanstack/react-query'
import {TrendingDown, TrendingUp} from 'lucide-react'
import {useMemo, useState} from 'react'
import {useNavigate} from 'react-router-dom'
import {Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis} from 'recharts'

/** The picker's own "All time" preset, so the default matches a named option. */
const allTime = (): DateRange => DATE_RANGE_PRESETS.find((p) => p.label === 'All time')!.range()

/**
 * Season-aware charts, tiles and leaderboards over four years of campaigns.
 *
 * The x-axis is the Campaign rather than the date: eighteen three-week pushes
 * separated by two-to-three-month gaps plotted on a date axis give three
 * clustered dots and three months of white space, eighteen times over.
 */
export function FillAmericaDashboard() {
  const [metric, setMetric] = useState<FaMetric>('tracts')
  const [householdId, setHouseholdId] = useState('all')
  const [season, setSeason] = useState('all')
  const [range, setRange] = useState<DateRange>(allTime)
  const [yoy, setYoy] = useState(true)
  const {from, to} = range

  const {data: households} = useQuery({
    queryKey: queryKeys.fillAmericaHouseholds(true),
    queryFn: () => fetchHouseholds(true),
  })

  const {data: series} = useQuery({
    queryKey: queryKeys.fillAmericaSeries(metric, householdId, season, from, to),
    queryFn: () => fetchFaSeries({metric, householdId, season, from, to}),
  })
  const {data: summary} = useQuery({
    queryKey: queryKeys.fillAmericaSummary(householdId),
    queryFn: () => fetchFaSummary(householdId),
  })

  // Neither Door Hangers nor Unique Participants belongs to a family, so
  // picking one household drops both rather than showing the whole church's
  // number under a single name. Reset here rather than in an effect so the
  // chart never renders one frame of the metric that just became meaningless.
  const perHousehold = householdId !== 'all'
  const changeHousehold = (v: string) => {
    setHouseholdId(v)
    if (v !== 'all') setMetric('tracts')
  }

  const {chartData, delta} = useMemo(() => {
    const pts = series?.points ?? []
    // Predecessors are found among the points actually returned, so narrowing
    // the range can leave the earliest campaigns without one — which is exactly
    // what connectNulls is for.
    const preds = seasonalPredecessors(pts)
    const values = pts.map((p) => p.value ?? 0)
    const {slope, intercept} = linreg(values)
    const data = pts.map((p, i) => {
      const prev = preds[i] >= 0 ? pts[preds[i]] : null
      return {
        label: campaignShortLabel(p.startDate),
        title: p.title,
        season: SEASON_LABELS[p.season],
        value: p.value,
        trend: Math.round((intercept + slope * i) * 10) / 10,
        prev: yoy ? (prev?.value ?? null) : null,
        prevTitle: prev?.title ?? null,
      }
    })
    return {chartData: data, delta: trendDelta(values)}
  }, [series, yoy])

  const m = summary?.metrics[metric]
  const label = FA_METRIC_LABELS[metric]
  const householdName =
    householdId === 'all' ? 'all households' : (households?.find((h) => String(h.id) === householdId)?.name ?? '')
  const seasonName = season === 'all' ? 'all seasons' : SEASON_LABELS[season as (typeof SEASONS)[number]]

  return (
    <div className="space-y-4">
      <Card size="sm">
        <CardContent className="flex flex-wrap items-end gap-3 py-4">
          <div className="space-y-1.5">
            <Label>Metric</Label>
            <Select value={metric} onValueChange={(v) => setMetric(v as FaMetric)}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="tracts">Tracts</SelectItem>
                {!perHousehold && <SelectItem value="doorHangers">Door Hangers</SelectItem>}
                {!perHousehold && <SelectItem value="uniqueParticipants">Unique Participants</SelectItem>}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Household</Label>
            <SearchableSelect
              value={householdId}
              onValueChange={changeHousehold}
              options={[
                {value: 'all', label: 'All combined'},
                ...(households ?? []).map((h) => ({
                  value: String(h.id),
                  label: h.active ? h.name : `${h.name} (retired)`,
                })),
              ]}
              className="w-52"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Season</Label>
            <Select value={season} onValueChange={setSeason}>
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All seasons</SelectItem>
                {SEASONS.map((s) => (
                  <SelectItem key={s} value={s}>
                    {SEASON_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Campaign start</Label>
            <DateRangePicker value={range} onChange={setRange} className="w-60" />
          </div>
          <Button variant={yoy ? 'default' : 'outline'} onClick={() => setYoy((v) => !v)}>
            vs Last Year
          </Button>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile label="Latest Campaign" value={m?.latest ?? null} sub={summary?.latest?.title} />
        <Tile
          label="This Year"
          value={m?.year.total ?? null}
          sub={`${m?.year.campaigns ?? 0} campaign${m?.year.campaigns === 1 ? '' : 's'} in ${summary?.year ?? ''}`}
        />
        <Tile
          label="All-Time"
          value={m?.allTime.total ?? null}
          sub={`${m?.allTime.campaigns ?? 0} campaign${m?.allTime.campaigns === 1 ? '' : 's'}`}
        />
        <Tile label="Average per Campaign" value={m?.allTime.avg ?? null} sub={label.toLowerCase()} />
      </div>

      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 space-y-0">
          <CardTitle>
            {label} by campaign · {householdName} · {seasonName}
          </CardTitle>
          {delta.count >= 2 && (
            <div
              className={`flex items-center gap-1 text-sm font-semibold ${delta.up ? 'text-green-600' : 'text-red-600'}`}
            >
              {delta.up ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
              {delta.pct >= 0 ? '+' : ''}
              {delta.pct}% over {delta.count} campaigns
            </div>
          )}
        </CardHeader>
        <CardContent>
          {chartData.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center">No campaigns in this range.</p>
          ) : (
            <ResponsiveContainer width="100%" height={320}>
              <ComposedChart data={chartData}>
                <defs>
                  {/* Fades to fully transparent so the card surface, in either
                      theme, shows through the tail of the area. */}
                  <linearGradient id="fa-dash-area" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.28} />
                    <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis
                  dataKey="label"
                  tick={{fontSize: 11, fill: 'var(--muted-foreground)'}}
                  tickLine={false}
                  interval="preserveStartEnd"
                  minTickGap={20}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{fontSize: 12, fill: 'var(--muted-foreground)'}}
                  width={45}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  content={({active, payload}) => {
                    if (!active || !payload?.length) return null
                    const row = payload[0].payload as (typeof chartData)[number]
                    return (
                      <div className="bg-card rounded-lg border px-3 py-2 shadow-md">
                        <p className="text-sm font-medium">{row.title}</p>
                        <p className="text-muted-foreground mb-1 text-xs">{row.season}</p>
                        {payload
                          .filter((e) => e.value != null)
                          .map((e) => (
                            <p key={e.name} className="text-muted-foreground text-xs">
                              <span
                                className="mr-1.5 inline-block h-2 w-2 rounded-full"
                                style={{backgroundColor: e.color}}
                              />
                              {e.name === 'Same season, last year' ? (row.prevTitle ?? e.name) : e.name}:{' '}
                              <span className="text-foreground font-medium">{Number(e.value).toLocaleString()}</span>
                            </p>
                          ))}
                      </div>
                    )
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  name={label}
                  stroke="var(--primary)"
                  strokeWidth={2}
                  fill="url(#fa-dash-area)"
                  dot={{r: 2}}
                  activeDot={{r: 4}}
                />
                <Line type="linear" dataKey="trend" name="Trend" stroke="#ef4444" strokeWidth={1.5} dot={false} />
                {yoy && (
                  <Line
                    type="monotone"
                    dataKey="prev"
                    name="Same season, last year"
                    stroke="#3b82f6"
                    strokeWidth={1.5}
                    dot={false}
                    connectNulls
                  />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          )}
          <p className="text-muted-foreground mt-3 text-xs">
            One point per campaign — Fill America has no continuous weekly series to plot. The comparison line is the
            same Season a year earlier, not the previous campaign: Fall runs well ahead of Spring on tracts and ahead of
            Winter on people, so a December campaign held against the August one before it shows a decline that is
            purely calendar.
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <MostFaithfulCard season={season} from={from} to={to} />
        <TopEffortsCard season={season} from={from} to={to} />
      </div>
    </div>
  )
}

function Tile({label, value, sub}: {label: string; value: number | null; sub?: string}) {
  return (
    <Card size="sm">
      <CardContent className="py-4">
        <p className="text-muted-foreground text-xs tracking-wide uppercase">{label}</p>
        <p className="text-3xl font-bold tabular-nums">{value === null ? '—' : value.toLocaleString()}</p>
        {sub && <p className="text-muted-foreground truncate text-xs">{sub}</p>}
      </CardContent>
    </Card>
  )
}

interface BoardFilter {
  season: string
  from: string
  to: string
}

/** All-time tracts per household — who has been out most across four years. */
function MostFaithfulCard({season, from, to}: BoardFilter) {
  const {data} = useQuery({
    queryKey: queryKeys.fillAmericaLeaderboard('household', season, from, to),
    queryFn: () => fetchHouseholdBoard({season, from, to, limit: 10}),
  })
  const rows = data?.rows ?? []

  return (
    <Card>
      <CardHeader>
        <CardTitle>Most Faithful</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">#</TableHead>
                <TableHead>Household</TableHead>
                <TableHead className="text-right">Tracts</TableHead>
                <TableHead className="text-right">Campaigns</TableHead>
                <TableHead className="text-right">Avg</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r, i) => (
                <TableRow key={r.householdId} className={r.householdActive ? '' : 'opacity-60'}>
                  <TableCell className="text-muted-foreground tabular-nums">{i + 1}</TableCell>
                  <TableCell className="font-medium">{r.householdName}</TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">{r.tracts.toLocaleString()}</TableCell>
                  <TableCell className="text-muted-foreground text-right tabular-nums">{r.campaigns}</TableCell>
                  <TableCell className="text-muted-foreground text-right tabular-nums">
                    {r.avg.toLocaleString()}
                  </TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-muted-foreground py-8 text-center">
                    Nothing reported in this range.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        <p className="text-muted-foreground mt-3 text-xs">
          Campaigns counts the ones where the household actually reported tracts, so a roster row copied forward and
          never filled in does not count as taking part.
        </p>
      </CardContent>
    </Card>
  )
}

/** The biggest single campaigns any one household has ever put together. */
function TopEffortsCard({season, from, to}: BoardFilter) {
  const navigate = useNavigate()
  const {data} = useQuery({
    queryKey: queryKeys.fillAmericaLeaderboard('effort', season, from, to),
    queryFn: () => fetchEffortBoard({season, from, to, limit: 10}),
  })
  const rows = data?.rows ?? []

  return (
    <Card>
      <CardHeader>
        <CardTitle>Top Campaign Efforts</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">#</TableHead>
                <TableHead>Household</TableHead>
                <TableHead className="text-right">Tracts</TableHead>
                <TableHead>Campaign</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r, i) => (
                <TableRow
                  key={`${r.householdId}-${r.campaignId}`}
                  className="cursor-pointer"
                  onClick={() => navigate(`/fill-america/${r.campaignId}`)}
                >
                  <TableCell className="text-muted-foreground tabular-nums">{i + 1}</TableCell>
                  <TableCell className="font-medium">{r.householdName}</TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">{r.tracts.toLocaleString()}</TableCell>
                  <TableCell className="text-muted-foreground whitespace-nowrap">{r.campaignTitle}</TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-muted-foreground py-8 text-center">
                    Nothing reported in this range.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        <p className="text-muted-foreground mt-3 text-xs">
          One household&rsquo;s whole campaign, not a single week. This board reads every campaign, including the oldest
          one the hand-kept spreadsheet never covered, so it will not match that sheet&rsquo;s Top 10 exactly.
        </p>
      </CardContent>
    </Card>
  )
}
