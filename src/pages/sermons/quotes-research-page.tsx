import {Badge} from '@/components/ui/badge'
import {Button} from '@/components/ui/button'
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card'
import {Input} from '@/components/ui/input'
import {type ResearchResult, listSearches, runResearch} from '@/lib/quotes-api'
import {useMutation, useQuery} from '@tanstack/react-query'
import {ArrowRight} from 'lucide-react'
import {useState} from 'react'
import {Link} from 'react-router-dom'
import {toast} from 'sonner'

const EXAMPLE_TOPICS = ['God is Light', 'power of Christ', 'suffering and hope']

function RelevanceBadge({relevance}: {relevance: string}) {
  const variant = relevance === 'high' ? 'default' : relevance === 'medium' ? 'secondary' : ('outline' as const)
  return (
    <Badge variant={variant} className="text-xs capitalize">
      {relevance}
    </Badge>
  )
}

function ResultCard({result}: {result: ResearchResult['results'][number]}) {
  const {quote, note, relevance} = result
  return (
    <Card>
      <CardContent className="pt-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="font-medium">{quote.title}</p>
            <p className="text-sm text-muted-foreground">
              {quote.author}
              {quote.dateDisplay && <span className="ml-1">· {quote.dateDisplay}</span>}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <RelevanceBadge relevance={relevance} />
            <Link
              to={`/sermons/quotes/${quote.id}`}
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-0.5"
            >
              view <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        </div>
        <p className="text-sm">
          <span className="font-medium">Why: </span>
          {note}
        </p>
        <p className="text-sm text-muted-foreground">{quote.summary}</p>
        <blockquote className="border-l-4 border-border pl-3 whitespace-pre-wrap text-sm font-serif leading-relaxed">
          {quote.quoteText}
        </blockquote>
        {quote.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {quote.tags.map((tag) => (
              <Badge key={tag} variant="secondary" className="text-xs">
                {tag}
              </Badge>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export function QuotesResearchPage() {
  const [topic, setTopic] = useState('')
  const [result, setResult] = useState<ResearchResult | null>(null)

  const {data: recentSearches} = useQuery({
    queryKey: ['quotes', 'searches', 'recent'],
    queryFn: () => listSearches({pageSize: 8}),
  })

  const mutation = useMutation({
    mutationFn: (t: string) => runResearch(t),
    onSuccess: (data) => setResult(data),
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Research failed'),
  })

  const submit = (t?: string) => {
    const q = (t ?? topic).trim()
    if (!q) return
    setTopic(q)
    setResult(null)
    mutation.mutate(q)
  }

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-3xl">
      <h2 className="text-2xl font-bold">New Quote Research</h2>

      {/* Topic input */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex gap-2">
            <Input
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="Enter a sermon topic…"
              onKeyDown={(e) => e.key === 'Enter' && submit()}
              disabled={mutation.isPending}
              className="flex-1"
            />
            <Button onClick={() => submit()} disabled={mutation.isPending || !topic.trim()}>
              {mutation.isPending ? 'Researching…' : 'Go'}
            </Button>
          </div>

          {/* Recent searches pills */}
          {recentSearches && recentSearches.searches.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2 items-center">
              <span className="text-xs text-muted-foreground">Recent:</span>
              {recentSearches.searches.map((s) => (
                <button
                  key={s.id}
                  onClick={() => submit(s.topic)}
                  className="text-xs px-2 py-1 rounded-full border border-border hover:bg-muted transition-colors"
                >
                  {s.topic}
                </button>
              ))}
            </div>
          )}

          {/* Empty state example chips */}
          {!result && !mutation.isPending && !recentSearches?.searches.length && (
            <div className="mt-3 flex flex-wrap gap-2 items-center">
              <span className="text-xs text-muted-foreground">Try:</span>
              {EXAMPLE_TOPICS.map((t) => (
                <button
                  key={t}
                  onClick={() => submit(t)}
                  className="text-xs px-2 py-1 rounded-full border border-border hover:bg-muted transition-colors"
                >
                  {t}
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Loading skeleton */}
      {mutation.isPending && (
        <Card>
          <CardContent className="pt-4 space-y-3">
            <div className="h-4 bg-muted animate-pulse rounded w-3/4" />
            <div className="h-4 bg-muted animate-pulse rounded w-1/2" />
            <div className="h-4 bg-muted animate-pulse rounded w-5/6" />
            <p className="text-sm text-muted-foreground text-center pt-2">Researching…</p>
          </CardContent>
        </Card>
      )}

      {/* Results */}
      {result && !mutation.isPending && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">AI Synthesis</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm leading-relaxed">{result.synthesis}</p>
              <p className="text-xs text-muted-foreground mt-2">
                {result.results.length} quotes from {result.candidateCount} candidates ·{' '}
                <Link to={`/sermons/searches/${result.searchId}`} className="underline">
                  view saved search
                </Link>
              </p>
            </CardContent>
          </Card>

          <div className="space-y-3">
            {result.results.map((r) => (
              <ResultCard key={r.quoteId} result={r} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
