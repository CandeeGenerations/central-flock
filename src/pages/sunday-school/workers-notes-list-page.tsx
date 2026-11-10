import {ConfirmDialog} from '@/components/confirm-dialog'
import {Badge} from '@/components/ui/badge'
import {Button} from '@/components/ui/button'
import {Card, CardContent} from '@/components/ui/card'
import {Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle} from '@/components/ui/dialog'
import {Input} from '@/components/ui/input'
import {Label} from '@/components/ui/label'
import {Pagination} from '@/components/ui/pagination'
import {SearchInput} from '@/components/ui/search-input'
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select'
import {PageSpinner} from '@/components/ui/spinner'
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from '@/components/ui/table'
import {useDebouncedValue} from '@/hooks/use-debounced-value'
import {
  type WorkersNotesEditionSummary,
  createWorkersNotesEdition,
  deleteWorkersNotesEdition,
  fetchWorkersNotesEditions,
  workersNotesKeys,
} from '@/lib/workers-notes-api'
import {type WorkersNotesTerm, termLabel, termRangeLabel} from '@/lib/workers-notes-core'
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'
import {Plus, Trash2} from 'lucide-react'
import {useState} from 'react'
import {useNavigate, useSearchParams} from 'react-router-dom'
import {toast} from 'sonner'

const PAGE_SIZE = 25

const TERM_OPTIONS: {value: WorkersNotesTerm; label: string}[] = [
  {value: 1, label: 'January – April'},
  {value: 2, label: 'May – August'},
  {value: 3, label: 'September – December'},
]

export function WorkersNotesListPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [openManual, setOpenManual] = useState(false)
  const [params, setParams] = useSearchParams()
  // The command palette lands here with ?new=1; derived so the dialog opens on the first render.
  const wantsNew = params.get('new') === '1'
  const open = openManual || wantsNew
  const setOpen = (next: boolean) => {
    setOpenManual(next)
    if (!next && wantsNew)
      setParams(
        (p) => {
          p.delete('new')
          return p
        },
        {replace: true},
      )
  }
  const currentYear = new Date().getFullYear()
  const [year, setYear] = useState(String(currentYear))
  const [term, setTerm] = useState<string>('1')
  const [startOverride, setStartOverride] = useState('')
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search, 250)
  const [page, setPage] = useState(1)
  const [deleteTarget, setDeleteTarget] = useState<WorkersNotesEditionSummary | null>(null)

  const {data: editions, isLoading} = useQuery({
    queryKey: workersNotesKeys.list,
    queryFn: fetchWorkersNotesEditions,
  })

  const create = useMutation({
    mutationFn: createWorkersNotesEdition,
    onSuccess: (row) => {
      queryClient.invalidateQueries({queryKey: workersNotesKeys.all})
      setOpen(false)
      navigate(`/schedules/sunday-school/${row.id}`)
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed to create edition'),
  })

  const remove = useMutation({
    mutationFn: (id: number) => deleteWorkersNotesEdition(id),
    onSuccess: () => {
      queryClient.invalidateQueries({queryKey: workersNotesKeys.all})
      setDeleteTarget(null)
      toast.success('Edition deleted')
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed to delete'),
  })

  if (isLoading) return <PageSpinner />

  const q = debouncedSearch.trim().toLowerCase()
  const filtered = (editions ?? []).filter(
    (e) =>
      !q ||
      e.scopeLabel.toLowerCase().includes(q) ||
      termRangeLabel(e.year, e.term as WorkersNotesTerm)
        .toLowerCase()
        .includes(q),
  )

  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-2xl font-bold">Sunday School</h2>
        <Button onClick={() => setOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          New Edition
        </Button>
      </div>

      <p className="text-muted-foreground max-w-2xl text-sm">
        Four-Month Workers&rsquo; Notes — two printed pages per term covering the year&rsquo;s theme, the monthly songs
        and mottos, and the Betty Lukens lesson schedule.
      </p>

      <Card size="sm">
        <CardContent>
          <SearchInput
            placeholder="Search by term or months..."
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
                <TableHead>Term</TableHead>
                <TableHead className="hidden sm:table-cell">Months</TableHead>
                <TableHead>Lessons</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-16" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginated.map((e) => (
                <TableRow
                  key={e.id}
                  className="hover:bg-muted/50 cursor-pointer"
                  onClick={() => navigate(`/schedules/sunday-school/${e.id}`)}
                >
                  <TableCell className="font-medium">{termRangeLabel(e.year, e.term as WorkersNotesTerm)}</TableCell>
                  <TableCell className="text-muted-foreground hidden sm:table-cell">{e.scopeLabel}</TableCell>
                  <TableCell className="text-muted-foreground">from #{e.startingLessonNumber}</TableCell>
                  <TableCell>
                    <Badge variant={e.status === 'final' ? 'default' : 'secondary'}>
                      {e.status === 'final' ? 'Final' : 'Draft'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Delete edition"
                      onClick={(ev) => {
                        ev.stopPropagation()
                        setDeleteTarget(e)
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
                    {editions?.length
                      ? 'No editions match your search.'
                      : 'No editions yet. Click "New Edition" to create one.'}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        <CardContent>
          <Pagination page={page} pageSize={PAGE_SIZE} total={filtered.length} onPageChange={setPage} noun="editions" />
        </CardContent>
      </Card>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(v) => !v && setDeleteTarget(null)}
        title="Delete Edition"
        description={`Delete the ${deleteTarget ? termRangeLabel(deleteTarget.year, deleteTarget.term as WorkersNotesTerm) : ''} edition? This cannot be undone.`}
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={() => deleteTarget && remove.mutate(deleteTarget.id)}
        loading={remove.isPending}
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Edition</DialogTitle>
            <DialogDescription>
              Seeds the bullets from the previous edition, one lesson row per Sunday, and continues the lesson numbering
              automatically.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Year</Label>
                <Input value={year} onChange={(e) => setYear(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Term</Label>
                <Select value={term} onValueChange={setTerm}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TERM_OPTIONS.map((t) => (
                      <SelectItem key={t.value} value={String(t.value)}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <p className="text-muted-foreground text-xs">
              Will cover {termLabel(Number(year) || currentYear, Number(term) as WorkersNotesTerm)}.
            </p>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Starting lesson number</Label>
              <p className="text-muted-foreground text-xs">
                Leave blank to continue from the previous edition. Required only for the very first one.
              </p>
              <Input
                value={startOverride}
                onChange={(e) => setStartOverride(e.target.value)}
                placeholder="auto"
                className="w-32"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={create.isPending}
              onClick={() =>
                create.mutate({
                  year: Number(year),
                  term: Number(term),
                  ...(startOverride.trim() ? {startingLessonNumber: Number(startOverride)} : {}),
                })
              }
            >
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
