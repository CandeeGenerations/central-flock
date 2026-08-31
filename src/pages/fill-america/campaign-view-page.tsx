import {Badge} from '@/components/ui/badge'
import {Button} from '@/components/ui/button'
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card'
import {Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle} from '@/components/ui/dialog'
import {Input} from '@/components/ui/input'
import {Label} from '@/components/ui/label'
import {SearchableSelect} from '@/components/ui/searchable-select'
import {PageSpinner} from '@/components/ui/spinner'
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from '@/components/ui/table'
import {
  type CampaignDetail,
  type RosterEntry,
  changeRosterHousehold,
  createHousehold,
  fetchCampaign,
  fetchCampaigns,
  fetchHouseholds,
  removeRosterEntry,
  saveDoorHangers,
  saveRosterEntry,
  saveTracts,
  updateCampaign,
} from '@/lib/fill-america-api'
import {SEASON_LABELS, seasonalPredecessors, weekLabel} from '@/lib/fill-america-core'
import {queryKeys} from '@/lib/query-keys'
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'
import {ArrowLeft, Eraser, Megaphone, Plus, Trash2} from 'lucide-react'
import {useMemo, useState} from 'react'
import {Link, useParams} from 'react-router-dom'
import {Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis} from 'recharts'
import {toast} from 'sonner'

export function FillAmericaCampaignViewPage() {
  const {id = ''} = useParams()
  const qc = useQueryClient()

  const {data, isLoading} = useQuery({
    queryKey: queryKeys.fillAmericaCampaign(id),
    queryFn: () => fetchCampaign(id),
  })

  // Every write changes something derived — participants, tracts, totals — so
  // the whole campaign is refetched rather than patched in place.
  const invalidate = () => {
    qc.invalidateQueries({queryKey: queryKeys.fillAmericaCampaign(id)})
    qc.invalidateQueries({queryKey: queryKeys.fillAmericaCampaigns})
  }
  const onError = (e: unknown) => toast.error(e instanceof Error ? e.message : 'Save failed')

  const hangers = useMutation({
    mutationFn: (v: {weekNo: number; doorHangers: number | null}) =>
      saveDoorHangers(Number(id), v.weekNo, v.doorHangers),
    onSuccess: invalidate,
    onError,
  })
  const tracts = useMutation({
    mutationFn: (v: {householdId: number; weekNo: number; tracts: number | null}) =>
      saveTracts(Number(id), v.householdId, v.weekNo, v.tracts),
    onSuccess: invalidate,
    onError,
  })
  const entry = useMutation({
    mutationFn: (v: {householdId: number; size: number; goal: number | null}) =>
      saveRosterEntry(Number(id), v.householdId, {size: v.size, goal: v.goal}),
    onSuccess: invalidate,
    onError,
  })
  const removeEntry = useMutation({
    mutationFn: (householdId: number) => removeRosterEntry(Number(id), householdId),
    onSuccess: invalidate,
    onError,
  })
  const doorHangerGoal = useMutation({
    mutationFn: (v: number | null) => updateCampaign(Number(id), {doorHangerGoal: v}),
    onSuccess: invalidate,
    onError,
  })
  const repoint = useMutation({
    mutationFn: (v: {fromHouseholdId: number; householdId: number}) =>
      changeRosterHousehold(Number(id), v.fromHouseholdId, v.householdId),
    onSuccess: invalidate,
    onError,
  })

  if (isLoading || !data) return <PageSpinner />
  const {campaign, weeks, roster, totals} = data

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/fill-america" aria-label="Back to campaigns">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <Megaphone className="h-6 w-6" />
        <h2 className="text-2xl font-bold">{campaign.title}</h2>
        <Badge variant="secondary">{SEASON_LABELS[campaign.season]}</Badge>
        <div className="ml-auto flex items-center gap-2">
          <Label htmlFor="fa-hanger-goal" className="text-muted-foreground text-sm">
            Door hanger goal
          </Label>
          <NumberCell
            value={campaign.doorHangerGoal}
            className="w-24"
            onCommit={(v) => doorHangerGoal.mutate(v)}
            inputId="fa-hanger-goal"
          />
          {campaign.doorHangerGoal ? (
            <span className="text-muted-foreground text-sm tabular-nums">
              {Math.round((totals.doorHangers / campaign.doorHangerGoal) * 100)}% &middot;{' '}
              {totals.doorHangers.toLocaleString()} of {campaign.doorHangerGoal.toLocaleString()}
            </span>
          ) : null}
        </div>
      </div>

      <SeasonalComparison campaignId={campaign.id} totals={totals} />

      <WeekChartCard weeks={weeks} />

      <WeeksCard
        weeks={weeks}
        totals={totals}
        onSaveHangers={(weekNo, doorHangers) => hangers.mutate({weekNo, doorHangers})}
      />

      <RosterCard
        campaignId={Number(id)}
        weeks={weeks}
        roster={roster}
        totals={totals}
        onSaveTracts={(householdId, weekNo, v) => tracts.mutate({householdId, weekNo, tracts: v})}
        onSaveEntry={(householdId, size, goal) => entry.mutate({householdId, size, goal})}
        onRemove={(householdId) => removeEntry.mutate(householdId)}
        onRepoint={(fromHouseholdId, householdId) => repoint.mutate({fromHouseholdId, householdId})}
      />

      <TopEffortsCard roster={roster} weeks={weeks} />
    </div>
  )
}

function WeeksCard({
  weeks,
  totals,
  onSaveHangers,
}: {
  weeks: CampaignDetail['weeks']
  totals: CampaignDetail['totals']
  onSaveHangers: (weekNo: number, v: number | null) => void
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Weeks</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Unique Participants</TableHead>
                <TableHead className="text-right">Tracts</TableHead>
                <TableHead className="text-right">Door Hangers</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {weeks.map((w) => (
                <TableRow key={w.id}>
                  <TableCell className="font-medium whitespace-nowrap">{weekLabel(w.weekDate)}</TableCell>
                  <TableCell className="text-muted-foreground text-right tabular-nums">
                    {w.uniqueParticipants.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-right tabular-nums">
                    {w.tracts.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <NumberCell
                      value={w.doorHangers}
                      className="ml-auto w-20"
                      onCommit={(v) => onSaveHangers(w.weekNo, v)}
                    />
                  </TableCell>
                </TableRow>
              ))}
              <TableRow className="bg-muted/40 font-semibold">
                <TableCell>Total</TableCell>
                <TableCell className="text-right tabular-nums">{totals.uniqueParticipants.toLocaleString()}</TableCell>
                <TableCell className="text-right tabular-nums">{totals.tracts.toLocaleString()}</TableCell>
                <TableCell className="text-right tabular-nums">{totals.doorHangers.toLocaleString()}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
        <p className="text-muted-foreground mt-3 text-xs">
          Participants and Tracts are derived from the roster and cannot be typed. A household counts as taking part in
          the first week it reports tracts, so the weekly figures add up to the campaign total without counting a family
          twice. Door hangers are never attributed to a household.
        </p>
      </CardContent>
    </Card>
  )
}

function RosterCard({
  campaignId,
  weeks,
  roster,
  totals,
  onSaveTracts,
  onSaveEntry,
  onRemove,
  onRepoint,
}: {
  campaignId: number
  weeks: CampaignDetail['weeks']
  roster: RosterEntry[]
  totals: CampaignDetail['totals']
  onSaveTracts: (householdId: number, weekNo: number, v: number | null) => void
  onSaveEntry: (householdId: number, size: number, goal: number | null) => void
  onRemove: (householdId: number) => void
  onRepoint: (fromHouseholdId: number, householdId: number) => void
}) {
  const [adding, setAdding] = useState(false)
  const [clearing, setClearing] = useState(false)

  // Rosters are copied forward from the previous campaign, so a fresh campaign
  // starts full of households that may never report. "Empty" is the strict
  // sense the participant rule uses: not one week with tracts above zero.
  const empties = roster.filter((r) => !r.tracts.some((t) => t !== null && t > 0))

  const weekTotals = weeks.map((w) => w.tracts)
  const goalTotal = totals.rosterGoal

  // Every active household, minus the ones already on this campaign, plus the
  // row's own — repointing is a swap, so the current value has to stay listed.
  const {data: households} = useQuery({
    queryKey: queryKeys.fillAmericaHouseholds(false),
    queryFn: () => fetchHouseholds(false),
  })
  const onRoster = new Set(roster.map((r) => r.householdId))
  const householdOptions = (ownId: number, ownName: string, ownActive: boolean) => [
    {value: String(ownId), label: ownActive ? ownName : `${ownName} (retired)`},
    ...(households ?? []).filter((h) => !onRoster.has(h.id)).map((h) => ({value: String(h.id), label: h.name})),
  ]

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 space-y-0">
        <CardTitle>Roster</CardTitle>
        <div className="flex items-center gap-2">
          {empties.length > 0 && (
            <Button size="sm" variant="outline" onClick={() => setClearing(true)}>
              <Eraser className="mr-2 h-4 w-4" />
              Clear {empties.length} empty
            </Button>
          )}
          <Button size="sm" onClick={() => setAdding(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add household
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Household</TableHead>
                <TableHead className="w-20 text-center">Size</TableHead>
                <TableHead className="w-24 text-center">Goal</TableHead>
                {weeks.map((w) => (
                  <TableHead key={w.id} className="w-24 text-center">
                    {weekLabel(w.weekDate)}
                  </TableHead>
                ))}
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {roster.map((r) => (
                <TableRow key={r.id} className={r.householdActive ? '' : 'opacity-60'}>
                  <TableCell className="p-1">
                    <SearchableSelect
                      value={String(r.householdId)}
                      onValueChange={(v) => onRepoint(r.householdId, Number(v))}
                      options={householdOptions(r.householdId, r.householdName, r.householdActive)}
                      className="w-52"
                    />
                  </TableCell>
                  <TableCell className="p-1">
                    <NumberCell
                      value={r.size}
                      className="mx-auto w-14"
                      onCommit={(v) => onSaveEntry(r.householdId, Math.max(1, v ?? 1), r.goal)}
                    />
                  </TableCell>
                  <TableCell className="p-1">
                    <NumberCell
                      value={r.goal}
                      className="mx-auto w-16"
                      onCommit={(v) => onSaveEntry(r.householdId, r.size, v)}
                    />
                  </TableCell>
                  {weeks.map((w, i) => (
                    <TableCell key={w.id} className="p-1">
                      <NumberCell
                        value={r.tracts[i] ?? null}
                        className="mx-auto w-16"
                        onCommit={(v) => onSaveTracts(r.householdId, w.weekNo, v)}
                      />
                    </TableCell>
                  ))}
                  <TableCell className="text-right font-semibold tabular-nums">{r.total.toLocaleString()}</TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Remove from this campaign"
                      onClick={() => onRemove(r.householdId)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {roster.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5 + weeks.length} className="text-muted-foreground py-8 text-center">
                    No households on this campaign yet.
                  </TableCell>
                </TableRow>
              )}
              {roster.length > 0 && (
                <TableRow className="bg-muted/40 font-semibold">
                  <TableCell>Total</TableCell>
                  <TableCell className="text-center tabular-nums">
                    {roster.reduce((a, r) => a + r.size, 0).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-center tabular-nums">
                    {goalTotal ? goalTotal.toLocaleString() : '—'}
                  </TableCell>
                  {weekTotals.map((t, i) => (
                    <TableCell key={i} className="text-center tabular-nums">
                      {t.toLocaleString()}
                    </TableCell>
                  ))}
                  <TableCell className="text-right tabular-nums">{totals.tracts.toLocaleString()}</TableCell>
                  <TableCell />
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        <p className="text-muted-foreground mt-3 text-xs">
          Blank is not zero: leave a cell empty when a household reported nothing. Size is this campaign&rsquo;s
          headcount and is stored per campaign, so editing it never restates an earlier one.
        </p>
      </CardContent>

      <Dialog open={clearing} onOpenChange={(v) => !v && setClearing(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Clear {empties.length} empty households?</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground text-sm">
            Removes households that reported no tracts in any week of this campaign. It only affects this
            campaign&rsquo;s roster — the households themselves, and every other campaign they are on, are untouched.
            Add any of them back at any time.
          </p>
          <div className="max-h-48 overflow-y-auto rounded-md border p-3 text-sm">
            {empties.map((r) => (
              <div key={r.id}>{r.householdName}</div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setClearing(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                empties.forEach((r) => onRemove(r.householdId))
                setClearing(false)
              }}
            >
              Clear {empties.length}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AddHouseholdDialog
        open={adding}
        campaignId={campaignId}
        alreadyOn={new Set(roster.map((r) => r.householdId))}
        onClose={() => setAdding(false)}
        onPick={(householdId) => {
          onSaveEntry(householdId, 1, null)
          setAdding(false)
        }}
      />
    </Card>
  )
}

function AddHouseholdDialog({
  open,
  alreadyOn,
  onClose,
  onPick,
}: {
  open: boolean
  campaignId: number
  alreadyOn: Set<number>
  onClose: () => void
  onPick: (householdId: number) => void
}) {
  const qc = useQueryClient()
  const [picked, setPicked] = useState('')
  const [newName, setNewName] = useState('')

  const {data: households} = useQuery({
    queryKey: queryKeys.fillAmericaHouseholds(false),
    queryFn: () => fetchHouseholds(false),
    enabled: open,
  })

  const available = (households ?? []).filter((h) => !alreadyOn.has(h.id))

  const create = useMutation({
    mutationFn: (name: string) => createHousehold(name),
    onSuccess: (row) => {
      qc.invalidateQueries({queryKey: ['fillAmericaHouseholds']})
      setNewName('')
      onPick(row.id)
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not create household'),
  })

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add household to this campaign</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Existing household</Label>
            <SearchableSelect
              value={picked}
              onValueChange={setPicked}
              options={available.map((h) => ({value: String(h.id), label: h.name}))}
              placeholder={available.length ? 'Search households…' : 'All households are already on'}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fa-new-household">Or create a new one</Label>
            <Input
              id="fa-new-household"
              value={newName}
              placeholder="Newcombs"
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newName.trim()) create.mutate(newName.trim())
              }}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          {newName.trim() ? (
            <Button disabled={create.isPending} onClick={() => create.mutate(newName.trim())}>
              Create &amp; add
            </Button>
          ) : (
            <Button disabled={!picked} onClick={() => onPick(Number(picked))}>
              Add
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** The campaign's biggest single-week efforts. All-time boards are slice 3. */
function TopEffortsCard({roster, weeks}: {roster: RosterEntry[]; weeks: CampaignDetail['weeks']}) {
  const top = useMemo(() => {
    const rows: {name: string; week: string; tracts: number}[] = []
    for (const r of roster) {
      r.tracts.forEach((t, i) => {
        if (t !== null && t > 0 && weeks[i])
          rows.push({name: r.householdName, week: weekLabel(weeks[i].weekDate), tracts: t})
      })
    }
    return rows.sort((a, b) => b.tracts - a.tracts).slice(0, 10)
  }, [roster, weeks])

  if (top.length === 0) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle>Top 10 single-week efforts</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">#</TableHead>
                <TableHead>Household</TableHead>
                <TableHead>Week</TableHead>
                <TableHead className="text-right">Tracts</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {top.map((t, i) => (
                <TableRow key={`${t.name}-${t.week}`}>
                  <TableCell className="text-muted-foreground tabular-nums">{i + 1}</TableCell>
                  <TableCell className="font-medium">{t.name}</TableCell>
                  <TableCell>{t.week}</TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">{t.tracts.toLocaleString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}

/**
 * This campaign against the same Season a year earlier — never against the
 * previous campaign, which is usually a different Season, and Season dominates
 * the result. Read off the campaign list, which every metric is already derived
 * on, rather than a second endpoint.
 */
function SeasonalComparison({campaignId, totals}: {campaignId: number; totals: CampaignDetail['totals']}) {
  const {data: campaigns} = useQuery({queryKey: queryKeys.fillAmericaCampaigns, queryFn: fetchCampaigns})

  const previous = useMemo(() => {
    // The list arrives newest-first; the predecessor rule wants ascending.
    const asc = [...(campaigns ?? [])].sort((a, b) => a.startDate.localeCompare(b.startDate))
    const i = asc.findIndex((c) => c.id === campaignId)
    if (i < 0) return null
    const j = seasonalPredecessors(asc)[i]
    return j >= 0 ? asc[j] : null
  }, [campaigns, campaignId])

  if (!previous) return null

  return (
    <p className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
      <span>
        vs <span className="text-foreground font-medium">{previous.title}</span>
      </span>
      <Delta label="Tracts" now={totals.tracts} then={previous.tracts} />
      <Delta label="Door Hangers" now={totals.doorHangers} then={previous.doorHangers} />
      <Delta label="Participants" now={totals.uniqueParticipants} then={previous.uniqueParticipants} />
    </p>
  )
}

function Delta({label, now, then}: {label: string; now: number; then: number}) {
  const pct = then > 0 ? Math.round(((now - then) / then) * 100) : null
  const up = now >= then
  return (
    <span className="tabular-nums">
      {label} <span className="text-foreground font-medium">{now.toLocaleString()}</span> vs {then.toLocaleString()}
      {pct !== null && (
        <span className={`ml-1 font-medium ${up ? 'text-green-600' : 'text-red-600'}`}>
          {pct >= 0 ? '+' : ''}
          {pct}%
        </span>
      )}
    </span>
  )
}

/** Tracts and Door Hangers side by side, one pair per Campaign Week. */
function WeekChartCard({weeks}: {weeks: CampaignDetail['weeks']}) {
  const data = weeks.map((w) => ({
    week: weekLabel(w.weekDate),
    tracts: w.tracts,
    doorHangers: w.doorHangers ?? 0,
  }))
  // Nothing recorded yet is three empty columns, which says less than no chart.
  if (!data.some((d) => d.tracts > 0 || d.doorHangers > 0)) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle>By week</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={data}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="week" tick={{fontSize: 12, fill: 'var(--muted-foreground)'}} tickLine={false} />
            <YAxis
              allowDecimals={false}
              tick={{fontSize: 12, fill: 'var(--muted-foreground)'}}
              width={45}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              cursor={{fill: 'var(--muted)', opacity: 0.4}}
              content={({active, payload, label}) => {
                if (!active || !payload?.length) return null
                return (
                  <div className="bg-card rounded-lg border px-3 py-2 shadow-md">
                    <p className="mb-1 text-sm font-medium">Week of {label}</p>
                    {payload.map((e) => (
                      <p key={e.name} className="text-muted-foreground text-xs">
                        <span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{backgroundColor: e.color}} />
                        {e.name}:{' '}
                        <span className="text-foreground font-medium">{Number(e.value).toLocaleString()}</span>
                      </p>
                    ))}
                  </div>
                )
              }}
            />
            <Legend wrapperStyle={{fontSize: 12}} />
            <Bar dataKey="tracts" name="Tracts" fill="var(--primary)" radius={[4, 4, 0, 0]} />
            <Bar dataKey="doorHangers" name="Door Hangers" fill="#3b82f6" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}

/**
 * Tracks its own text while focused so a refetch cannot clobber a half-typed
 * value, and commits on blur. An empty box commits null, never 0.
 */
function NumberCell({
  value,
  className,
  onCommit,
  inputId,
}: {
  value: number | null
  className?: string
  onCommit: (v: number | null) => void
  inputId?: string
}) {
  const external = value === null ? '' : String(value)
  const [draft, setDraft] = useState<string | null>(null)
  const shown = draft ?? external

  return (
    <Input
      id={inputId}
      className={`h-8 px-1 text-center tabular-nums ${className ?? ''}`}
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
