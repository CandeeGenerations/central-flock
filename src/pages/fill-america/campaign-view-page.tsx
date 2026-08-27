import {Badge} from '@/components/ui/badge'
import {Button} from '@/components/ui/button'
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card'
import {Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle} from '@/components/ui/dialog'
import {Input} from '@/components/ui/input'
import {Label} from '@/components/ui/label'
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select'
import {PageSpinner} from '@/components/ui/spinner'
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from '@/components/ui/table'
import {
  type CampaignDetail,
  type RosterEntry,
  createHousehold,
  fetchCampaign,
  fetchHouseholds,
  removeRosterEntry,
  saveDoorHangers,
  saveRosterEntry,
  saveTracts,
} from '@/lib/fill-america-api'
import {SEASON_LABELS, weekLabel} from '@/lib/fill-america-core'
import {queryKeys} from '@/lib/query-keys'
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'
import {ArrowLeft, Megaphone, Plus, Trash2} from 'lucide-react'
import {useMemo, useState} from 'react'
import {Link, useParams} from 'react-router-dom'
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
      </div>

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
}: {
  campaignId: number
  weeks: CampaignDetail['weeks']
  roster: RosterEntry[]
  totals: CampaignDetail['totals']
  onSaveTracts: (householdId: number, weekNo: number, v: number | null) => void
  onSaveEntry: (householdId: number, size: number, goal: number | null) => void
  onRemove: (householdId: number) => void
}) {
  const [adding, setAdding] = useState(false)

  const weekTotals = weeks.map((w) => w.tracts)
  const goalTotal = totals.goal

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle>Roster</CardTitle>
        <Button size="sm" onClick={() => setAdding(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Add household
        </Button>
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
                  <TableCell className="font-medium whitespace-nowrap">
                    {r.householdName}
                    {r.householdActive ? '' : ' (retired)'}
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
            <Select value={picked} onValueChange={setPicked}>
              <SelectTrigger>
                <SelectValue placeholder={available.length ? 'Choose…' : 'All households are already on'} />
              </SelectTrigger>
              <SelectContent>
                {available.map((h) => (
                  <SelectItem key={h.id} value={String(h.id)}>
                    {h.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
 * Tracks its own text while focused so a refetch cannot clobber a half-typed
 * value, and commits on blur. An empty box commits null, never 0.
 */
function NumberCell({
  value,
  className,
  onCommit,
}: {
  value: number | null
  className?: string
  onCommit: (v: number | null) => void
}) {
  const external = value === null ? '' : String(value)
  const [draft, setDraft] = useState<string | null>(null)
  const shown = draft ?? external

  return (
    <Input
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
