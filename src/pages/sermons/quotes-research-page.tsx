import {LyricResultView} from '@/components/sermons/lyric-result-view'
import {Badge} from '@/components/ui/badge'
import {Button} from '@/components/ui/button'
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card'
import {Checkbox} from '@/components/ui/checkbox'
import {Input} from '@/components/ui/input'
import {Label} from '@/components/ui/label'
import {Tabs, TabsContent, TabsList, TabsTrigger} from '@/components/ui/tabs'
import {type MusicResult, type ResearchResult, runMusicSearch, runResearch} from '@/lib/quotes-api'
import {useMutation} from '@tanstack/react-query'
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
  const [includeQuotes, setIncludeQuotes] = useState(true)
  const [includeMusic, setIncludeMusic] = useState(true)
  const [result, setResult] = useState<ResearchResult | null>(null)
  const [musicResults, setMusicResults] = useState<MusicResult[] | null>(null)
  const [tab, setTab] = useState<'quotes' | 'lyrics'>('quotes')

  const musicMutation = useMutation({
    mutationFn: (searchId: number) => runMusicSearch(searchId),
    onSuccess: (data) => {
      setMusicResults(data.musicResults)
      const n = data.musicResults.length
      if (n === 0) toast('Music search found nothing')
      else {
        const unverified = data.musicResults.filter((r) => !r.verified).length
        toast.success(
          unverified > 0 ? `Lyrics ready — ${n} songs (${unverified} unverified)` : `Lyrics ready — ${n} songs`,
        )
      }
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Music search failed'),
  })

  const mutation = useMutation({
    mutationFn: (t: string) => runResearch(t, {includeQuotes, includeMusic}),
    onSuccess: (data) => {
      setResult(data)
      setTab(includeQuotes ? 'quotes' : 'lyrics')
      if (includeMusic) musicMutation.mutate(data.searchId)
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Research failed'),
  })

  const submit = (t?: string) => {
    const q = (t ?? topic).trim()
    if (!q || (!includeQuotes && !includeMusic)) return
    setTopic(q)
    setResult(null)
    setMusicResults(null)
    mutation.mutate(q)
  }

  const searchId = result?.searchId
  const musicPending = musicMutation.isPending

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-3xl">
      <h2 className="text-2xl font-bold">New Quote Research</h2>

      {/* Topic input + source toggles */}
      <Card>
        <CardContent className="pt-4 space-y-3">
          <div className="flex gap-2">
            <Input
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="Enter a sermon topic…"
              onKeyDown={(e) => e.key === 'Enter' && submit()}
              disabled={mutation.isPending}
              className="flex-1"
            />
            <Button
              onClick={() => submit()}
              disabled={mutation.isPending || !topic.trim() || (!includeQuotes && !includeMusic)}
            >
              {mutation.isPending ? 'Researching…' : 'Go'}
            </Button>
          </div>

          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <Checkbox
                id="toggle-quotes"
                checked={includeQuotes}
                onCheckedChange={(v) => setIncludeQuotes(v === true)}
                disabled={mutation.isPending}
              />
              <Label htmlFor="toggle-quotes" className="text-sm">
                Search quotes
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="toggle-music"
                checked={includeMusic}
                onCheckedChange={(v) => setIncludeMusic(v === true)}
                disabled={mutation.isPending}
              />
              <Label htmlFor="toggle-music" className="text-sm">
                Search music (lyrics)
              </Label>
            </div>
          </div>

          {/* Empty state example chips */}
          {!result && !mutation.isPending && (
            <div className="flex flex-wrap gap-2 items-center">
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

      {/* Loading skeleton (quote phase) */}
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
        <Tabs value={tab} onValueChange={(v) => setTab(v as 'quotes' | 'lyrics')}>
          <TabsList>
            <TabsTrigger value="quotes">Quotes ({result.results.length})</TabsTrigger>
            <TabsTrigger value="lyrics">Lyrics{musicResults ? ` (${musicResults.length})` : ''}</TabsTrigger>
          </TabsList>

          <TabsContent value="quotes" className="space-y-3">
            {result.synthesis ? (
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
                {result.results.map((r) => (
                  <ResultCard key={r.quoteId} result={r} />
                ))}
              </>
            ) : (
              <p className="text-sm text-muted-foreground p-2">Quotes were not searched for this topic.</p>
            )}
          </TabsContent>

          <TabsContent value="lyrics" className="space-y-3">
            {musicPending ? (
              <Card>
                <CardContent className="pt-4 space-y-3">
                  <div className="h-4 bg-muted animate-pulse rounded w-3/4" />
                  <div className="h-4 bg-muted animate-pulse rounded w-2/3" />
                  <p className="text-sm text-muted-foreground text-center pt-2">Searching music…</p>
                </CardContent>
              </Card>
            ) : musicResults ? (
              <LyricResultView results={musicResults} />
            ) : (
              <div className="p-2 space-y-2">
                <p className="text-sm text-muted-foreground">No music searched for this topic.</p>
                {searchId && (
                  <Button variant="outline" size="sm" onClick={() => musicMutation.mutate(searchId)}>
                    Search music for this topic
                  </Button>
                )}
              </div>
            )}
          </TabsContent>
        </Tabs>
      )}
    </div>
  )
}
