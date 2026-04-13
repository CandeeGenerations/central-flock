import {ConfirmDialog} from '@/components/confirm-dialog'
import {Badge} from '@/components/ui/badge'
import {Button} from '@/components/ui/button'
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card'
import {Input} from '@/components/ui/input'
import {Label} from '@/components/ui/label'
import {PageSpinner} from '@/components/ui/spinner'
import {Textarea} from '@/components/ui/textarea'
import {type PoolPassage, deletePoolPassage, fetchPool, youtubeSearchUrl} from '@/lib/devotion-api'
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'
import {ArrowLeft, ExternalLink, Save, Trash2} from 'lucide-react'
import {useState} from 'react'
import {Link, useNavigate, useParams} from 'react-router-dom'
import {toast} from 'sonner'

const TYPE_COLORS: Record<string, string> = {
  original: '#ef4444',
  favorite: '#a855f7',
  guest: '#3b82f6',
  revisit: '#22c55e',
}

const TYPE_LABELS: Record<string, string> = {
  original: 'Original',
  favorite: 'Favorite',
  guest: 'Guest',
  revisit: 'Revisit',
}

interface ScriptureMatch {
  reference: string
  count: number
  devotions: {
    id: number
    number: number
    date: string
    devotionType: string
    guestSpeaker: string | null
    bibleReference: string
  }[]
}

interface PassageForm {
  title: string
  bibleReference: string
  talkingPoints: string
}

function fetchScriptureLookup(search: string) {
  return fetch(`/api/devotions/scriptures/lookup?search=${encodeURIComponent(search)}`, {credentials: 'include'}).then(
    (r) => r.json(),
  ) as Promise<ScriptureMatch[]>
}

async function updatePoolPassage(id: number, data: PassageForm): Promise<PoolPassage> {
  const res = await fetch(`/api/devotions/pool/${id}`, {
    method: 'PUT',
    credentials: 'include',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(data),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `Request failed: ${res.status}`)
  }
  return res.json()
}

export function DevotionPassageDetailPage() {
  const {id} = useParams<{id: string}>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)

  const [form, setForm] = useState<PassageForm>({title: '', bibleReference: '', talkingPoints: ''})
  const [loadedPassageId, setLoadedPassageId] = useState<number | null>(null)

  // Fetch all pool passages and find the one we need
  const {data: passages, isLoading} = useQuery({
    queryKey: ['passages-pool', 'all'],
    queryFn: () => fetchPool(),
  })

  const passage = passages?.find((p) => p.id === Number(id))

  if (passage && loadedPassageId !== passage.id) {
    setLoadedPassageId(passage.id)
    setForm({
      title: passage.title,
      bibleReference: passage.bibleReference,
      talkingPoints: passage.talkingPoints,
    })
  }

  // Scripture lookup for this passage's reference
  const {data: scriptureMatches} = useQuery({
    queryKey: ['scripture-lookup', passage?.bibleReference],
    queryFn: () => fetchScriptureLookup(passage!.bibleReference),
    enabled: !!passage?.bibleReference && passage.bibleReference.length >= 2,
  })

  const saveMutation = useMutation({
    mutationFn: () => updatePoolPassage(Number(id), form),
    onSuccess: () => {
      queryClient.invalidateQueries({queryKey: ['passages-pool']})
      toast.success('Passage updated')
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const deleteMutation = useMutation({
    mutationFn: () => deletePoolPassage(Number(id)),
    onSuccess: () => {
      queryClient.invalidateQueries({queryKey: ['passages-pool']})
      navigate('/devotions/passages')
      toast.success('Passage deleted')
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const update = (patch: Partial<PassageForm>) => setForm((f) => ({...f, ...patch}))

  if (isLoading) return <PageSpinner />
  if (!passage) return <div className="p-6">Passage not found</div>

  // Flatten all matching devotions from scripture lookup
  const matchingDevotions = scriptureMatches?.flatMap((m) => m.devotions) ?? []

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-2xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/devotions/passages')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h2 className="text-2xl font-bold">Passage</h2>
        {passage.used ? <Badge variant="secondary">Used</Badge> : <Badge variant="default">Available</Badge>}
        {matchingDevotions.length > 0 && (
          <Badge variant={matchingDevotions.length > 2 ? 'destructive' : 'secondary'}>
            {matchingDevotions.length}x in devotions
          </Badge>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Title</Label>
            <Input value={form.title} onChange={(e) => update({title: e.target.value})} placeholder="Passage title" />
          </div>
          <div>
            <Label>Bible Reference</Label>
            <Input
              value={form.bibleReference}
              onChange={(e) => update({bibleReference: e.target.value})}
              placeholder="e.g. John 3:16"
            />
            {form.bibleReference && (
              <a
                href={`https://www.biblegateway.com/passage/?search=${encodeURIComponent(form.bibleReference)}&version=AKJV`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary hover:underline mt-1 inline-block"
              >
                Open in BibleGateway
              </a>
            )}
          </div>
          <div>
            <Label>Talking Points</Label>
            <Textarea
              value={form.talkingPoints}
              onChange={(e) => update({talkingPoints: e.target.value})}
              rows={6}
              placeholder="Key phrases for the devotion"
            />
          </div>

          {passage.devotionId && (
            <div className="text-sm text-muted-foreground">
              Assigned to devotion{' '}
              <Link to={`/devotions/${passage.devotionId}`} className="text-primary hover:underline">
                #{passage.devotionId}
              </Link>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Scripture Usage */}
      {matchingDevotions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Scripture Usage</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-3">
              This reference has been used in {matchingDevotions.length} devotion
              {matchingDevotions.length !== 1 ? 's' : ''}:
            </p>
            <div className="space-y-2">
              {matchingDevotions.map((d) => (
                <div key={d.id} className="flex items-center gap-3 py-2 border-b last:border-0">
                  <Link to={`/devotions/${d.id}`} className="text-primary hover:underline font-medium">
                    #{String(d.number).padStart(3, '0')}
                  </Link>
                  <span className="text-sm text-muted-foreground">{formatDate(d.date)}</span>
                  <Badge
                    variant="outline"
                    className="text-xs"
                    style={{borderColor: TYPE_COLORS[d.devotionType], color: TYPE_COLORS[d.devotionType]}}
                  >
                    {TYPE_LABELS[d.devotionType] || d.devotionType}
                    {d.guestSpeaker ? ` - ${d.guestSpeaker}` : ''}
                  </Badge>
                  <span className="text-xs text-muted-foreground truncate flex-1">{d.bibleReference}</span>
                  <a
                    href={youtubeSearchUrl(d.number)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-muted-foreground hover:text-foreground shrink-0"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Actions */}
      <div className="flex items-center justify-end gap-2">
        {!passage.used && (
          <Button variant="destructive" size="sm" onClick={() => setDeleteConfirmOpen(true)}>
            <Trash2 className="h-4 w-4 mr-1.5" />
            Delete
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={() => navigate('/devotions/passages')}>
          <ArrowLeft className="h-4 w-4 mr-1.5" />
          Back
        </Button>
        <Button size="sm" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
          <Save className="h-4 w-4 mr-1.5" />
          {saveMutation.isPending ? 'Saving...' : 'Save'}
        </Button>
      </div>

      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title="Delete this passage?"
        description="This action cannot be undone."
        confirmLabel="Delete"
        variant="destructive"
        loading={deleteMutation.isPending}
        onConfirm={() => deleteMutation.mutate()}
      />
    </div>
  )
}

function formatDate(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {month: 'short', day: 'numeric', year: 'numeric'})
}
