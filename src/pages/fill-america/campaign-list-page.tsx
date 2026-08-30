import {Badge} from '@/components/ui/badge'
import {Button} from '@/components/ui/button'
import {Card, CardContent} from '@/components/ui/card'
import {DateRangePicker} from '@/components/ui/date-range-picker'
import {Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle} from '@/components/ui/dialog'
import {Input} from '@/components/ui/input'
import {Label} from '@/components/ui/label'
import {SearchInput} from '@/components/ui/search-input'
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select'
import {PageSpinner} from '@/components/ui/spinner'
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from '@/components/ui/table'
import {createCampaign, fetchCampaigns} from '@/lib/fill-america-api'
import {
  SEASONS,
  SEASON_LABELS,
  type Season,
  campaignWeekDates,
  defaultSeason,
  defaultTitle,
} from '@/lib/fill-america-core'
import {queryKeys} from '@/lib/query-keys'
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'
import {Megaphone, Plus} from 'lucide-react'
import {useState} from 'react'
import {useNavigate, useSearchParams} from 'react-router-dom'
import {toast} from 'sonner'

import {FillAmericaDashboard} from './campaign-dashboard'

const pad2 = (n: number) => String(n).padStart(2, '0')

function todayIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

/** The Saturday on or before a date — every campaign so far starts on one. */
function nearestSaturday(iso: string): string {
  const d = new Date(iso + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 1) % 7))
  return d.toISOString().slice(0, 10)
}

function addDaysIso(iso: string, days: number): string {
  const d = new Date(iso + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/**
 * Per-column shading, as the spreadsheet this replaces does it: each column is
 * scaled independently between its own smallest and largest value, so a column
 * of thousands and a column of dozens are both readable. Zero gets no fill at
 * all, which is what makes an empty campaign obvious at a glance.
 *
 * The tint is a fixed green at varying alpha rather than a palette of solid
 * colours, so it composes over whichever surface the active theme paints and
 * never fights the foreground text.
 */
function heatScale(values: number[]) {
  const present = values.filter((v) => v > 0)
  const min = Math.min(...present)
  const max = Math.max(...present)
  return (v: number): React.CSSProperties | undefined => {
    if (!present.length || v <= 0) return undefined
    const t = max === min ? 1 : (v - min) / (max - min)
    return {backgroundColor: `color-mix(in oklab, var(--primary) ${8 + t * 30}%, transparent)`}
  }
}

export function FillAmericaCampaignListPage() {
  const navigate = useNavigate()
  const [manualOpen, setManualOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [params, setParams] = useSearchParams()

  // The command palette's "New Campaign" lands here with ?new=1. Derived rather
  // than pushed into state by an effect, so arriving with the param opens the
  // dialog on the first render.
  const wantsNew = params.get('new') === '1'
  const open = manualOpen || wantsNew
  const setOpen = (next: boolean) => {
    setManualOpen(next)
    if (!next && wantsNew) setParams({}, {replace: true})
  }

  const {data: campaigns, isLoading} = useQuery({
    queryKey: queryKeys.fillAmericaCampaigns,
    queryFn: fetchCampaigns,
  })

  if (isLoading) return <PageSpinner />

  const q = search.trim().toLowerCase()
  const filtered = (campaigns ?? []).filter(
    (c) => !q || c.title.toLowerCase().includes(q) || SEASON_LABELS[c.season].toLowerCase().includes(q),
  )

  // Scaled across every campaign, not just the filtered ones, so searching does
  // not silently rescale the colours under you.
  const all = campaigns ?? []
  const heatParticipants = heatScale(all.map((c) => c.uniqueParticipants))
  const heatTracts = heatScale(all.map((c) => c.tracts))
  const heatHangers = heatScale(all.map((c) => c.doorHangers))

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="mb-6 flex items-center gap-3">
        <Megaphone className="h-6 w-6" />
        <h2 className="text-2xl font-bold">Fill America</h2>
        <Button className="ml-auto" onClick={() => setOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          New Campaign
        </Button>
      </div>

      <FillAmericaDashboard />

      <Card size="sm">
        <CardContent className="space-y-3 p-4">
          <SearchInput value={search} onChange={setSearch} placeholder="Search campaigns…" />
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Campaign</TableHead>
                  <TableHead>Season</TableHead>
                  <TableHead className="text-center">Weeks</TableHead>
                  <TableHead className="text-center">Households</TableHead>
                  <TableHead className="text-right">Participants</TableHead>
                  <TableHead className="text-right">Hanger Goal</TableHead>
                  <TableHead className="text-right">Tract Goal</TableHead>
                  <TableHead className="text-right">Tracts</TableHead>
                  <TableHead className="text-right">Door Hangers</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((c) => (
                  <TableRow
                    key={c.id}
                    className="cursor-pointer"
                    onClick={() => navigate(`/fill-america/${c.id}`)}
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') navigate(`/fill-america/${c.id}`)
                    }}
                  >
                    <TableCell className="font-medium">{c.title}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{SEASON_LABELS[c.season]}</Badge>
                    </TableCell>
                    <TableCell className="text-center tabular-nums">{c.weekCount}</TableCell>
                    <TableCell className="text-center tabular-nums">{c.householdCount}</TableCell>
                    <TableCell className="text-right tabular-nums" style={heatParticipants(c.uniqueParticipants)}>
                      {c.uniqueParticipants.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-right tabular-nums">
                      {c.doorHangerGoal ? c.doorHangerGoal.toLocaleString() : '—'}
                    </TableCell>
                    {/* Muted and unshaded like Hanger Goal: these are targets,
                        not results, so they stay out of the heatmap that
                        compares campaigns to each other. */}
                    <TableCell className="text-muted-foreground text-right tabular-nums">
                      {c.rosterGoal ? c.rosterGoal.toLocaleString() : '—'}
                    </TableCell>
                    <TableCell className="text-right tabular-nums" style={heatTracts(c.tracts)}>
                      {c.tracts.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right tabular-nums" style={heatHangers(c.doorHangers)}>
                      {c.doorHangers.toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="text-muted-foreground py-8 text-center">
                      {q ? 'No campaigns match that search.' : 'No campaigns yet. Create one to get started.'}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <NewCampaignDialog
        open={open}
        onClose={() => setOpen(false)}
        onCreated={(id) => navigate(`/fill-america/${id}`)}
      />
    </div>
  )
}

function NewCampaignDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  onCreated: (id: number) => void
}) {
  const qc = useQueryClient()
  const [startDate, setStartDate] = useState(() => nearestSaturday(todayIso()))
  // Three weeks is what every campaign has been; the end date stays editable
  // and the week count follows it.
  const [endDate, setEndDate] = useState(() => addDaysIso(nearestSaturday(todayIso()), 14))
  const [season, setSeason] = useState<Season>(() => defaultSeason(nearestSaturday(todayIso())))
  const [title, setTitle] = useState('')
  const [seasonTouched, setSeasonTouched] = useState(false)
  const [titleTouched, setTitleTouched] = useState(false)
  const [goal, setGoal] = useState('')

  const valid = startDate && endDate && endDate >= startDate
  const weeks = valid ? campaignWeekDates(startDate, endDate) : []
  const derivedTitle = valid ? defaultTitle(startDate, endDate) : ''

  function changeRange(nextStart: string, nextEnd: string) {
    setStartDate(nextStart)
    setEndDate(nextEnd)
    if (!seasonTouched && nextStart) setSeason(defaultSeason(nextStart))
  }

  const create = useMutation({
    mutationFn: () =>
      createCampaign({
        startDate,
        endDate,
        season,
        title: titleTouched && title.trim() ? title.trim() : undefined,
        doorHangerGoal: goal.trim() === '' ? null : Number(goal),
      }),
    onSuccess: (row) => {
      qc.invalidateQueries({queryKey: queryKeys.fillAmericaCampaigns})
      onClose()
      onCreated(row.id)
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed to create campaign'),
  })

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Campaign</DialogTitle>
          <DialogDescription>
            Weeks are derived from the dates. The roster copies forward from the previous campaign.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Dates</Label>
            {/* No presets: none of the standing ranges ("Year to date", "Last 30
                days") describes a campaign, which is a specific fortnight. */}
            <DateRangePicker
              value={{from: startDate, to: endDate}}
              onChange={(r) => changeRange(r.from, r.to)}
              presets={[]}
              className="w-full"
            />
          </div>

          <p className="text-muted-foreground text-sm">
            {valid ? (
              <>
                <span className="text-foreground font-medium">{weeks.length} weeks</span> —{' '}
                {weeks.map((w) => w.slice(5)).join(', ')}
              </>
            ) : (
              'End date must be on or after the start date.'
            )}
          </p>

          <div className="space-y-1.5">
            <Label>Season</Label>
            <Select
              value={season}
              onValueChange={(v) => {
                setSeason(v as Season)
                setSeasonTouched(true)
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SEASONS.map((s) => (
                  <SelectItem key={s} value={s}>
                    {SEASON_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="fa-goal">Door hanger goal</Label>
            <Input
              id="fa-goal"
              inputMode="numeric"
              value={goal}
              placeholder="Optional"
              onChange={(e) => setGoal(e.target.value.replace(/[^\d]/g, ''))}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="fa-title">Title</Label>
            <Input
              id="fa-title"
              value={titleTouched ? title : derivedTitle}
              placeholder={derivedTitle}
              onChange={(e) => {
                setTitle(e.target.value)
                setTitleTouched(true)
              }}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!valid || create.isPending} onClick={() => create.mutate()}>
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
