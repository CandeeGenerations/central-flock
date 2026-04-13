import {AIProgress} from '@/components/ai-progress'
import {Badge} from '@/components/ui/badge'
import {Button} from '@/components/ui/button'
import {Card, CardContent} from '@/components/ui/card'
import {Input} from '@/components/ui/input'
import {Label} from '@/components/ui/label'
import {Pagination} from '@/components/ui/pagination'
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from '@/components/ui/table'
import {useProgressOperation} from '@/hooks/use-sse'
import {type PoolPassage, fetchPool, generatePoolPassages} from '@/lib/devotion-api'
import {useQuery, useQueryClient} from '@tanstack/react-query'
import {Loader2, Sparkles} from 'lucide-react'
import {useState} from 'react'
import {useNavigate} from 'react-router-dom'
import {toast} from 'sonner'

type FilterMode = 'all' | 'available' | 'used'

const PAGE_SIZE = 25

export function DevotionPassagesPage() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [count, setCount] = useState(10)
  const [filter, setFilter] = useState<FilterMode>('all')
  const [page, setPage] = useState(1)

  const usedParam = filter === 'available' ? 'false' : filter === 'used' ? 'true' : undefined

  const {data: passages = [], isLoading} = useQuery({
    queryKey: ['passages-pool', filter],
    queryFn: () => fetchPool({used: usedParam}),
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
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Generation failed')
    }
  }

  const availableCount = passages.filter((p) => !p.used).length
  const totalCount = passages.length

  const paginatedPassages = passages.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const handleFilterChange = (mode: FilterMode) => {
    setFilter(mode)
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
        <div className="flex items-end gap-2">
          <div>
            <Label className="text-xs">Count</Label>
            <Input
              type="number"
              min={1}
              max={20}
              value={count}
              onChange={(e) => setCount(Math.min(20, Math.max(1, Number(e.target.value) || 1)))}
              className="w-20 h-8"
            />
          </div>
          <Button size="sm" onClick={handleGenerate} disabled={genState.isRunning}>
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
        </div>
      </div>

      {genState.isRunning && <AIProgress message={genState.message} progress={genState.progress} />}

      <Card size="sm">
        <CardContent>
          <div className="flex gap-2">
            {(['all', 'available', 'used'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => handleFilterChange(mode)}
                className={`px-3 py-1 rounded-full text-sm font-medium transition-colors cursor-pointer ${
                  filter === mode
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                }`}
              >
                {mode === 'all'
                  ? `All (${totalCount})`
                  : mode === 'available'
                    ? `Available (${availableCount})`
                    : `Used (${totalCount - availableCount})`}
              </button>
            ))}
          </div>
        </CardContent>

        <div className="overflow-x-auto border-t">
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
  return (
    <TableRow className="cursor-pointer hover:bg-muted/50" onClick={onClick}>
      <TableCell className="font-medium max-w-48">{passage.title}</TableCell>
      <TableCell>{passage.bibleReference}</TableCell>
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
