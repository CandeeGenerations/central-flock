import {HymnResultView} from '@/components/hymn-result-view'
import {Button} from '@/components/ui/button'
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card'
import {Input} from '@/components/ui/input'
import {Label} from '@/components/ui/label'
import {Textarea} from '@/components/ui/textarea'
import {usePersistedState} from '@/hooks/use-persisted-state'
import {type HymnSuggestionResult, type HymnalFilter, listHymnSearches, runHymnSuggestion} from '@/lib/hymns-api'
import {cn} from '@/lib/utils'
import {useMutation, useQuery} from '@tanstack/react-query'
import {Sparkles} from 'lucide-react'
import {useState} from 'react'
import {Link} from 'react-router-dom'
import {toast} from 'sonner'

const FILTER_OPTIONS: Array<{value: HymnalFilter; label: string}> = [
  {value: 'both', label: 'Both'},
  {value: 'burgundy', label: 'Burgundy'},
  {value: 'silver', label: 'Silver'},
]

export function HymnsPrepPage() {
  const [title, setTitle] = usePersistedState('hymns.prep.title', '')
  const [scriptureText, setScriptureText] = usePersistedState('hymns.prep.scripture', '')
  const [theme, setTheme] = usePersistedState('hymns.prep.theme', '')
  const [audience, setAudience] = usePersistedState('hymns.prep.audience', '')
  const [hymnalFilter, setHymnalFilter] = usePersistedState<HymnalFilter>('hymns.prep.filter', 'both')
  const [result, setResult] = useState<HymnSuggestionResult | null>(null)

  const {data: recentSearches} = useQuery({
    queryKey: ['hymns', 'searches', 'recent'],
    queryFn: () => listHymnSearches({pageSize: 8}),
  })

  const mutation = useMutation({
    mutationFn: () => runHymnSuggestion({title, scriptureText, theme, audience, hymnalFilter}),
    onSuccess: (data) => setResult(data),
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Suggestion failed'),
  })

  const canSubmit = title.trim() && scriptureText.trim() && theme.trim() && audience.trim() && !mutation.isPending

  const submit = () => {
    if (!canSubmit) return
    setResult(null)
    mutation.mutate()
  }

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-3xl">
      <h2 className="text-2xl font-bold">Suggest a new song service</h2>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Sermon Details</CardTitle>
          <p className="text-xs text-muted-foreground">
            Fill in what you'd tell a worship leader. The more specific the theme, the better the picks.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label htmlFor="sermon-title">Title</Label>
            <Input
              id="sermon-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. God Is Light"
              disabled={mutation.isPending}
            />
          </div>

          <div>
            <Label htmlFor="sermon-text">Text</Label>
            <Input
              id="sermon-text"
              value={scriptureText}
              onChange={(e) => setScriptureText(e.target.value)}
              placeholder="e.g. 1 John 1:5; Ephesians 5:8"
              disabled={mutation.isPending}
            />
          </div>

          <div>
            <Label htmlFor="sermon-theme">Theme</Label>
            <Textarea
              id="sermon-theme"
              value={theme}
              onChange={(e) => setTheme(e.target.value)}
              placeholder="e.g. God is light, in Him is no darkness, we should be lights shining Jesus to others…"
              rows={3}
              disabled={mutation.isPending}
            />
          </div>

          <div>
            <Label htmlFor="sermon-audience">Audience</Label>
            <Input
              id="sermon-audience"
              value={audience}
              onChange={(e) => setAudience(e.target.value)}
              placeholder="e.g. mostly saved"
              disabled={mutation.isPending}
            />
          </div>

          <div>
            <Label>Hymnal</Label>
            <div className="flex gap-2 mt-1">
              {FILTER_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setHymnalFilter(opt.value)}
                  disabled={mutation.isPending}
                  className={cn(
                    'px-3 py-1.5 rounded-md border text-sm transition-colors',
                    hymnalFilter === opt.value
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background hover:bg-muted border-border',
                    mutation.isPending && 'opacity-50 cursor-not-allowed',
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="pt-1">
            <Button onClick={submit} disabled={!canSubmit} className="w-full sm:w-auto">
              <Sparkles className="h-4 w-4 mr-1" />
              {mutation.isPending ? 'Building song service…' : 'Suggest Song Service'}
            </Button>
          </div>

          {recentSearches && recentSearches.searches.length > 0 && (
            <div className="pt-2 flex flex-wrap gap-2 items-center">
              <span className="text-xs text-muted-foreground">Recent:</span>
              {recentSearches.searches.map((s) => (
                <Link
                  key={s.id}
                  to={`/music/hymns/searches/${s.id}`}
                  className="text-xs px-2 py-1 rounded-full border border-border hover:bg-muted transition-colors"
                >
                  {s.title}
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {mutation.isPending && (
        <Card>
          <CardContent className="pt-4 space-y-3">
            <div className="h-4 bg-muted animate-pulse rounded w-3/4" />
            <div className="h-4 bg-muted animate-pulse rounded w-1/2" />
            <div className="h-4 bg-muted animate-pulse rounded w-5/6" />
            <p className="text-sm text-muted-foreground text-center pt-2">Asking Claude to build a song service…</p>
          </CardContent>
        </Card>
      )}

      {result && !mutation.isPending && (
        <>
          <Card>
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground">
                Generated in {(result.durationMs / 1000).toFixed(1)}s from {result.candidateCount} hymns ·{' '}
                <Link to={`/music/hymns/searches/${result.searchId}`} className="underline">
                  view saved search
                </Link>
              </p>
            </CardContent>
          </Card>
          <HymnResultView sections={result.sections} />
        </>
      )}
    </div>
  )
}
