import {Button} from '@/components/ui/button'
import {Card, CardContent} from '@/components/ui/card'
import {Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle} from '@/components/ui/dialog'
import {Label} from '@/components/ui/label'
import {SearchInput} from '@/components/ui/search-input'
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select'
import {PageSpinner} from '@/components/ui/spinner'
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from '@/components/ui/table'
import {createSundaySchoolRoll, fetchSundaySchoolRolls, sundaySchoolRollKeys} from '@/lib/sunday-school-roll-api'
import {
  QUARTERS,
  type Quarter,
  quarterOrdinal,
  quarterRangeLabel,
  quarterTitleLabel,
} from '@/lib/sunday-school-roll-core'
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'
import {ClipboardList, Plus} from 'lucide-react'
import {useState} from 'react'
import {useNavigate, useSearchParams} from 'react-router-dom'
import {toast} from 'sonner'

export function RollListPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [manualOpen, setManualOpen] = useState(false)
  const currentYear = new Date().getFullYear()
  const [year, setYear] = useState(String(currentYear))
  const [quarter, setQuarter] = useState('1')
  const [search, setSearch] = useState('')
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

  if (isLoading) return <PageSpinner />

  const latest = (rolls ?? [])[0] ?? null
  const q = search.trim().toLowerCase()
  const filtered = (rolls ?? []).filter(
    (r) =>
      !q ||
      r.scopeLabel.toLowerCase().includes(q) ||
      quarterRangeLabel(r.year, r.quarter as Quarter)
        .toLowerCase()
        .includes(q),
  )

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="mb-6 flex items-center gap-3">
        <ClipboardList className="h-6 w-6" />
        <h2 className="text-2xl font-bold">Sunday School Roll</h2>
        <Button className="ml-auto" onClick={() => setOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          New Roll
        </Button>
      </div>

      <p className="text-muted-foreground max-w-2xl text-sm">
        One quarter&rsquo;s blank attendance grids for the whole Sunday School &mdash; one landscape sheet per class,
        every Sunday in the quarter across the top. Prints as a single PDF.
      </p>

      <Card>
        <CardContent className="space-y-3 p-4">
          <SearchInput value={search} onChange={setSearch} placeholder="Search by quarter or months..." />
          {filtered.length === 0 ? (
            <div className="text-muted-foreground py-8 text-center text-sm">
              {rolls?.length ? 'No rolls match that search.' : 'No rolls yet. Click "New Roll" to create one.'}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Quarter</TableHead>
                  <TableHead className="hidden sm:table-cell">Months</TableHead>
                  <TableHead className="w-24">Sheets</TableHead>
                  <TableHead className="w-24">Names</TableHead>
                  <TableHead className="w-24">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => (
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
                      <span
                        className={
                          r.status === 'final'
                            ? 'rounded bg-green-100 px-2 py-0.5 text-xs text-green-800'
                            : 'bg-muted rounded px-2 py-0.5 text-xs'
                        }
                      >
                        {r.status}
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
