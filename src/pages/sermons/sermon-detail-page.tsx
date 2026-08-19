import {ConfirmDialog} from '@/components/confirm-dialog'
import {ReflectionCard} from '@/components/sermons/reflection-card'
import {SocialQuoteCard} from '@/components/sermons/social-quote-card'
import {Badge} from '@/components/ui/badge'
import {Button} from '@/components/ui/button'
import {Card, CardContent} from '@/components/ui/card'
import {PageSpinner} from '@/components/ui/spinner'
import {Tabs, TabsContent, TabsList, TabsTrigger} from '@/components/ui/tabs'
import {getSermon, regenerateSermon} from '@/lib/sermons-api'
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'
import {ArrowLeft, RefreshCw} from 'lucide-react'
import {useState} from 'react'
import {useNavigate, useParams} from 'react-router-dom'
import {toast} from 'sonner'

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return iso
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

export function SermonDetailPage() {
  const {id} = useParams<{id: string}>()
  const sermonId = Number(id)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [confirmRegenerate, setConfirmRegenerate] = useState(false)

  const {data: sermon, isLoading} = useQuery({
    queryKey: ['sermons', 'detail', sermonId],
    queryFn: () => getSermon(sermonId),
    enabled: Number.isFinite(sermonId),
  })

  const regenerateMutation = useMutation({
    mutationFn: () => regenerateSermon(sermonId),
    onSuccess: (res) => {
      queryClient.invalidateQueries({queryKey: ['sermons']})
      toast.success(res.skippedQuotes > 0 ? `Regenerated — ${res.skippedQuotes} quote(s) skipped` : 'Regenerated')
      setConfirmRegenerate(false)
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Regeneration failed'),
  })

  if (isLoading) return <PageSpinner />
  if (!sermon) return <div className="p-6 text-muted-foreground">Sermon not found.</div>

  const unusedQuotes = sermon.quotes.filter((q) => !q.used).length
  const unusedReflections = sermon.reflections.filter((r) => !r.used).length

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="space-y-1">
          <Button variant="ghost" size="sm" className="-ml-2" onClick={() => navigate('/sermons/social')}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Social Content
          </Button>
          <h2 className="text-2xl font-bold">{sermon.title || fmtDate(sermon.sermonDate)}</h2>
          <p className="text-sm text-muted-foreground">
            {sermon.serviceTimeName} · {fmtDate(sermon.sermonDate)} · {sermon.speaker}
            {sermon.series ? ` · ${sermon.series}` : ''}
          </p>
        </div>
        <Button variant="outline" onClick={() => setConfirmRegenerate(true)} disabled={regenerateMutation.isPending}>
          <RefreshCw className="h-4 w-4 mr-1" />
          {regenerateMutation.isPending ? 'Regenerating…' : 'Regenerate'}
        </Button>
      </div>

      {sermon.bigIdea && (
        <Card size="sm">
          <CardContent className="space-y-1">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Big Idea</p>
            <p className="text-lg leading-snug">{sermon.bigIdea}</p>
          </CardContent>
        </Card>
      )}

      {sermon.scriptures.length > 0 && (
        <Card size="sm">
          <CardContent className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Scriptures preached</p>
            <div className="flex flex-wrap gap-1.5">
              {sermon.scriptures.map((s) => (
                <a
                  key={s.id}
                  href={`https://www.biblegateway.com/passage/?search=${encodeURIComponent(s.reference)}&version=AKJV`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <Badge variant="outline" className="text-xs hover:bg-muted">
                    {s.reference}
                  </Badge>
                </a>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="quotes">
        <TabsList>
          <TabsTrigger value="quotes">
            Quotes ({unusedQuotes}/{sermon.quotes.length})
          </TabsTrigger>
          <TabsTrigger value="reflections">
            Posts ({unusedReflections}/{sermon.reflections.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="quotes" className="space-y-3 pt-3">
          {sermon.quotes.length === 0 ? (
            <p className="py-12 text-center text-muted-foreground">No quotes were generated for this sermon.</p>
          ) : (
            sermon.quotes.map((q) => <SocialQuoteCard key={q.id} sermonId={sermonId} quote={q} />)
          )}
        </TabsContent>

        <TabsContent value="reflections" className="space-y-3 pt-3">
          {sermon.reflections.length === 0 ? (
            <p className="py-12 text-center text-muted-foreground">No posts were generated for this sermon.</p>
          ) : (
            sermon.reflections.map((r) => <ReflectionCard key={r.id} sermonId={sermonId} reflection={r} />)
          )}
        </TabsContent>
      </Tabs>

      <ConfirmDialog
        open={confirmRegenerate}
        onOpenChange={setConfirmRegenerate}
        title="Regenerate from this transcript?"
        description="Every quote and post below is deleted and generated again — including your edits and what you've marked used."
        confirmLabel="Regenerate"
        variant="destructive"
        loading={regenerateMutation.isPending}
        onConfirm={() => regenerateMutation.mutate()}
      />
    </div>
  )
}
