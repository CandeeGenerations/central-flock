import {ConfirmDialog} from '@/components/confirm-dialog'
import {ReflectionCard} from '@/components/sermons/reflection-card'
import {SocialQuoteCard} from '@/components/sermons/social-quote-card'
import {Badge} from '@/components/ui/badge'
import {Button} from '@/components/ui/button'
import {Card, CardContent} from '@/components/ui/card'
import {DatePicker} from '@/components/ui/date-time-picker'
import {Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle} from '@/components/ui/dialog'
import {Input} from '@/components/ui/input'
import {Label} from '@/components/ui/label'
import {PersonPicker} from '@/components/ui/person-picker'
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select'
import {PageSpinner} from '@/components/ui/spinner'
import {Tabs, TabsContent, TabsList, TabsTrigger} from '@/components/ui/tabs'
import {fetchServiceTimes} from '@/lib/attendance-api'
import {getSermon, regenerateSermon, updateSermon} from '@/lib/sermons-api'
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'
import {ArrowLeft, Pencil, RefreshCw} from 'lucide-react'
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
  const [editOpen, setEditOpen] = useState(false)
  const [form, setForm] = useState<{
    serviceTimeId: number | null
    sermonDate: string
    speakerPersonId: number | null
    title: string
    series: string
  }>({serviceTimeId: null, sermonDate: '', speakerPersonId: null, title: '', series: ''})

  const {data: sermon, isLoading} = useQuery({
    queryKey: ['sermons', 'detail', sermonId],
    queryFn: () => getSermon(sermonId),
    enabled: Number.isFinite(sermonId),
  })

  const {data: serviceTimes} = useQuery({
    queryKey: ['service-times'],
    queryFn: () => fetchServiceTimes(),
    enabled: editOpen,
  })

  const editMutation = useMutation({
    mutationFn: () =>
      updateSermon(sermonId, {
        serviceTimeId: form.serviceTimeId ?? undefined,
        sermonDate: form.sermonDate || undefined,
        speakerPersonId: form.speakerPersonId ?? undefined,
        title: form.title,
        series: form.series,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({queryKey: ['sermons']})
      toast.success('Sermon updated')
      setEditOpen(false)
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Update failed'),
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
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => {
              setForm({
                serviceTimeId: sermon.serviceTimeId,
                sermonDate: sermon.sermonDate,
                speakerPersonId: sermon.speakerPersonId,
                title: sermon.title ?? '',
                series: sermon.series ?? '',
              })
              setEditOpen(true)
            }}
          >
            <Pencil className="h-4 w-4 mr-1" /> Edit
          </Button>
          <Button variant="outline" onClick={() => setConfirmRegenerate(true)} disabled={regenerateMutation.isPending}>
            <RefreshCw className="h-4 w-4 mr-1" />
            {regenerateMutation.isPending ? 'Regenerating…' : 'Regenerate'}
          </Button>
        </div>
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

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit sermon</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Service</Label>
              <Select
                value={form.serviceTimeId ? String(form.serviceTimeId) : undefined}
                onValueChange={(v) => setForm((f) => ({...f, serviceTimeId: Number(v)}))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select service…" />
                </SelectTrigger>
                <SelectContent>
                  {(serviceTimes ?? []).map((st) => (
                    <SelectItem key={st.id} value={String(st.id)}>
                      {st.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Date preached</Label>
              <DatePicker value={form.sermonDate} onChange={(v) => setForm((f) => ({...f, sermonDate: v}))} />
            </div>
            <div className="space-y-2">
              <Label>Speaker</Label>
              <PersonPicker
                value={form.speakerPersonId}
                onChange={(id) => setForm((f) => ({...f, speakerPersonId: id}))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-series">Series</Label>
              <Input
                id="edit-series"
                value={form.series}
                onChange={(e) => setForm((f) => ({...f, series: e.target.value}))}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="edit-title">Title</Label>
              <Input
                id="edit-title"
                value={form.title}
                onChange={(e) => setForm((f) => ({...f, title: e.target.value}))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => editMutation.mutate()} disabled={editMutation.isPending}>
              {editMutation.isPending ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
