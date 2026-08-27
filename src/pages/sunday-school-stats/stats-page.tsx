import {Button} from '@/components/ui/button'
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card'
import {type DateRange, DateRangePicker} from '@/components/ui/date-range-picker'
import {Input} from '@/components/ui/input'
import {Label} from '@/components/ui/label'
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select'
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from '@/components/ui/table'
import {linreg, trendDelta} from '@/lib/chart-math'
import {queryKeys} from '@/lib/query-keys'
import {QUARTERS, type Quarter, quarterOrdinal} from '@/lib/sunday-school-roll-core'
import {
  type DepartmentCount,
  SS_METRIC_LABELS,
  type SsMetric,
  fetchDepartments,
  fetchGrid,
  fetchSsSeries,
  fetchSsSummary,
  fetchYears,
  saveCount,
} from '@/lib/sunday-school-stats-api'
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'
import {GraduationCap, TrendingDown, TrendingUp} from 'lucide-react'
import {useMemo, useState} from 'react'
import {Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis} from 'recharts'
import {toast} from 'sonner'

const pad2 = (n: number) => String(n).padStart(2, '0')

function todayIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}
function startOfYearIso(): string {
  return `${new Date().getFullYear()}-01-01`
}
function currentQuarter(): Quarter {
  return (Math.floor(new Date().getMonth() / 3) + 1) as Quarter
}
function shiftYear(iso: string, years: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  return `${y + years}-${pad2(m)}-${pad2(d)}`
}
function formatWeekLabel(iso: string): string {
  const d = new Date(iso + 'T12:00:00')
  return d.toLocaleDateString('en-US', {month: 'short', day: 'numeric'})
}

export function SundaySchoolStatsPage() {
  const [metric, setMetric] = useState<SsMetric>('total')
  const [departmentId, setDepartmentId] = useState<string>('all')
  const [range, setRange] = useState<DateRange>(() => ({from: startOfYearIso(), to: todayIso()}))
  const {from, to} = range
  const [yoy, setYoy] = useState(false)

  const {data: departments} = useQuery({
    queryKey: queryKeys.sundaySchoolDepartments(true),
    queryFn: () => fetchDepartments(true),
  })

  const {data: series} = useQuery({
    queryKey: queryKeys.sundaySchoolSeries(metric, departmentId, from, to),
    queryFn: () => fetchSsSeries({metric, departmentId, from, to}),
  })
  const {data: prevSeries} = useQuery({
    queryKey: queryKeys.sundaySchoolSeries(metric, departmentId, shiftYear(from, -1), shiftYear(to, -1)),
    queryFn: () => fetchSsSeries({metric, departmentId, from: shiftYear(from, -1), to: shiftYear(to, -1)}),
    enabled: yoy,
  })
  const {data: summary} = useQuery({
    queryKey: queryKeys.sundaySchoolSummary(departmentId),
    queryFn: () => fetchSsSummary(departmentId),
  })

  // Points are already one per Sunday, so unlike Main Services nothing buckets
  // them into weeks first.
  const {chartData, delta} = useMemo(() => {
    const pts = series?.points ?? []
    const prev = prevSeries?.points ?? []
    const {slope, intercept} = linreg(pts.map((p) => p.value))
    const data = pts.map((p, i) => ({
      date: formatWeekLabel(p.date),
      value: p.value,
      trend: Math.round((intercept + slope * i) * 10) / 10,
      prev: yoy ? (prev[i]?.value ?? null) : null,
    }))
    return {chartData: data, delta: trendDelta(pts.map((p) => p.value))}
  }, [series, prevSeries, yoy])

  const metricSummary = summary?.metrics[metric]
  const deptName =
    departmentId === 'all' ? 'all departments' : (departments?.find((d) => String(d.id) === departmentId)?.name ?? '')

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <GraduationCap className="h-6 w-6" />
          <h2 className="text-2xl font-bold">Sunday School</h2>
        </div>
      </div>

      {/* Filters */}
      <Card size="sm">
        <CardContent className="flex flex-wrap items-end gap-3 py-4">
          <div className="space-y-1.5">
            <Label>Metric</Label>
            <Select value={metric} onValueChange={(v) => setMetric(v as SsMetric)}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="girls">Girls</SelectItem>
                <SelectItem value="boys">Boys</SelectItem>
                <SelectItem value="total">Total</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Department</Label>
            <Select value={departmentId} onValueChange={setDepartmentId}>
              <SelectTrigger className="w-52">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All combined</SelectItem>
                {(departments ?? []).map((d) => (
                  <SelectItem key={d.id} value={String(d.id)}>
                    {d.name}
                    {d.active ? '' : ' (retired)'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Date Range</Label>
            <DateRangePicker value={range} onChange={setRange} className="w-60" />
          </div>
          <Button variant={yoy ? 'default' : 'outline'} onClick={() => setYoy((v) => !v)}>
            vs Last Year
          </Button>
        </CardContent>
      </Card>

      {/* Tiles */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile
          label="This Quarter"
          value={metricSummary?.quarter.total}
          sub={`avg ${(metricSummary?.quarter.avg ?? 0).toLocaleString()}`}
        />
        <Tile label="This Quarter · weeks" value={metricSummary?.quarter.count} />
        <Tile
          label="This Year"
          value={metricSummary?.year.total}
          sub={`avg ${(metricSummary?.year.avg ?? 0).toLocaleString()}`}
        />
        <Tile label="This Year · weeks" value={metricSummary?.year.count} />
      </div>

      {/* Chart */}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>
            {SS_METRIC_LABELS[metric]} by week · {deptName}
          </CardTitle>
          {delta.count >= 2 && (
            <div
              className={`flex items-center gap-1 text-sm font-semibold ${delta.up ? 'text-green-600' : 'text-red-600'}`}
            >
              {delta.up ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
              {delta.up ? '▲' : '▼'} {delta.pct >= 0 ? '+' : ''}
              {delta.pct}% over range
            </div>
          )}
        </CardHeader>
        <CardContent>
          {chartData.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center">No data for this range.</p>
          ) : (
            <ResponsiveContainer width="100%" height={320}>
              <ComposedChart data={chartData}>
                <defs>
                  {/* Fades the fill to fully transparent so the card surface, in
                      either theme, shows through the tail of the area. */}
                  <linearGradient id="ss-stats-area" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.28} />
                    <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis
                  dataKey="date"
                  tick={{fontSize: 11, fill: 'var(--muted-foreground)'}}
                  tickLine={false}
                  interval="preserveStartEnd"
                  minTickGap={40}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{fontSize: 12, fill: 'var(--muted-foreground)'}}
                  width={35}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  content={({active, payload, label}) => {
                    if (!active || !payload?.length) return null
                    return (
                      <div className="bg-card rounded-lg border px-3 py-2 shadow-md">
                        <p className="mb-1 text-sm font-medium">Week of {label}</p>
                        {payload
                          .filter((e) => e.value != null)
                          .map((e) => (
                            <p key={e.name} className="text-muted-foreground text-xs">
                              <span
                                className="mr-1.5 inline-block h-2 w-2 rounded-full"
                                style={{backgroundColor: e.color}}
                              />
                              {e.name}: <span className="text-foreground font-medium">{e.value}</span>
                            </p>
                          ))}
                      </div>
                    )
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  name={SS_METRIC_LABELS[metric]}
                  stroke="var(--primary)"
                  strokeWidth={2}
                  fill="url(#ss-stats-area)"
                  dot={false}
                  activeDot={{r: 4}}
                />
                <Line type="linear" dataKey="trend" name="Trend" stroke="#ef4444" strokeWidth={1.5} dot={false} />
                {yoy && (
                  <Line
                    type="monotone"
                    dataKey="prev"
                    name="Last year"
                    stroke="#3b82f6"
                    strokeWidth={1.5}
                    dot={false}
                    connectNulls
                  />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <QuarterGrid />
    </div>
  )
}

function Tile({label, value, sub}: {label: string; value: number | undefined; sub?: string}) {
  return (
    <Card size="sm">
      <CardContent className="py-4">
        <p className="text-muted-foreground text-xs tracking-wide uppercase">{label}</p>
        <p className="text-3xl font-bold tabular-nums">{value?.toLocaleString() ?? '—'}</p>
        {sub && <p className="text-muted-foreground text-xs">{sub}</p>}
      </CardContent>
    </Card>
  )
}

const cellKey = (weekOf: string, departmentId: number) => `${weekOf}|${departmentId}`

/** null + null renders blank; either present renders their sum. Blank is not zero. */
function cellTotal(c: DepartmentCount | undefined): number | null {
  if (!c) return null
  if (c.girls === null && c.boys === null) return null
  return (c.girls ?? 0) + (c.boys ?? 0)
}

function QuarterGrid() {
  const qc = useQueryClient()
  const [year, setYear] = useState(() => new Date().getFullYear())
  const [quarter, setQuarter] = useState<Quarter>(currentQuarter)

  const {data: grid} = useQuery({
    queryKey: queryKeys.sundaySchoolGrid(year, quarter),
    queryFn: () => fetchGrid(year, quarter),
  })

  const save = useMutation({
    mutationFn: saveCount,
    onSuccess: () => {
      qc.invalidateQueries({queryKey: ['sundaySchoolGrid']})
      qc.invalidateQueries({queryKey: ['sundaySchoolSeries']})
      qc.invalidateQueries({queryKey: ['sundaySchoolSummary']})
      // A count typed into a year that had none makes it a data year.
      qc.invalidateQueries({queryKey: ['sundaySchoolYears']})
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Save failed'),
  })

  const byCell = useMemo(() => {
    const m = new Map<string, DepartmentCount>()
    for (const c of grid?.counts ?? []) m.set(cellKey(c.weekOf, c.departmentId), c)
    return m
  }, [grid])

  const departments = useMemo(() => grid?.departments ?? [], [grid])
  const weeks = useMemo(() => grid?.weeks ?? [], [grid])
  // Years come from the data (plus this year and next), not a rolling window off
  // today — a fixed window offers empty years below the first record and drops
  // real ones off the bottom as time passes.
  const {data: yearOptions} = useQuery({queryKey: queryKeys.sundaySchoolYears, queryFn: fetchYears})
  const years = useMemo(() => {
    const list = yearOptions ?? []
    // Keep the selected year listed even if it has no data yet, so the Select
    // never renders a value it has no option for.
    return list.includes(year) ? list : [...list, year].sort((a, b) => b - a)
  }, [yearOptions, year])

  // Diff compares against the previous Sunday THAT HAS DATA, not the previous
  // row — a blank week must not read as a crash to zero and back. Built with an
  // explicit loop so the running previous values stay local to the memo.
  const rows = useMemo(() => {
    const prevByDept = new Map<number, number>()
    const out: {
      weekOf: string
      cells: {
        department: (typeof departments)[number]
        count: DepartmentCount | undefined
        total: number | null
        diff: number | null
      }[]
      grand: number | null
      grandDiff: number | null
    }[] = []
    let prevGrand: number | null = null
    for (const weekOf of weeks) {
      const cells = departments.map((d) => {
        const c = byCell.get(cellKey(weekOf, d.id))
        const total = cellTotal(c)
        const prev = prevByDept.get(d.id)
        const diff = total !== null && prev !== undefined ? total - prev : null
        if (total !== null) prevByDept.set(d.id, total)
        return {department: d, count: c, total, diff}
      })
      const present = cells.filter((c) => c.total !== null)
      const grand = present.length ? present.reduce((a, c) => a + (c.total ?? 0), 0) : null
      const grandDiff = grand !== null && prevGrand !== null ? grand - prevGrand : null
      if (grand !== null) prevGrand = grand
      out.push({weekOf, cells, grand, grandDiff})
    }
    return out
  }, [weeks, departments, byCell])

  const averages = useMemo(() => {
    const perDept = departments.map((d, i) => {
      const vals = rows.map((r) => r.cells[i]?.total).filter((v): v is number => v !== null && v !== undefined)
      return {id: d.id, avg: vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null}
    })
    const grands = rows.map((r) => r.grand).filter((v): v is number => v !== null)
    return {perDept, grand: grands.length ? Math.round(grands.reduce((a, b) => a + b, 0) / grands.length) : null}
  }, [rows, departments])

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 space-y-0">
        <CardTitle>Weekly counts</CardTitle>
        <div className="flex items-center gap-2">
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {years.map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={String(quarter)} onValueChange={(v) => setQuarter(Number(v) as Quarter)}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {QUARTERS.map((q) => (
                <SelectItem key={q} value={String(q)}>
                  {quarterOrdinal(q)} Quarter
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead rowSpan={2} className="align-bottom">
                  Week of
                </TableHead>
                {departments.map((d) => (
                  <TableHead key={d.id} colSpan={4} className="border-l text-center">
                    {d.name}
                    {d.active ? '' : ' (retired)'}
                  </TableHead>
                ))}
                <TableHead rowSpan={2} className="border-l text-center align-bottom">
                  Total
                </TableHead>
                <TableHead rowSpan={2} className="text-center align-bottom">
                  Diff
                </TableHead>
              </TableRow>
              <TableRow>
                {departments.map((d) => [
                  <TableHead key={`${d.id}-g`} className="border-l text-center text-xs">
                    Girls
                  </TableHead>,
                  <TableHead key={`${d.id}-b`} className="text-center text-xs">
                    Boys
                  </TableHead>,
                  <TableHead key={`${d.id}-t`} className="text-center text-xs">
                    Total
                  </TableHead>,
                  <TableHead key={`${d.id}-d`} className="text-center text-xs">
                    Diff
                  </TableHead>,
                ])}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.weekOf}>
                  <TableCell className="font-medium whitespace-nowrap">{formatWeekLabel(row.weekOf)}</TableCell>
                  {row.cells.map((cell) => (
                    <CellGroup
                      key={cell.department.id}
                      weekOf={row.weekOf}
                      departmentId={cell.department.id}
                      count={cell.count}
                      total={cell.total}
                      diff={cell.diff}
                      onSave={(girls, boys) =>
                        save.mutate({weekOf: row.weekOf, departmentId: cell.department.id, girls, boys})
                      }
                    />
                  ))}
                  <TableCell className="border-l text-center font-semibold tabular-nums">
                    {row.grand ?? <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="text-center tabular-nums">
                    <DiffText value={row.grandDiff} />
                  </TableCell>
                </TableRow>
              ))}
              {weeks.length === 0 && (
                <TableRow>
                  <TableCell colSpan={2 + departments.length * 4} className="text-muted-foreground py-8 text-center">
                    No Sundays in this quarter.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
            {weeks.length > 0 && (
              <TableBody>
                <TableRow className="bg-muted/40">
                  <TableCell className="font-semibold">Average</TableCell>
                  {departments.map((d, i) => (
                    <TableCell key={d.id} colSpan={4} className="border-l text-center font-semibold tabular-nums">
                      {averages.perDept[i]?.avg ?? <span className="text-muted-foreground">—</span>}
                    </TableCell>
                  ))}
                  <TableCell className="border-l text-center font-semibold tabular-nums">
                    {averages.grand ?? <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell />
                </TableRow>
              </TableBody>
            )}
          </Table>
        </div>
        <p className="text-muted-foreground mt-3 text-xs">
          Blank is not zero — leave a cell empty when nobody recorded it, and type 0 when the class met and no one came.
          Totals, Diffs and Averages are derived. Diff compares against the previous Sunday that has data.
        </p>
      </CardContent>
    </Card>
  )
}

function DiffText({value}: {value: number | null}) {
  if (value === null) return <span className="text-muted-foreground">—</span>
  if (value === 0) return <span className="text-muted-foreground">0</span>
  return (
    <span className={value > 0 ? 'text-green-600' : 'text-red-600'}>
      {value > 0 ? '+' : ''}
      {value}
    </span>
  )
}

function CellGroup(props: {
  weekOf: string
  departmentId: number
  count: DepartmentCount | undefined
  total: number | null
  diff: number | null
  onSave: (girls: number | null, boys: number | null) => void
}) {
  const {count, total, diff, onSave} = props
  return (
    <>
      <TableCell className="border-l p-1">
        <NumberCell value={count?.girls ?? null} onCommit={(v) => onSave(v, count?.boys ?? null)} />
      </TableCell>
      <TableCell className="p-1">
        <NumberCell value={count?.boys ?? null} onCommit={(v) => onSave(count?.girls ?? null, v)} />
      </TableCell>
      <TableCell className="text-center tabular-nums">
        {total ?? <span className="text-muted-foreground">—</span>}
      </TableCell>
      <TableCell className="text-center tabular-nums">
        <DiffText value={diff} />
      </TableCell>
    </>
  )
}

/**
 * An uncontrolled-ish number box: it tracks its own text while focused so a
 * half-typed value is not clobbered by a refetch, and commits on blur. An empty
 * box commits null, never 0.
 */
function NumberCell({value, onCommit}: {value: number | null; onCommit: (v: number | null) => void}) {
  const external = value === null ? '' : String(value)
  const [draft, setDraft] = useState<string | null>(null)
  const shown = draft ?? external

  return (
    <Input
      className="h-8 w-14 px-1 text-center tabular-nums"
      inputMode="numeric"
      value={shown}
      onChange={(e) => setDraft(e.target.value.replace(/[^\d]/g, ''))}
      onFocus={() => setDraft(external)}
      onBlur={() => {
        const next = shown.trim() === '' ? null : Number(shown)
        setDraft(null)
        if (next !== value) onCommit(next)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
        if (e.key === 'Escape') {
          setDraft(null)
          e.currentTarget.blur()
        }
      }}
    />
  )
}
