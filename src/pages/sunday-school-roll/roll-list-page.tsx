import {ConfirmDialog} from '@/components/confirm-dialog'
import {Badge} from '@/components/ui/badge'
import {Button} from '@/components/ui/button'
import {Card, CardContent} from '@/components/ui/card'
import {Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle} from '@/components/ui/dialog'
import {Label} from '@/components/ui/label'
import {Pagination} from '@/components/ui/pagination'
import {SearchInput} from '@/components/ui/search-input'
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select'
import {PageSpinner} from '@/components/ui/spinner'
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from '@/components/ui/table'
import {useDebouncedValue} from '@/hooks/use-debounced-value'
import {
  type SundaySchoolRollSummary,
  createSundaySchoolRoll,
  deleteSundaySchoolRoll,
  fetchSundaySchoolRolls,
  sundaySchoolRollKeys,
} from '@/lib/sunday-school-roll-api'
import {
  QUARTERS,
  type Quarter,
  quarterOrdinal,
  quarterRangeLabel,
  quarterTitleLabel,
} from '@/lib/sunday-school-roll-core'
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'
import {Plus, Trash2} from 'lucide-react'
import {useState} from 'react'
import {useNavigate, useSearchParams} from 'react-router-dom'
import {toast} from 'sonner'

const PAGE_SIZE = 25

export function RollListPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [manualOpen, setManualOpen] = useState(false)
  const currentYear = new Date().getFullYear()
  const [year, setYear] = useState(String(currentYear))
  const [quarter, setQuarter] = useState('1')
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search, 250)
  const [page, setPage] = useState(1)
  const [deleteTarget, setDeleteTarget] = useState<SundaySchoolRollSummary | null>(null)
  const [params, setParams] = useSearchParams()

  // The command palette's "New Sunday School Roll" lands here with ?new=1.
  // Derived rather than pushed into state by an effect, so arriving with the
  // param opens the dialog on the first render.
  const wantsNew = params.get('new') === '1'
  const open = manualOpen || wantsNew
  const setOpen = (next: boolean) => {
    setManualOpen(next)
    if (!next && wantsNew) setParams({}, {replace: true})
  }

  const {data: rolls, isLoading} = useQuery({
    queryKey: sundaySchoolRollKeys.list,
    queryFn: fetchSundaySchoolRolls,
  })

  const create = useMutation({
    mutationFn: createSundaySchoolRoll,
    onSuccess: (row) => {
      queryClient.invalidateQueries({queryKey: sundaySchoolRollKeys.all})
      setOpen(false)
      navigate(`/schedules/sunday-school-rolls/${row.id}`)
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed to create roll'),
  })

  const remove = useMutation({
    mutationFn: (id: number) => deleteSundaySchoolRoll(id),
    onSuccess: () => {
      queryClient.invalidateQueries({queryKey: sundaySchoolRollKeys.all})
      setDeleteTarget(null)
      toast.success('Roll deleted')
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed to delete'),
  })

  if (isLoading) return <PageSpinner />

  const latest = (rolls ?? [])[0] ?? null
  const q = debouncedSearch.trim().toLowerCase()
  const filtered = (rolls ?? []).filter(
    (r) =>
      !q ||
      r.scopeLabel.toLowerCase().includes(q) ||
      quarterRangeLabel(r.year, r.quarter as Quarter)
        .toLowerCase()
        .includes(q),
  )

  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-2xl font-bold">Sunday School Roll</h2>
        <Button onClick={() => setOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          New Roll
        </Button>
      </div>

      <p className="text-muted-foreground max-w-2xl text-sm">
        One quarter&rsquo;s blank attendance grids for the whole Sunday School &mdash; one landscape sheet per class,
        every Sunday in the quarter across the top. Prints as a single PDF.
      </p>

      <Card size="sm">
        <CardContent>
          <SearchInput
            placeholder="Search by quarter or months..."
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
                <TableHead>Quarter</TableHead>
                <TableHead className="hidden sm:table-cell">Months</TableHead>
                <TableHead>Sheets</TableHead>
                <TableHead>Names</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-16" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginated.map((r) => (
                <TableRow
                  key={r.id}
                  className="hover:bg-muted/50 cursor-pointer"
                  onClick={() => navigate(`/schedules/sunday-school-rolls/${r.id}`)}
                >
                  <TableCell className="font-medium">{quarterTitleLabel(r.year, r.quarter as Quarter)}</TableCell>
                  <TableCell className="text-muted-foreground hidden sm:table-cell">
                    {quarterRangeLabel(r.year, r.quarter as Quarter)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{r.sheetCount}</TableCell>
                  <TableCell className="text-muted-foreground">{r.scholarCount}</TableCell>
                  <TableCell>
                    <Badge variant={r.status === 'final' ? 'default' : 'secondary'}>
                      {r.status === 'final' ? 'Final' : 'Draft'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Delete roll"
                      onClick={(e) => {
                        e.stopPropagation()
                        setDeleteTarget(r)
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
                    {rolls?.length ? 'No rolls match your search.' : 'No rolls yet. Click "New Roll" to create one.'}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        <CardContent>
          <Pagination page={page} pageSize={PAGE_SIZE} total={filtered.length} onPageChange={setPage} noun="rolls" />
        </CardContent>
      </Card>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(v) => !v && setDeleteTarget(null)}
        title="Delete Roll"
        description={`Delete the ${deleteTarget ? quarterTitleLabel(deleteTarget.year, deleteTarget.quarter as Quarter) : ''} roll? This cannot be undone.`}
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={() => deleteTarget && remove.mutate(deleteTarget.id)}
        loading={remove.isPending}
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Sunday School Roll</DialogTitle>
            <DialogDescription>
              {latest
                ? `Copies ${quarterTitleLabel(latest.year, latest.quarter as Quarter)} — ${latest.sheetCount} sheets, ${latest.scholarCount} names. Dates are set to the Sundays in the quarter you pick.`
                : 'No earlier roll to copy, so this one starts with the five standard classes and no names.'}
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Year</Label>
              <Select value={year} onValueChange={setYear}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[currentYear - 1, currentYear, currentYear + 1].map((y) => (
                    <SelectItem key={y} value={String(y)}>
                      {y}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Quarter</Label>
              <Select value={quarter} onValueChange={setQuarter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {QUARTERS.map((qq) => (
                    <SelectItem key={qq} value={String(qq)}>
                      {quarterOrdinal(qq)} — {quarterRangeLabel(Number(year), qq).replace(` ${year}`, '')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={create.isPending}
              onClick={() => create.mutate({year: Number(year), quarter: Number(quarter)})}
            >
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
