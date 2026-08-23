import {Button} from '@/components/ui/button'
import {Card, CardContent} from '@/components/ui/card'
import {DatePicker} from '@/components/ui/date-time-picker'
import {Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle} from '@/components/ui/dialog'
import {Label} from '@/components/ui/label'
import {SearchInput} from '@/components/ui/search-input'
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select'
import {PageSpinner} from '@/components/ui/spinner'
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from '@/components/ui/table'
import {createMusicWeek, fetchMusicWeekYears, fetchMusicWeeks, musicScheduleKeys} from '@/lib/music-schedule-api'
import {addDays, toIso, weekLabel, weekStartFor} from '@/lib/music-schedule-core'
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'
import {ListMusic, Plus} from 'lucide-react'
import {useState} from 'react'
import {useNavigate} from 'react-router-dom'
import {toast} from 'sonner'

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
  const [open, setOpen] = useState(false)
  const [year, setYear] = useState(String(new Date().getFullYear()))
  const [newWeek, setNewWeek] = useState('')
  const [search, setSearch] = useState('')

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

  if (isLoading) return <PageSpinner />

  const q = search.trim().toLowerCase()
  const filtered = (weeks ?? []).filter(
    (w) =>
      !q ||
      w.label.toLowerCase().includes(q) ||
      w.weekStart.includes(q) ||
      `${w.episodeFirst ?? ''} ${w.episodeLast ?? ''}`.includes(q),
  )

  const openDialog = () => {
    setNewWeek(nextFreeSunday(new Set((allWeeks ?? []).map((w) => w.weekStart))))
    setOpen(true)
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="mb-6 flex items-center gap-3">
        <ListMusic className="h-6 w-6" />
        <h2 className="text-2xl font-bold">Music Schedule</h2>
        <Button className="ml-auto" onClick={openDialog}>
          <Plus className="mr-2 h-4 w-4" />
          New Week
        </Button>
      </div>

      <p className="text-muted-foreground max-w-2xl text-sm">
        One week of services — the Sunday and the Wednesday after it. Prints the Sound Booth sheet for the sound team
        and the Sunday and Midweek sheets for the musicians and song leader.
      </p>

      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="min-w-48 flex-1">
              <SearchInput value={search} onChange={setSearch} placeholder="Search by date or episode number..." />
            </div>
            <Select value={year} onValueChange={setYear}>
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
          </div>

          {filtered.length === 0 ? (
            <div className="text-muted-foreground py-8 text-center text-sm">
              {weeks?.length ? 'No weeks match that search.' : 'No weeks yet. Click "New Week" to create one.'}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Week of</TableHead>
                  <TableHead className="hidden sm:table-cell">Services</TableHead>
                  <TableHead className="w-28">Episodes</TableHead>
                  <TableHead className="w-24">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((w) => (
                  <TableRow
                    key={w.id}
                    className="hover:bg-muted/50 cursor-pointer"
                    onClick={() => navigate(`/schedules/music/${w.id}`)}
                  >
                    <TableCell className="font-medium">{w.label.replace('Week of ', '')}</TableCell>
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
                      <span
                        className={
                          w.status === 'final'
                            ? 'rounded bg-green-100 px-2 py-0.5 text-xs text-green-800'
                            : 'bg-muted rounded px-2 py-0.5 text-xs'
                        }
                      >
                        {w.status}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

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
            <DatePicker value={newWeek} onChange={(v) => setNewWeek(weekStartFor(v || today()))} />
            <p className="text-muted-foreground text-xs">
              Any date picks its Sunday. Will cover {weekLabel(newWeek || weekStartFor(today())).toLowerCase()} through
              the Wednesday after it.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button disabled={create.isPending || !newWeek} onClick={() => create.mutate(newWeek)}>
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
