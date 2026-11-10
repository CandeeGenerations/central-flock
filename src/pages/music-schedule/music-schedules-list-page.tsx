import {ConfirmDialog} from '@/components/confirm-dialog'
import {ScanCaptureDialog} from '@/components/music-schedule/scan-capture-dialog'
import {PageHeader} from '@/components/page-header'
import {Badge} from '@/components/ui/badge'
import {Button} from '@/components/ui/button'
import {Card, CardContent} from '@/components/ui/card'
import {DatePicker} from '@/components/ui/date-time-picker'
import {Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle} from '@/components/ui/dialog'
import {Label} from '@/components/ui/label'
import {Pagination} from '@/components/ui/pagination'
import {SearchInput} from '@/components/ui/search-input'
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select'
import {PageSpinner} from '@/components/ui/spinner'
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from '@/components/ui/table'
import {Tooltip, TooltipContent, TooltipTrigger} from '@/components/ui/tooltip'
import {useDebouncedValue} from '@/hooks/use-debounced-value'
import {discardMusicScan, fetchMusicScans, musicScanKeys} from '@/lib/music-scan-api'
import {
  type MusicWeekSummary,
  createMusicWeek,
  deleteMusicWeek,
  fetchMusicWeekYears,
  fetchMusicWeeks,
  musicScheduleKeys,
} from '@/lib/music-schedule-api'
import {addDays, toIso, weekLabel, weekStartFor} from '@/lib/music-schedule-core'
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'
import {AlertTriangle, Camera, Plus, ScanLine, Trash2} from 'lucide-react'
import {useState} from 'react'
import {useNavigate, useSearchParams} from 'react-router-dom'
import {toast} from 'sonner'

const PAGE_SIZE = 25

/** Today's date as YYYY-MM-DD, local. */
function today(): string {
  const d = new Date()
  return toIso(d.getFullYear(), d.getMonth() + 1, d.getDate())
}

/** The first Sunday from this week on that doesn't have a schedule yet. */
function nextFreeSunday(taken: Set<string>): string {
  let sunday = weekStartFor(today())
  for (let i = 0; i < 104 && taken.has(sunday); i += 1) sunday = addDays(sunday, 7)
  return sunday
}

export function MusicSchedulesListPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [openManual, setOpenManual] = useState(false)
  const [year, setYear] = useState(String(new Date().getFullYear()))
  const [newWeek, setNewWeek] = useState('')
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search, 250)
  const [page, setPage] = useState(1)
  const [deleteTarget, setDeleteTarget] = useState<MusicWeekSummary | null>(null)
  const [searchParams, setSearchParams] = useSearchParams()
  // ?scan=1 (the command palette's "from photos" action) opens the capture dialog.
  const [scanOpen, setScanOpenState] = useState(searchParams.get('scan') === '1')
  // ?new=1 (the command palette's "New Music Schedule Week") opens New Week on arrival.
  const wantsNew = searchParams.get('new') === '1'
  const open = openManual || wantsNew
  const setOpen = (next: boolean) => {
    setOpenManual(next)
    if (!next && wantsNew)
      setSearchParams(
        (p) => {
          p.delete('new')
          return p
        },
        {replace: true},
      )
  }
  const setScanOpen = (open: boolean) => {
    setScanOpenState(open)
    if (!open && searchParams.has('scan')) setSearchParams({}, {replace: true})
  }
  const {data: scans} = useQuery({queryKey: musicScanKeys.list, queryFn: fetchMusicScans})
  const discard = useMutation({
    mutationFn: (id: number) => discardMusicScan(id),
    onSuccess: () => queryClient.invalidateQueries({queryKey: musicScanKeys.all}),
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed to discard'),
  })

  const {data: years} = useQuery({queryKey: musicScheduleKeys.years, queryFn: fetchMusicWeekYears})
  const {data: weeks, isLoading} = useQuery({
    queryKey: musicScheduleKeys.list(year === 'all' ? undefined : Number(year)),
    queryFn: () => fetchMusicWeeks(year === 'all' ? undefined : Number(year)),
  })
  const {data: allWeeks} = useQuery({queryKey: musicScheduleKeys.list(), queryFn: () => fetchMusicWeeks()})

  const create = useMutation({
    mutationFn: (weekStart: string) => createMusicWeek(weekStart),
    onSuccess: (created) => {
      queryClient.invalidateQueries({queryKey: musicScheduleKeys.all})
      setOpen(false)
      navigate(`/schedules/music/${created.id}`)
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed to create'),
  })

  const removeWeek = useMutation({
    mutationFn: (id: number) => deleteMusicWeek(id),
    onSuccess: () => {
      queryClient.invalidateQueries({queryKey: musicScheduleKeys.all})
      setDeleteTarget(null)
      toast.success('Week deleted')
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed to delete'),
  })

  if (isLoading) return <PageSpinner />

  const q = debouncedSearch.trim().toLowerCase()
  const filtered = (weeks ?? []).filter(
    (w) =>
      !q ||
      w.label.toLowerCase().includes(q) ||
      w.note.toLowerCase().includes(q) ||
      w.weekStart.includes(q) ||
      `${w.episodeFirst ?? ''} ${w.episodeLast ?? ''}`.includes(q),
  )

  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  // Arriving by link skips openDialog, so fall back to the same default it would have picked.
  const shownWeek = newWeek || (wantsNew && allWeeks ? nextFreeSunday(new Set(allWeeks.map((w) => w.weekStart))) : '')

  const openDialog = () => {
    setNewWeek(nextFreeSunday(new Set((allWeeks ?? []).map((w) => w.weekStart))))
    setOpen(true)
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      <PageHeader
        title="Music Schedule"
        primary={{label: 'New Week', icon: Plus, onClick: openDialog}}
        secondary={[{label: 'From photos', icon: Camera, onClick: () => setScanOpen(true)}]}
      />

      {scans?.length ? (
        <Card>
          <CardContent className="space-y-2 p-4">
            <h3 className="flex items-center gap-2 text-sm font-medium">
              <ScanLine className="h-4 w-4" />
              Unfinished reviews
            </h3>
            {scans.map((sc) => (
              <div key={sc.id} className="flex items-center gap-3 rounded border p-2">
                {sc.photos[0] ? (
                  <img src={sc.photos[0]} alt="" className="h-12 w-9 shrink-0 rounded border object-cover" />
                ) : null}
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{sc.weekStart ? weekLabel(sc.weekStart) : 'Week not read'}</div>
                  <div className="text-muted-foreground text-xs">
                    {sc.summary
                      ? `${sc.summary.resolved} of ${sc.summary.songs} songs found` +
                        (sc.summary.toCheck ? ` · ${sc.summary.toCheck} to check` : '')
                      : 'Not read'}
                  </div>
                </div>
                <Button size="sm" onClick={() => navigate(`/schedules/music/scans/${sc.id}`)}>
                  Review
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Discard review"
                  onClick={() => {
                    if (confirm('Discard this scan? Its photos are deleted.')) discard.mutate(sc.id)
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <p className="text-muted-foreground max-w-2xl text-sm">
        One week of services — the Sunday and the Wednesday after it. Prints the Sound Booth sheet for the sound team
        and the Sunday and Midweek sheets for the musicians and song leader.
      </p>

      <Card size="sm">
        <CardContent className="flex flex-wrap items-center gap-2">
          <SearchInput
            placeholder="Search by date, note or episode number..."
            value={search}
            onChange={(v) => {
              setSearch(v)
              setPage(1)
            }}
            onClear={() => setPage(1)}
            containerClassName="sm:max-w-sm"
          />
          <Select
            value={year}
            onValueChange={(v) => {
              setYear(v)
              setPage(1)
            }}
          >
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All years</SelectItem>
              {(years ?? []).map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
        <div className="overflow-x-auto border-t">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Week of</TableHead>
                <TableHead>Note</TableHead>
                <TableHead className="hidden sm:table-cell">Services</TableHead>
                <TableHead>Episodes</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-16" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginated.map((w) => (
                <TableRow
                  key={w.id}
                  className="hover:bg-muted/50 cursor-pointer"
                  onClick={() => navigate(`/schedules/music/${w.id}`)}
                >
                  <TableCell className="font-medium">
                    <span className="flex items-center gap-1.5">
                      {w.label.replace('Week of ', '')}
                      {w.occasions.map((o) => (
                        <Badge key={o} variant="outline" className="font-normal">
                          {o}
                        </Badge>
                      ))}
                      {w.warningCount ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
                          </TooltipTrigger>
                          <TooltipContent>
                            {w.warningCount} thing{w.warningCount === 1 ? '' : 's'} to look at — open the week to see
                            them
                          </TooltipContent>
                        </Tooltip>
                      ) : null}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground max-w-64 truncate">{w.note || '—'}</TableCell>
                  <TableCell className="text-muted-foreground hidden sm:table-cell">
                    {w.serviceCount} service{w.serviceCount === 1 ? '' : 's'}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {w.episodeFirst == null
                      ? '—'
                      : w.episodeFirst === w.episodeLast
                        ? `#${w.episodeFirst}`
                        : `#${w.episodeFirst}–${w.episodeLast}`}
                  </TableCell>
                  <TableCell>
                    <Badge variant={w.status === 'final' ? 'default' : 'secondary'}>
                      {w.status === 'final' ? 'Final' : 'Draft'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Delete week"
                      onClick={(e) => {
                        e.stopPropagation()
                        setDeleteTarget(w)
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {paginated.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-muted-foreground py-8 text-center">
                    {weeks?.length ? 'No weeks match your search.' : 'No weeks yet. Click "New Week" to create one.'}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        <CardContent>
          <Pagination page={page} pageSize={PAGE_SIZE} total={filtered.length} onPageChange={setPage} noun="weeks" />
        </CardContent>
      </Card>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(v) => !v && setDeleteTarget(null)}
        title="Delete Week"
        description={`Delete the ${deleteTarget?.label ?? ''} schedule? This cannot be undone.`}
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={() => deleteTarget && removeWeek.mutate(deleteTarget.id)}
        loading={removeWeek.isPending}
      />

      <ScanCaptureDialog open={scanOpen} onOpenChange={setScanOpen} />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Week</DialogTitle>
            <DialogDescription>
              Carries last week&rsquo;s lines, roles and Sound Booth wording forward, clears the songs and highlights,
              and assigns the next episode numbers.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Sunday</Label>
            <DatePicker value={shownWeek} onChange={(v) => setNewWeek(weekStartFor(v || today()))} />
            <p className="text-muted-foreground text-xs">
              Any date picks its Sunday. Will cover {weekLabel(shownWeek || weekStartFor(today())).toLowerCase()}{' '}
              through the Wednesday after it.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button disabled={create.isPending || !shownWeek} onClick={() => create.mutate(shownWeek)}>
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
