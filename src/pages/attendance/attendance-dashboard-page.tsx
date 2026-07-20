import {Button} from '@/components/ui/button'
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card'
import {DatePicker} from '@/components/ui/date-time-picker'
import {Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle} from '@/components/ui/dialog'
import {Input} from '@/components/ui/input'
import {Label} from '@/components/ui/label'
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select'
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from '@/components/ui/table'
import {
  type Metric,
  type RecordEdit,
  type ServiceRecordRow,
  fetchRecordHistory,
  fetchRecords,
  fetchSeries,
  fetchServiceTimes,
  fetchSummary,
  updateRecord,
} from '@/lib/attendance-api'
import {queryKeys} from '@/lib/query-keys'
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'
import {History, Pencil, TrendingDown, TrendingUp} from 'lucide-react'
import {useMemo, useState} from 'react'
import {CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis} from 'recharts'
import {toast} from 'sonner'

const METRIC_LABELS: Record<Metric, string> = {attendance: 'Attendance', streaming: 'Streaming', total: 'Total'}

function isoDaysAgo(days: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - days)
  return d.toISOString().slice(0, 10)
}
function shiftYear(iso: string, years: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  return `${y + years}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

// Least-squares slope/intercept over y indexed 0..n-1.
function linreg(y: number[]): {slope: number; intercept: number} {
  const n = y.length
  if (n < 2) return {slope: 0, intercept: y[0] ?? 0}
  let sx = 0,
    sy = 0,
    sxy = 0,
    sxx = 0
  for (let i = 0; i < n; i++) {
    sx += i
    sy += y[i]
    sxy += i * y[i]
    sxx += i * i
  }
  const denom = n * sxx - sx * sx
  const slope = denom === 0 ? 0 : (n * sxy - sx * sy) / denom
  const intercept = (sy - slope * sx) / n
  return {slope, intercept}
}
function movingAvg(y: number[], w: number): (number | null)[] {
  return y.map((_, i) => {
    if (i < w - 1) return null
    let s = 0
    for (let k = i - w + 1; k <= i; k++) s += y[k]
    return Math.round((s / w) * 10) / 10
  })
}

export function AttendanceDashboardPage() {
  const [metric, setMetric] = useState<Metric>('attendance')
  const [serviceTimeId, setServiceTimeId] = useState<string>('all')
  const [from, setFrom] = useState(isoDaysAgo(365))
  const [to, setTo] = useState(isoDaysAgo(0))
  const [yoy, setYoy] = useState(false)

  const {data: serviceTimes} = useQuery({
    queryKey: queryKeys.serviceTimes(true),
    queryFn: () => fetchServiceTimes(true),
  })

  const {data: series} = useQuery({
    queryKey: queryKeys.attendanceSeries(metric, serviceTimeId, from, to),
    queryFn: () => fetchSeries({metric, serviceTimeId, from, to}),
  })
  const {data: prevSeries} = useQuery({
    queryKey: queryKeys.attendanceSeries(metric, serviceTimeId, shiftYear(from, -1), shiftYear(to, -1)),
    queryFn: () => fetchSeries({metric, serviceTimeId, from: shiftYear(from, -1), to: shiftYear(to, -1)}),
    enabled: yoy,
  })
  const {data: summary} = useQuery({
    queryKey: queryKeys.attendanceSummary(serviceTimeId),
    queryFn: () => fetchSummary(serviceTimeId),
  })

  const {chartData, delta} = useMemo(() => {
    const pts = series?.points ?? []
    const y = pts.map((p) => p.value)
    const {slope, intercept} = linreg(y)
    const ma = movingAvg(y, 4)
    const prev = prevSeries?.points ?? []
    const data = pts.map((p, i) => ({
      date: p.date,
      value: p.value,
      trend: Math.round((intercept + slope * i) * 10) / 10,
      ma: ma[i],
      prev: yoy ? (prev[i]?.value ?? null) : null,
    }))
    const fittedStart = intercept
    const fittedEnd = intercept + slope * Math.max(0, y.length - 1)
    const pct = fittedStart > 0 ? Math.round(((fittedEnd - fittedStart) / fittedStart) * 100) : 0
    return {chartData: data, delta: {pct, up: fittedEnd >= fittedStart, count: y.length}}
  }, [series, prevSeries, yoy])

  const metricSummary = summary?.metrics[metric]

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-2xl font-bold">Attendance</h2>
      </div>

      {/* Filters */}
      <Card size="sm">
        <CardContent className="flex flex-wrap items-end gap-3 py-4">
          <div className="space-y-1.5">
            <Label>Metric</Label>
            <Select value={metric} onValueChange={(v) => setMetric(v as Metric)}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="attendance">Attendance</SelectItem>
                <SelectItem value="streaming">Streaming</SelectItem>
                <SelectItem value="total">Total</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Service Time</Label>
            <Select value={serviceTimeId} onValueChange={setServiceTimeId}>
              <SelectTrigger className="w-52">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All combined</SelectItem>
                {(serviceTimes ?? []).map((st) => (
                  <SelectItem key={st.id} value={String(st.id)}>
                    {st.name}
                    {st.active ? '' : ' (retired)'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 w-44">
            <Label>From</Label>
            <DatePicker value={from} onChange={(v) => v && setFrom(v)} />
          </div>
          <div className="space-y-1.5 w-44">
            <Label>To</Label>
            <DatePicker value={to} onChange={(v) => v && setTo(v)} />
          </div>
          <Button variant={yoy ? 'default' : 'outline'} onClick={() => setYoy((v) => !v)}>
            vs Last Year
          </Button>
        </CardContent>
      </Card>

      {/* Tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Tile label="This Month" value={metricSummary?.month.total} sub={`avg ${metricSummary?.month.avg ?? 0}`} />
        <Tile label="This Month · services" value={metricSummary?.month.count} />
        <Tile label="This Year" value={metricSummary?.year.total} sub={`avg ${metricSummary?.year.avg ?? 0}`} />
        <Tile label="This Year · services" value={metricSummary?.year.count} />
      </div>

      {/* Chart */}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>
            {METRIC_LABELS[metric]} over time
            {serviceTimeId !== 'all' && serviceTimes
              ? ` · ${serviceTimes.find((s) => String(s.id) === serviceTimeId)?.name ?? ''}`
              : ' · all combined'}
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
            <p className="text-center text-muted-foreground py-8">No data for this range.</p>
          ) : (
            <ResponsiveContainer width="100%" height={320}>
              <LineChart data={chartData}>
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
                      <div className="rounded-lg border bg-card px-3 py-2 shadow-md">
                        <p className="text-sm font-medium mb-1">{label}</p>
                        {payload
                          .filter((e) => e.value != null)
                          .map((e) => (
                            <p key={e.name} className="text-xs text-muted-foreground">
                              <span
                                className="inline-block w-2 h-2 rounded-full mr-1.5"
                                style={{backgroundColor: e.color}}
                              />
                              {e.name}: <span className="font-medium text-foreground">{e.value}</span>
                            </p>
                          ))}
                      </div>
                    )
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="value"
                  name={METRIC_LABELS[metric]}
                  stroke="var(--primary)"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="ma"
                  name="4-pt avg"
                  stroke="var(--muted-foreground)"
                  strokeWidth={1.5}
                  strokeDasharray="5 4"
                  dot={false}
                  connectNulls
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
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <RecordsTable serviceTimeId={serviceTimeId === 'all' ? null : Number(serviceTimeId)} from={from} to={to} />
    </div>
  )
}

function Tile({label, value, sub}: {label: string; value: number | undefined; sub?: string}) {
  return (
    <Card size="sm">
      <CardContent className="py-4">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="text-3xl font-bold">{value ?? '—'}</p>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  )
}

function RecordsTable({serviceTimeId, from, to}: {serviceTimeId: number | null; from: string; to: string}) {
  const qc = useQueryClient()
  const {data: records} = useQuery({
    queryKey: queryKeys.attendanceRecords(serviceTimeId, from, to),
    queryFn: () => fetchRecords({serviceTimeId, from, to, limit: 100}),
  })
  const [editing, setEditing] = useState<ServiceRecordRow | null>(null)
  const [historyRecord, setHistoryRecord] = useState<ServiceRecordRow | null>(null)

  const mut = useMutation({
    mutationFn: (data: {id: number; attendance: number | null; streaming: number | null}) =>
      updateRecord(data.id, {attendance: data.attendance, streaming: data.streaming}),
    onSuccess: () => {
      qc.invalidateQueries({queryKey: ['attendanceRecords']})
      qc.invalidateQueries({queryKey: ['attendanceSeries']})
      qc.invalidateQueries({queryKey: ['attendanceSummary']})
      setEditing(null)
      toast.success('Record updated')
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Update failed'),
  })

  const rows = records ?? []
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="text-base">Recent records</CardTitle>
      </CardHeader>
      <div className="overflow-x-auto border-t">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Service</TableHead>
              <TableHead className="text-right">Attendance</TableHead>
              <TableHead className="text-right">Streaming</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead>Entered by</TableHead>
              <TableHead className="w-20" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell>{r.serviceDate}</TableCell>
                <TableCell>{r.serviceTimeName}</TableCell>
                <TableCell className="text-right">{r.attendance ?? '—'}</TableCell>
                <TableCell className="text-right">{r.streaming ?? '—'}</TableCell>
                <TableCell className="text-right font-medium">{(r.attendance ?? 0) + (r.streaming ?? 0)}</TableCell>
                <TableCell className="text-muted-foreground">{r.enteredBy ?? 'Imported'}</TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" title="History" onClick={() => setHistoryRecord(r)}>
                      <History className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" title="Edit" onClick={() => setEditing(r)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                  No records in this range.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <EditRecordDialog
        record={editing}
        pending={mut.isPending}
        onClose={() => setEditing(null)}
        onSave={(d) => mut.mutate(d)}
      />
      <HistoryDialog record={historyRecord} onClose={() => setHistoryRecord(null)} />
    </Card>
  )
}

function HistoryDialog({record, onClose}: {record: ServiceRecordRow | null; onClose: () => void}) {
  const {data: edits, isLoading} = useQuery({
    queryKey: queryKeys.attendanceRecordHistory(record?.id ?? 0),
    queryFn: () => fetchRecordHistory(record!.id),
    enabled: !!record,
  })
  return (
    <Dialog open={!!record} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            History · {record?.serviceTimeName} · {record?.serviceDate}
          </DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <p className="text-muted-foreground py-4">Loading…</p>
        ) : (edits ?? []).length === 0 ? (
          <p className="text-muted-foreground py-4">No edit history (imported record).</p>
        ) : (
          <div className="max-h-96 overflow-y-auto divide-y">
            {(edits ?? []).map((e: RecordEdit) => (
              <div key={e.id} className="flex items-center justify-between py-2 text-sm">
                <div>
                  <span className="font-medium">{e.recorderName}</span>
                  <span className="text-muted-foreground"> · {e.createdAt}</span>
                </div>
                <div className="text-muted-foreground tabular-nums">
                  A {e.attendance ?? '—'} · S {e.streaming ?? '—'}
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function EditRecordDialog(props: {
  record: ServiceRecordRow | null
  pending: boolean
  onClose: () => void
  onSave: (d: {id: number; attendance: number | null; streaming: number | null}) => void
}) {
  const {record, pending, onClose, onSave} = props
  const [att, setAtt] = useState('')
  const [strm, setStrm] = useState('')
  const [lastId, setLastId] = useState<number | null>(null)
  if (record && record.id !== lastId) {
    setLastId(record.id)
    setAtt(record.attendance == null ? '' : String(record.attendance))
    setStrm(record.streaming == null ? '' : String(record.streaming))
  }
  const parse = (s: string) => (s.trim() === '' ? null : Number(s))
  return (
    <Dialog open={!!record} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {record?.serviceTimeName} · {record?.serviceDate}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="ed-att">Attendance</Label>
            <Input
              id="ed-att"
              type="number"
              min={0}
              value={att}
              onChange={(e) => setAtt(e.target.value)}
              placeholder="blank = not recorded"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ed-strm">Streaming</Label>
            <Input
              id="ed-strm"
              type="number"
              min={0}
              value={strm}
              onChange={(e) => setStrm(e.target.value)}
              placeholder="blank = not recorded"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={pending}
            onClick={() => record && onSave({id: record.id, attendance: parse(att), streaming: parse(strm)})}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
