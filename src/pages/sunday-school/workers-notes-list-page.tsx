import {Button} from '@/components/ui/button'
import {Card, CardContent} from '@/components/ui/card'
import {Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle} from '@/components/ui/dialog'
import {Input} from '@/components/ui/input'
import {Label} from '@/components/ui/label'
import {SearchInput} from '@/components/ui/search-input'
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select'
import {PageSpinner} from '@/components/ui/spinner'
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from '@/components/ui/table'
import {createWorkersNotesEdition, fetchWorkersNotesEditions, workersNotesKeys} from '@/lib/workers-notes-api'
import {type WorkersNotesTerm, termLabel, termRangeLabel} from '@/lib/workers-notes-core'
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'
import {GraduationCap, Plus} from 'lucide-react'
import {useState} from 'react'
import {useNavigate} from 'react-router-dom'
import {toast} from 'sonner'

const TERM_OPTIONS: {value: WorkersNotesTerm; label: string}[] = [
  {value: 1, label: 'January – April'},
  {value: 2, label: 'May – August'},
  {value: 3, label: 'September – December'},
]

export function WorkersNotesListPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const currentYear = new Date().getFullYear()
  const [year, setYear] = useState(String(currentYear))
  const [term, setTerm] = useState<string>('1')
  const [startOverride, setStartOverride] = useState('')
  const [search, setSearch] = useState('')

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

  if (isLoading) return <PageSpinner />

  const q = search.trim().toLowerCase()
  const filtered = (editions ?? []).filter(
    (e) =>
      !q ||
      e.scopeLabel.toLowerCase().includes(q) ||
      termRangeLabel(e.year, e.term as WorkersNotesTerm)
        .toLowerCase()
        .includes(q),
  )

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="mb-6 flex items-center gap-3">
        <GraduationCap className="h-6 w-6" />
        <h2 className="text-2xl font-bold">Sunday School</h2>
        <Button className="ml-auto" onClick={() => setOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          New Edition
        </Button>
      </div>

      <p className="text-muted-foreground max-w-2xl text-sm">
        Four-Month Workers&rsquo; Notes — two printed pages per term covering the year&rsquo;s theme, the monthly songs
        and mottos, and the Betty Lukens lesson schedule.
      </p>

      <Card>
        <CardContent className="space-y-3 p-4">
          <SearchInput value={search} onChange={setSearch} placeholder="Search by term or months..." />
          {filtered.length === 0 ? (
            <div className="text-muted-foreground py-8 text-center text-sm">
              {editions?.length
                ? 'No editions match that search.'
                : 'No editions yet. Click "New Edition" to create one.'}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Term</TableHead>
                  <TableHead className="hidden sm:table-cell">Months</TableHead>
                  <TableHead className="w-28">Lessons</TableHead>
                  <TableHead className="w-24">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((e) => (
                  <TableRow
                    key={e.id}
                    className="hover:bg-muted/50 cursor-pointer"
                    onClick={() => navigate(`/schedules/sunday-school/${e.id}`)}
                  >
                    <TableCell className="font-medium">{termRangeLabel(e.year, e.term as WorkersNotesTerm)}</TableCell>
                    <TableCell className="text-muted-foreground hidden sm:table-cell">{e.scopeLabel}</TableCell>
                    <TableCell className="text-muted-foreground">from #{e.startingLessonNumber}</TableCell>
                    <TableCell>
                      <span
                        className={
                          e.status === 'final'
                            ? 'rounded bg-green-100 px-2 py-0.5 text-xs text-green-800'
                            : 'bg-muted rounded px-2 py-0.5 text-xs'
                        }
                      >
                        {e.status}
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
