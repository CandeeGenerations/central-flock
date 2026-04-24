import {AIProgress} from '@/components/ai-progress'
import {Badge} from '@/components/ui/badge'
import {Button} from '@/components/ui/button'
import {Card, CardContent} from '@/components/ui/card'
import {Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle} from '@/components/ui/dialog'
import {Input} from '@/components/ui/input'
import {Label} from '@/components/ui/label'
import {Pagination} from '@/components/ui/pagination'
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select'
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from '@/components/ui/table'
import {useProgressOperation} from '@/hooks/use-sse'
import {type PoolPassage, fetchPool, generatePoolPassages, setPoolPassageRecorded} from '@/lib/devotion-api'
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'
import {Check, Loader2, Sparkles, X} from 'lucide-react'
import {useState} from 'react'
import {useNavigate} from 'react-router-dom'
import {toast} from 'sonner'

type FilterMode = 'all' | 'available' | 'used'
type RecordedFilter = 'all' | 'not-recorded' | 'recorded'

const PAGE_SIZE = 25

export function DevotionPassagesPage() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [count, setCount] = useState(10)
  const [filter, setFilter] = useState<FilterMode>('available')
  const [recordedFilter, setRecordedFilter] = useState<RecordedFilter>('not-recorded')
  const [page, setPage] = useState(1)
  const [generateOpen, setGenerateOpen] = useState(false)

  const usedParam = filter === 'available' ? 'false' : filter === 'used' ? 'true' : undefined

  const {data: allPassages = [], isLoading} = useQuery({
    queryKey: ['passages-pool', filter],
    queryFn: () => fetchPool({used: usedParam}),
  })

  const passages = allPassages.filter((p) => {
    if (recordedFilter === 'recorded') return p.recorded
    if (recordedFilter === 'not-recorded') return !p.recorded
    return true
  })

  const {state: genState, start: startGenerate} = useProgressOperation(
    [
      {message: 'Checking previous passages\u2026', progress: 10},
      {message: 'Generating with Claude\u2026', progress: 25},
      {message: 'Still generating\u2026', progress: 45},
      {message: 'Almost there\u2026', progress: 70},
      {message: 'Processing responses\u2026', progress: 85},
    ],
    3000,
  )

  const handleGenerate = async () => {
    try {
      const data = await startGenerate(() => generatePoolPassages(count))
      queryClient.invalidateQueries({queryKey: ['passages-pool']})
      toast.success(`Generated ${data.generated} passages`)
      setGenerateOpen(false)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Generation failed')
    }
  }

  const availableCount = allPassages.filter((p) => !p.used).length
  const totalCount = passages.length

  const paginatedPassages = passages.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const handleFilterChange = (mode: FilterMode) => {
    setFilter(mode)
    setPage(1)
  }

  const handleRecordedFilterChange = (mode: RecordedFilter) => {
    setRecordedFilter(mode)
    setPage(1)
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Sparkles className="h-6 w-6" />
          <h2 className="text-2xl font-bold">Passages</h2>
          <Badge variant="secondary">{availableCount} available</Badge>
        </div>
        <Button size="sm" onClick={() => setGenerateOpen(true)}>
          <Sparkles className="h-4 w-4 mr-1.5" />
          Generate
        </Button>
      </div>

      <Dialog open={generateOpen} onOpenChange={(open) => !genState.isRunning && setGenerateOpen(open)}>
        <DialogContent showCloseButton={!genState.isRunning}>
          <DialogHeader>
            <DialogTitle>Generate Passages</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Number to generate</Label>
              <Input
                type="number"
                min={1}
                max={20}
                value={count}
                onChange={(e) => setCount(Math.min(20, Math.max(1, Number(e.target.value) || 1)))}
                className="w-28"
                disabled={genState.isRunning}
              />
            </div>
            {genState.isRunning && <AIProgress message={genState.message} progress={genState.progress} />}
          </div>
          <DialogFooter showCloseButton={!genState.isRunning}>
            <Button onClick={handleGenerate} disabled={genState.isRunning}>
              {genState.isRunning ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-1.5" />
                  Generate
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card size="sm">
        <CardContent>
          <div className="flex gap-2">
            <Select value={filter} onValueChange={(v) => handleFilterChange(v as FilterMode)}>
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="available">Available</SelectItem>
                <SelectItem value="used">Used</SelectItem>
              </SelectContent>
            </Select>
            <Select value={recordedFilter} onValueChange={(v) => handleRecordedFilterChange(v as RecordedFilter)}>
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="not-recorded">Not Recorded</SelectItem>
                <SelectItem value="recorded">Recorded</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>

        <div className="border-t">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : passages.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No passages in pool. Generate some above.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead>Subcode</TableHead>
                  <TableHead className="text-center">Recorded</TableHead>
                  <TableHead className="text-center">Used In</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedPassages.map((p) => (
                  <PassageRow key={p.id} passage={p} onClick={() => navigate(`/devotions/passages/${p.id}`)} />
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        {totalCount > 0 && (
          <CardContent>
            <Pagination page={page} pageSize={PAGE_SIZE} total={totalCount} onPageChange={setPage} noun="passages" />
          </CardContent>
        )}
      </Card>
    </div>
  )
}

function PassageRow({passage, onClick}: {passage: PoolPassage; onClick: () => void}) {
  const queryClient = useQueryClient()
  const toggleRecorded = useMutation({
    mutationFn: () => setPoolPassageRecorded(passage.id, !passage.recorded),
    onSuccess: () => queryClient.invalidateQueries({queryKey: ['passages-pool']}),
    onError: (err: Error) => toast.error(err.message),
  })

  return (
    <TableRow className="cursor-pointer hover:bg-muted/50" onClick={onClick}>
      <TableCell className="font-medium max-w-48">{passage.title}</TableCell>
      <TableCell>{passage.bibleReference}</TableCell>
      <TableCell className="font-mono text-xs text-muted-foreground">{passage.subcode || '—'}</TableCell>
      <TableCell className="text-center">
        <div
          className="flex items-center justify-center cursor-pointer h-7 w-7 rounded-lg border border-border hover:bg-muted/50 mx-auto"
          onClick={(e) => {
            e.stopPropagation()
            toggleRecorded.mutate()
          }}
        >
          {passage.recorded ? <Check className="h-4 w-4 text-green-600" /> : <X className="h-4 w-4 text-red-500" />}
        </div>
      </TableCell>
      <TableCell className="text-center">
        {passage.scriptureUsageCount > 0 ? (
          <Badge variant={passage.scriptureUsageCount > 2 ? 'destructive' : 'secondary'}>
            {passage.scriptureUsageCount}
          </Badge>
        ) : (
          <span className="text-muted-foreground">0</span>
        )}
      </TableCell>
      <TableCell>
        {passage.used ? <Badge variant="secondary">Used</Badge> : <Badge variant="default">Available</Badge>}
      </TableCell>
    </TableRow>
  )
}
