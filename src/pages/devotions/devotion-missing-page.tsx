import {Button} from '@/components/ui/button'
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card'
import {DatePicker} from '@/components/ui/date-time-picker'
import {Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle} from '@/components/ui/dialog'
import {Input} from '@/components/ui/input'
import {Label} from '@/components/ui/label'
import {Spinner} from '@/components/ui/spinner'
import {Textarea} from '@/components/ui/textarea'
import {analyzeBibleVerses, createDevotion} from '@/lib/devotion-api'
import {useMutation} from '@tanstack/react-query'
import {BookOpen, Plus, Video} from 'lucide-react'
import {useState} from 'react'
import {useNavigate, useSearchParams} from 'react-router-dom'
import {toast} from 'sonner'

export function DevotionMissingPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()

  const [url, setUrl] = useState('')
  const [analysis, setAnalysis] = useState('')

  const [date, setDate] = useState(params.get('date') ?? '')
  const [number, setNumber] = useState(params.get('number') ?? '')
  const [bibleReference, setBibleReference] = useState('')
  const [songName, setSongName] = useState('')

  const [analyzeError, setAnalyzeError] = useState<{
    message: string
    status?: number
    statusText?: string
    contentType?: string
    stack?: string
    bodyText?: string
  } | null>(null)

  const analyzeMutation = useMutation({
    mutationFn: (u: string) => analyzeBibleVerses(u),
    onSuccess: (data) => {
      setAnalysis(data.result)
      toast.success(`Analyzed ${data.transcriptSegments} transcript segments`)
    },
    onError: (err) => {
      const e = err as Error & {
        status?: number
        statusText?: string
        contentType?: string
        bodyText?: string
      }
      setAnalyzeError({
        message: e?.message ?? 'Failed to analyze',
        status: e?.status,
        statusText: e?.statusText,
        contentType: e?.contentType,
        stack: e?.stack,
        bodyText: e?.bodyText,
      })
    },
  })

  const createMutation = useMutation({
    mutationFn: () =>
      createDevotion({
        date,
        number: parseInt(number, 10),
        devotionType: 'original',
        bibleReference: bibleReference.trim(),
        songName: songName.trim() || null,
        produced: true,
        rendered: true,
        youtube: true,
        facebookInstagram: true,
        podcast: true,
      }),
    onSuccess: (d) => {
      toast.success(`Devotion #${d.number} created`)
      navigate(`/devotions/${d.id}`)
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to create devotion'),
  })

  const canSubmit = date.trim() !== '' && number.trim() !== '' && bibleReference.trim() !== ''

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-5 max-w-3xl">
      <div>
        <h2 className="text-2xl font-bold">Add Missing Devotion</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Analyze a YouTube video for Bible references, then quickly add the devotion.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Video className="h-5 w-5 text-red-500" />
            Find Bible References
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="yt-url">YouTube URL or video ID</Label>
            <div className="flex gap-2">
              <Input
                id="yt-url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://youtube.com/watch?v=… or video ID"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && url.trim()) analyzeMutation.mutate(url.trim())
                }}
              />
              <Button
                onClick={() => analyzeMutation.mutate(url.trim())}
                disabled={!url.trim() || analyzeMutation.isPending}
              >
                {analyzeMutation.isPending ? <Spinner className="h-4 w-4" /> : 'Analyze'}
              </Button>
            </div>
          </div>

          {analysis && (
            <div className="space-y-2">
              <Label>References found</Label>
              <pre className="whitespace-pre-wrap rounded-md border bg-muted/50 p-3 text-sm font-sans">{analysis}</pre>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5" />
            Add Devotion
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="devo-date">Date</Label>
              <DatePicker value={date} onChange={setDate} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="devo-number">Number</Label>
              <Input
                id="devo-number"
                type="number"
                value={number}
                onChange={(e) => setNumber(e.target.value)}
                placeholder="e.g. 1234"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="devo-ref">Bible Reference</Label>
            <Input
              id="devo-ref"
              value={bibleReference}
              onChange={(e) => setBibleReference(e.target.value)}
              placeholder='e.g. "John 3:16"'
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="devo-song">Song Name (optional)</Label>
            <Input
              id="devo-song"
              value={songName}
              onChange={(e) => setSongName(e.target.value)}
              placeholder="e.g. Amazing Grace"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="devo-notes">Analysis notes (not saved)</Label>
            <Textarea
              id="devo-notes"
              value={analysis}
              onChange={(e) => setAnalysis(e.target.value)}
              rows={4}
              placeholder="Scratch space — e.g. paste references from above to pick one"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => navigate('/devotions/audit')}>
              Cancel
            </Button>
            <Button onClick={() => createMutation.mutate()} disabled={!canSubmit || createMutation.isPending}>
              {createMutation.isPending ? <Spinner className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              Add Devotion
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={analyzeError !== null} onOpenChange={(open) => !open && setAnalyzeError(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              Analysis failed
              {analyzeError?.status
                ? ` (${analyzeError.status}${analyzeError.statusText ? ` ${analyzeError.statusText}` : ''})`
                : ''}
            </DialogTitle>
            <DialogDescription>The video analysis request failed. Full error details below.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 max-h-[60vh] overflow-auto">
            <div className="space-y-1">
              <Label>Message</Label>
              <pre className="whitespace-pre-wrap rounded-md border bg-muted/50 p-3 text-sm font-mono">
                {analyzeError?.message}
              </pre>
            </div>
            {analyzeError?.contentType && (
              <div className="space-y-1">
                <Label>Content-Type</Label>
                <pre className="whitespace-pre-wrap rounded-md border bg-muted/50 p-3 text-xs font-mono">
                  {analyzeError.contentType}
                </pre>
              </div>
            )}
            <div className="space-y-1">
              <Label>
                Response body {analyzeError?.bodyText ? `(${analyzeError.bodyText.length} chars)` : '(empty)'}
              </Label>
              <pre className="whitespace-pre-wrap rounded-md border bg-muted/50 p-3 text-xs font-mono">
                {analyzeError?.bodyText ? analyzeError.bodyText : '(no response body)'}
              </pre>
            </div>
            {analyzeError?.stack && (
              <div className="space-y-1">
                <Label>Stack</Label>
                <pre className="whitespace-pre-wrap rounded-md border bg-muted/50 p-3 text-xs font-mono">
                  {analyzeError.stack}
                </pre>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                const text = [
                  `Status: ${analyzeError?.status ?? 'unknown'} ${analyzeError?.statusText ?? ''}`.trim(),
                  `Content-Type: ${analyzeError?.contentType ?? '(none)'}`,
                  `Message: ${analyzeError?.message}`,
                  `Body: ${analyzeError?.bodyText || '(empty)'}`,
                  analyzeError?.stack ? `Stack: ${analyzeError.stack}` : '',
                ]
                  .filter(Boolean)
                  .join('\n\n')
                navigator.clipboard.writeText(text)
                toast.success('Error copied to clipboard')
              }}
            >
              Copy
            </Button>
            <Button onClick={() => setAnalyzeError(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
