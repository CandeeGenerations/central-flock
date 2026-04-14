import {ConfirmDialog} from '@/components/confirm-dialog'
import {Badge} from '@/components/ui/badge'
import {Button} from '@/components/ui/button'
import {Card, CardContent} from '@/components/ui/card'
import {Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle} from '@/components/ui/dialog'
import {Label} from '@/components/ui/label'
import {Pagination} from '@/components/ui/pagination'
import {SearchInput} from '@/components/ui/search-input'
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select'
import {PageSpinner} from '@/components/ui/spinner'
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from '@/components/ui/table'
import {useDebouncedValue} from '@/hooks/use-debounced-value'
import type {NurserySchedule} from '@/lib/nursery-api'
import {deleteNurserySchedule, fetchNurserySchedules, generateNurserySchedule} from '@/lib/nursery-api'
import {nurseryKeys} from '@/lib/nursery-query-keys'
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'
import {Plus, Trash2} from 'lucide-react'
import {useMemo, useState} from 'react'
import {useNavigate} from 'react-router-dom'
import {toast} from 'sonner'

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

const PAGE_SIZE = 25

function getDefaultMonth(): {month: number; year: number} {
  const now = new Date()
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  return {month: next.getMonth() + 1, year: next.getFullYear()}
}

export function NurserySchedulesPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [deleteTarget, setDeleteTarget] = useState<NurserySchedule | null>(null)
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search, 250)
  const [page, setPage] = useState(1)
  const [generateOpen, setGenerateOpen] = useState(false)

  const defaults = getDefaultMonth()
  const [selectedMonth, setSelectedMonth] = useState(String(defaults.month))
  const [selectedYear, setSelectedYear] = useState(String(defaults.year))

  const {data: schedules, isLoading} = useQuery({queryKey: nurseryKeys.schedules, queryFn: fetchNurserySchedules})

  const filtered = useMemo(() => {
    if (!schedules) return []
    if (!debouncedSearch) return schedules
    const q = debouncedSearch.toLowerCase()
    return schedules.filter((s) => {
      const label = `${MONTH_NAMES[s.month - 1]} ${s.year}`.toLowerCase()
      return label.includes(q) || s.status.toLowerCase().includes(q)
    })
  }, [schedules, debouncedSearch])

  const paginated = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE
    return filtered.slice(start, start + PAGE_SIZE)
  }, [filtered, page])

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteNurserySchedule(id),
    onSuccess: () => {
      queryClient.invalidateQueries({queryKey: nurseryKeys.schedules})
      setDeleteTarget(null)
      toast.success('Schedule deleted')
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Failed to delete'),
  })

  const generateMutation = useMutation({
    mutationFn: () => generateNurserySchedule(Number(selectedMonth), Number(selectedYear)),
    onSuccess: (data) => {
      queryClient.invalidateQueries({queryKey: nurseryKeys.schedules})
      setGenerateOpen(false)
      toast.success('Schedule generated')
      navigate(`/nursery/${data.id}`)
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Failed to generate'),
  })

  const currentYear = new Date().getFullYear()
  const currentMonth = new Date().getMonth() + 1

  if (isLoading) return <PageSpinner />

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Nursery Schedules</h2>
        <Button onClick={() => setGenerateOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Generate New
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
                <TableHead>Month</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="w-16" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginated.map((schedule) => (
                <TableRow
                  key={schedule.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => navigate(`/nursery/${schedule.id}`)}
                >
                  <TableCell className="font-medium">
                    {MONTH_NAMES[schedule.month - 1]} {schedule.year}
                  </TableCell>
                  <TableCell>
                    <Badge variant={schedule.status === 'final' ? 'default' : 'secondary'}>
                      {schedule.status === 'final' ? 'Final' : 'Draft'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(schedule.createdAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => {
                        e.stopPropagation()
                        setDeleteTarget(schedule)
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {paginated.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                    {debouncedSearch
                      ? 'No schedules match your search.'
                      : 'No schedules yet. Generate one to get started.'}
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

      {/* Generate Schedule Dialog */}
      <Dialog open={generateOpen} onOpenChange={setGenerateOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Generate Schedule</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Month</Label>
              <Select
                value={selectedMonth}
                onValueChange={(v) => {
                  setSelectedMonth(v)
                  // If selecting a past month for this year, bump to next year
                  if (Number(selectedYear) === currentYear && Number(v) < currentMonth) {
                    setSelectedYear(String(currentYear + 1))
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MONTH_NAMES.map((name, i) => {
                    const monthNum = i + 1
                    const disabled = Number(selectedYear) === currentYear && monthNum < currentMonth
                    return (
                      <SelectItem key={monthNum} value={String(monthNum)} disabled={disabled}>
                        {name}
                      </SelectItem>
                    )
                  })}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Year</Label>
              <Select
                value={selectedYear}
                onValueChange={(v) => {
                  setSelectedYear(v)
                  // If switching to current year and month is in the past, bump month forward
                  if (Number(v) === currentYear && Number(selectedMonth) < currentMonth) {
                    setSelectedMonth(String(currentMonth))
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[currentYear, currentYear + 1].map((y) => (
                    <SelectItem key={y} value={String(y)}>
                      {y}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGenerateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => generateMutation.mutate()} disabled={generateMutation.isPending}>
              {generateMutation.isPending ? 'Generating...' : 'Generate'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(v) => !v && setDeleteTarget(null)}
        title="Delete Schedule"
        description={`Delete the ${deleteTarget ? `${MONTH_NAMES[deleteTarget.month - 1]} ${deleteTarget.year}` : ''} schedule?`}
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
        loading={deleteMutation.isPending}
      />
    </div>
  )
}
