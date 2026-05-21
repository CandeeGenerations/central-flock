import {ConfirmDialog} from '@/components/confirm-dialog'
import {Badge} from '@/components/ui/badge'
import {Button} from '@/components/ui/button'
import {Card, CardContent} from '@/components/ui/card'
import {DatePicker} from '@/components/ui/date-time-picker'
import {Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle} from '@/components/ui/dialog'
import {Input} from '@/components/ui/input'
import {Label} from '@/components/ui/label'
import {Pagination} from '@/components/ui/pagination'
import {SearchInput} from '@/components/ui/search-input'
import {PageSpinner} from '@/components/ui/spinner'
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from '@/components/ui/table'
import {useDebouncedValue} from '@/hooks/use-debounced-value'
import {
  type Schedule,
  createSpecialMusicSchedule,
  deleteSchedule,
  fetchSchedules,
  schedulesKeys,
} from '@/lib/schedules-api'
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'
import {Plus, Trash2} from 'lucide-react'
import {useMemo, useState} from 'react'
import {useNavigate} from 'react-router-dom'
import {toast} from 'sonner'

const PAGE_SIZE = 25

function isoToday(): string {
  return new Date().toISOString().slice(0, 10)
}

function threeMonthsOutIso(): string {
  const d = new Date()
  d.setMonth(d.getMonth() + 3)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function autoLabel(start: string, end: string): string {
  const sy = start.slice(0, 4)
  const ey = end.slice(0, 4)
  return sy === ey ? sy : `${sy}–${ey}`
}

export function SpecialMusicSchedulesPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [deleteTarget, setDeleteTarget] = useState<Schedule | null>(null)
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search, 250)
  const [page, setPage] = useState(1)
  const [createOpen, setCreateOpen] = useState(false)

  const [scopeStart, setScopeStart] = useState(isoToday())
  const [scopeEnd, setScopeEnd] = useState(threeMonthsOutIso())
  const [scopeLabel, setScopeLabel] = useState('')

  const {data: schedules, isLoading} = useQuery({
    queryKey: schedulesKeys.list('special_music'),
    queryFn: () => fetchSchedules('special_music'),
  })

  const filtered = useMemo(() => {
    if (!schedules) return []
    if (!debouncedSearch) return schedules
    const q = debouncedSearch.toLowerCase()
    return schedules.filter((s) => s.scopeLabel.toLowerCase().includes(q) || s.status.toLowerCase().includes(q))
  }, [schedules, debouncedSearch])

  const paginated = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE
    return filtered.slice(start, start + PAGE_SIZE)
  }, [filtered, page])

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteSchedule(id),
    onSuccess: () => {
      queryClient.invalidateQueries({queryKey: schedulesKeys.list('special_music')})
      setDeleteTarget(null)
      toast.success('Schedule deleted')
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed to delete'),
  })

  const createMutation = useMutation({
    mutationFn: () =>
      createSpecialMusicSchedule({
        scopeStart,
        scopeEnd,
        scopeLabel: scopeLabel.trim() || autoLabel(scopeStart, scopeEnd),
      }),
    onSuccess: (created) => {
      queryClient.invalidateQueries({queryKey: schedulesKeys.list('special_music')})
      setCreateOpen(false)
      toast.success('Schedule created')
      navigate(`/special-music/${created.id}`)
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed to create'),
  })

  if (isLoading) return <PageSpinner />

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Special Music Schedules</h2>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          New Schedule
        </Button>
      </div>

      <Card size="sm">
        <CardContent>
          <SearchInput
            placeholder="Search schedules..."
            value={search}
            onChange={(v) => {
              setSearch(v)
              setPage(1)
            }}
            onClear={() => setPage(1)}
            containerClassName="sm:max-w-sm"
          />
        </CardContent>
        <div className="overflow-x-auto border-t">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Scope</TableHead>
                <TableHead>Dates</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="w-16" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginated.map((s) => (
                <TableRow
                  key={s.id}
                  className="hover:bg-muted/50 cursor-pointer"
                  onClick={() => navigate(`/special-music/${s.id}`)}
                >
                  <TableCell className="font-medium">{s.scopeLabel}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {s.scopeStart} → {s.scopeEnd}
                  </TableCell>
                  <TableCell>
                    <Badge variant={s.status === 'final' ? 'default' : 'secondary'}>
                      {s.status === 'final' ? 'Final' : 'Draft'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{new Date(s.createdAt).toLocaleDateString()}</TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => {
                        e.stopPropagation()
                        setDeleteTarget(s)
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {paginated.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-muted-foreground py-8 text-center">
                    {debouncedSearch
                      ? 'No schedules match your search.'
                      : 'No schedules yet. Create one to get started.'}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        <CardContent>
          <Pagination
            page={page}
            pageSize={PAGE_SIZE}
            total={filtered.length}
            onPageChange={setPage}
            noun="schedules"
          />
        </CardContent>
      </Card>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>New Special Music Schedule</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>From</Label>
              <DatePicker value={scopeStart} onChange={setScopeStart} />
            </div>
            <div className="space-y-1.5">
              <Label>To</Label>
              <DatePicker value={scopeEnd} onChange={setScopeEnd} />
            </div>
            <div className="space-y-1.5">
              <Label>Label (optional)</Label>
              <Input
                value={scopeLabel}
                onChange={(e) => setScopeLabel(e.target.value)}
                placeholder={autoLabel(scopeStart, scopeEnd)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Creating...' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(v) => !v && setDeleteTarget(null)}
        title="Delete Schedule"
        description={`Delete the ${deleteTarget?.scopeLabel ?? ''} schedule? Special music entries are unaffected.`}
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
        loading={deleteMutation.isPending}
      />
    </div>
  )
}
