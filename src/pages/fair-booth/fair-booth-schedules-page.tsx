import {ConfirmDialog} from '@/components/confirm-dialog'
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
import {formatDate} from '@/lib/date'
import {
  type FairBoothScheduleListRow,
  createFairBoothSchedule,
  deleteFairBoothSchedule,
  fetchFairBoothSchedules,
  schedulesKeys,
} from '@/lib/schedules-api'
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'
import {Plus, Trash2} from 'lucide-react'
import {useMemo, useState} from 'react'
import {useNavigate} from 'react-router-dom'
import {toast} from 'sonner'

const PAGE_SIZE = 25

function nextFridayIso(): string {
  const d = new Date()
  const dow = d.getDay()
  // Friday = 5; if today is Friday, use today, else next Friday.
  const delta = (5 - dow + 7) % 7
  d.setDate(d.getDate() + delta)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function isFriday(iso: string): boolean {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).getDay() === 5
}

export function FairBoothSchedulesPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [deleteTarget, setDeleteTarget] = useState<FairBoothScheduleListRow | null>(null)
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search, 250)
  const [page, setPage] = useState(1)
  const [createOpen, setCreateOpen] = useState(false)
  const [scopeStart, setScopeStart] = useState(nextFridayIso())
  const [scopeLabel, setScopeLabel] = useState('')

  const {data: schedules, isLoading} = useQuery({
    queryKey: schedulesKeys.fairBoothList,
    queryFn: fetchFairBoothSchedules,
  })

  const filtered = useMemo(() => {
    if (!schedules) return []
    if (!debouncedSearch) return schedules
    const q = debouncedSearch.toLowerCase()
    return schedules.filter((s) => s.scopeLabel.toLowerCase().includes(q))
  }, [schedules, debouncedSearch])

  const paginated = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE
    return filtered.slice(start, start + PAGE_SIZE)
  }, [filtered, page])

  const createMutation = useMutation({
    mutationFn: () => createFairBoothSchedule({scopeStart, scopeLabel: scopeLabel.trim() || undefined}),
    onSuccess: (row) => {
      queryClient.invalidateQueries({queryKey: schedulesKeys.fairBoothList})
      setCreateOpen(false)
      setScopeLabel('')
      navigate(`/schedules/fair-booth/${row.id}`)
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed to create'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteFairBoothSchedule(id),
    onSuccess: () => {
      queryClient.invalidateQueries({queryKey: schedulesKeys.fairBoothList})
      setDeleteTarget(null)
      toast.success('Schedule deleted')
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed to delete'),
  })

  if (isLoading) return <PageSpinner />

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Fair Booth Schedules</h2>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-1" /> New Schedule
        </Button>
      </div>

      <Card>
        <CardContent className="p-4 space-y-3">
          <SearchInput value={search} onChange={setSearch} placeholder="Search by scope label..." />
          {filtered.length === 0 ? (
            <div className="text-muted-foreground text-sm py-8 text-center">
              No fair booth schedules yet. Click "New Schedule" to create one.
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Scope</TableHead>
                    <TableHead>Signups</TableHead>
                    <TableHead>Updated</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginated.map((s) => (
                    <TableRow
                      key={s.id}
                      onClick={() => navigate(`/schedules/fair-booth/${s.id}`)}
                      className="cursor-pointer"
                    >
                      <TableCell className="font-medium">{s.scopeLabel}</TableCell>
                      <TableCell>{s.signupCount}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">{formatDate(s.updatedAt)}</TableCell>
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
                </TableBody>
              </Table>
              <Pagination page={page} pageSize={PAGE_SIZE} total={filtered.length} onPageChange={setPage} />
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Fair Booth Schedule</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Starting Friday</Label>
              <DatePicker value={scopeStart} onChange={(v) => setScopeStart(v || nextFridayIso())} />
              {!isFriday(scopeStart) && (
                <p className="text-destructive text-xs mt-1">Must be a Friday — fair runs Fri to next Sat.</p>
              )}
            </div>
            <div>
              <Label>Scope label (optional)</Label>
              <Input
                value={scopeLabel}
                onChange={(e) => setScopeLabel(e.target.value)}
                placeholder="Auto: e.g. September 8–16, 2025"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!isFriday(scopeStart) || createMutation.isPending}
              onClick={() => createMutation.mutate()}
            >
              {createMutation.isPending ? 'Creating...' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="Delete schedule?"
        description={`This permanently removes "${deleteTarget?.scopeLabel}" and all its signups.`}
        confirmLabel="Delete"
        variant="destructive"
        loading={deleteMutation.isPending}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
      />
    </div>
  )
}
