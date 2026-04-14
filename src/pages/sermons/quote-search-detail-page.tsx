import {ConfirmDialog} from '@/components/confirm-dialog'
import {Badge} from '@/components/ui/badge'
import {Button} from '@/components/ui/button'
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card'
import {PageSpinner} from '@/components/ui/spinner'
import {deleteSearch, getSearch, runResearch} from '@/lib/quotes-api'
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'
import {ArrowLeft, ArrowRight, RefreshCw, Trash2} from 'lucide-react'
import {useState} from 'react'
import {useNavigate, useParams} from 'react-router-dom'
import {Link} from 'react-router-dom'
import {toast} from 'sonner'

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', {month: 'short', day: 'numeric', year: 'numeric'})
}

function RelevanceBadge({relevance}: {relevance: string}) {
  const variant = relevance === 'high' ? 'default' : relevance === 'medium' ? 'secondary' : ('outline' as const)
  return (
    <Badge variant={variant} className="text-xs capitalize">
      {relevance}
    </Badge>
  )
}

export function QuoteSearchDetailPage() {
  const {id} = useParams<{id: string}>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [deleteOpen, setDeleteOpen] = useState(false)

  const {data, isLoading} = useQuery({
    queryKey: ['quotes', 'search', Number(id)],
    queryFn: () => getSearch(Number(id)),
    enabled: !!id,
  })

  const rerunMutation = useMutation({
    mutationFn: (topic: string) => runResearch(topic),
    onSuccess: (result) => {
      toast.success('New search saved')
      navigate(`/sermons/searches/${result.searchId}`)
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Research failed'),
  })

  const deleteMutation = useMutation({
    mutationFn: () => deleteSearch(Number(id)),
    onSuccess: () => {
      queryClient.invalidateQueries({queryKey: ['quotes', 'searches']})
      toast.success('Search deleted')
      navigate('/sermons/searches')
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Delete failed'),
  })

  if (isLoading) return <PageSpinner />
  if (!data) return <div className="p-6 text-muted-foreground">Search not found.</div>

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-3xl">
      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" size="sm" onClick={() => navigate('/sermons/searches')}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setDeleteOpen(true)}>
          <Trash2 className="h-4 w-4 mr-1 text-destructive" /> Delete
        </Button>
      </div>

      {/* Banner */}
      <div className="text-sm text-muted-foreground px-1">
        Saved search from {fmtDate(data.createdAt)} · model: {data.model}
      </div>

      {/* Synthesis */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Topic: {data.topic}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm leading-relaxed">{data.synthesis}</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => rerunMutation.mutate(data.topic)}
            disabled={rerunMutation.isPending}
          >
            <RefreshCw className="h-3.5 w-3.5 mr-1" />
            {rerunMutation.isPending ? 'Running…' : 'Re-run this search'}
          </Button>
        </CardContent>
      </Card>

      {/* Results */}
      <div className="space-y-3">
        {data.results.map((r) =>
          r.quote ? (
            <Card key={r.quoteId}>
              <CardContent className="pt-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{r.quote.title}</p>
                    <p className="text-sm text-muted-foreground">
                      {r.quote.author}
                      {r.quote.dateDisplay && <span className="ml-1">· {r.quote.dateDisplay}</span>}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <RelevanceBadge relevance={r.relevance} />
                    <Link
                      to={`/sermons/quotes/${r.quoteId}`}
                      className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-0.5"
                    >
                      view <ArrowRight className="h-3 w-3" />
                    </Link>
                  </div>
                </div>
                <p className="text-sm">
                  <span className="font-medium">Why: </span>
                  {r.note}
                </p>
                <p className="text-sm text-muted-foreground">{r.quote.summary}</p>
                <blockquote className="border-l-4 border-border pl-3 whitespace-pre-wrap text-sm font-serif leading-relaxed">
                  {r.quote.quoteText}
                </blockquote>
                {r.quote.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {r.quote.tags.map((tag) => (
                      <Badge key={tag} variant="secondary" className="text-xs">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card key={r.quoteId}>
              <CardContent className="pt-4">
                <p className="text-sm text-muted-foreground">(Quote #{r.quoteId} no longer available)</p>
              </CardContent>
            </Card>
          ),
        )}
      </div>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete search?"
        description={`This will permanently remove the saved search for "${data.topic}".`}
        confirmLabel="Delete"
        variant="destructive"
        loading={deleteMutation.isPending}
        onConfirm={() => deleteMutation.mutate()}
      />
    </div>
  )
}
