import {ConfirmDialog} from '@/components/confirm-dialog'
import {HymnResultView} from '@/components/hymn-result-view'
import {Badge} from '@/components/ui/badge'
import {Button} from '@/components/ui/button'
import {Card, CardContent} from '@/components/ui/card'
import {PageSpinner} from '@/components/ui/spinner'
import {type HymnalFilter, deleteHymnSearch, getHymnSearch} from '@/lib/hymns-api'
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'
import {ArrowLeft, Trash2} from 'lucide-react'
import {useState} from 'react'
import {useNavigate, useParams} from 'react-router-dom'
import {toast} from 'sonner'

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', {month: 'short', day: 'numeric', year: 'numeric'})
}

function filterLabel(filter: HymnalFilter): string {
  if (filter === 'both') return 'Both'
  if (filter === 'burgundy') return 'Burgundy'
  return 'Silver'
}

export function HymnSearchDetailPage() {
  const {id} = useParams<{id: string}>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [deleteOpen, setDeleteOpen] = useState(false)

  const {data, isLoading} = useQuery({
    queryKey: ['hymns', 'search', Number(id)],
    queryFn: () => getHymnSearch(Number(id)),
    enabled: !!id,
  })

  const deleteMutation = useMutation({
    mutationFn: () => deleteHymnSearch(Number(id)),
    onSuccess: () => {
      queryClient.invalidateQueries({queryKey: ['hymns', 'searches']})
      toast.success('Search deleted')
      navigate('/music/hymns/searches')
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Delete failed'),
  })

  if (isLoading) return <PageSpinner />
  if (!data) return <div className="p-6 text-muted-foreground">Search not found.</div>

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-3xl">
      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" size="sm" onClick={() => navigate('/music/hymns/searches')}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        <Button variant="destructive" size="sm" onClick={() => setDeleteOpen(true)}>
          <Trash2 className="h-4 w-4 mr-1" /> Delete
        </Button>
      </div>

      <Card>
        <CardContent className="pt-4 space-y-2">
          <h3 className="text-xl font-semibold">{data.title}</h3>
          <dl className="text-sm space-y-1">
            <div>
              <dt className="inline font-medium">Text: </dt>
              <dd className="inline text-muted-foreground">{data.scriptureText}</dd>
            </div>
            <div>
              <dt className="inline font-medium">Theme: </dt>
              <dd className="inline text-muted-foreground">{data.theme}</dd>
            </div>
            <div>
              <dt className="inline font-medium">Audience: </dt>
              <dd className="inline text-muted-foreground">{data.audience}</dd>
            </div>
            <div className="pt-1">
              <Badge variant="outline" className="text-xs">
                Hymnal: {filterLabel(data.hymnalFilter)}
              </Badge>
            </div>
          </dl>
          <div className="pt-3 mt-2 border-t text-xs text-muted-foreground">
            Saved {fmtDate(data.createdAt)} · model: {data.model} · {(data.durationMs / 1000).toFixed(1)}s from{' '}
            {data.candidateCount} hymns
          </div>
        </CardContent>
      </Card>

      <HymnResultView sections={data.sections} />

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete suggestion?"
        description={`This will permanently remove the saved suggestion for "${data.title}".`}
        confirmLabel="Delete"
        variant="destructive"
        loading={deleteMutation.isPending}
        onConfirm={() => deleteMutation.mutate()}
      />
    </div>
  )
}
