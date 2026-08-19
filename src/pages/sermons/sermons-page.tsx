import {ConfirmDialog} from '@/components/confirm-dialog'
import {Badge} from '@/components/ui/badge'
import {Button} from '@/components/ui/button'
import {Card, CardContent} from '@/components/ui/card'
import {Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle} from '@/components/ui/dialog'
import {Input} from '@/components/ui/input'
import {Label} from '@/components/ui/label'
import {Pagination} from '@/components/ui/pagination'
import {PersonPicker} from '@/components/ui/person-picker'
import {SearchInput} from '@/components/ui/search-input'
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select'
import {PageSpinner} from '@/components/ui/spinner'
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from '@/components/ui/table'
import {Textarea} from '@/components/ui/textarea'
import {useDebouncedValue} from '@/hooks/use-debounced-value'
import {usePersistedState} from '@/hooks/use-persisted-state'
import {fetchServiceTimes} from '@/lib/attendance-api'
import {type SermonListItem, createSermon, deleteSermon, listSermons} from '@/lib/sermons-api'
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'
import {Plus, Trash2, Upload} from 'lucide-react'
import {useState} from 'react'
import {useNavigate} from 'react-router-dom'
import {toast} from 'sonner'

const PAGE_SIZE = 25

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return iso
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {month: 'short', day: 'numeric', year: 'numeric'})
}

function todayIso(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

export function SermonsPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [search, setSearch] = usePersistedState('sermons.q', '')
  const debouncedSearch = useDebouncedValue(search, 250)
  const [page, setPage] = usePersistedState('sermons.page', 1)
  const [pendingDelete, setPendingDelete] = useState<SermonListItem | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)

  // Remembered between uploads — the same service and speaker week after week.
  const [serviceTimeId, setServiceTimeId] = usePersistedState<number | null>('sermons.new.serviceTimeId', null)
  const [speakerPersonId, setSpeakerPersonId] = usePersistedState<number | null>('sermons.new.speakerPersonId', null)
  const [sermonDate, setSermonDate] = useState(todayIso())
  const [title, setTitle] = useState('')
  const [series, setSeries] = useState('')
  const [transcript, setTranscript] = useState('')

  const {data, isLoading} = useQuery({
    queryKey: ['sermons', 'list', debouncedSearch, page],
    queryFn: () => listSermons({q: debouncedSearch || undefined, page, pageSize: PAGE_SIZE}),
  })

  const {data: serviceTimes} = useQuery({queryKey: ['service-times'], queryFn: () => fetchServiceTimes()})

  const createMutation = useMutation({
    mutationFn: () =>
      createSermon({
        serviceTimeId: serviceTimeId as number,
        sermonDate,
        speakerPersonId: speakerPersonId as number,
        title: title.trim() || undefined,
        series: series.trim() || undefined,
        transcript,
      }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({queryKey: ['sermons']})
      if (res.skippedQuotes > 0) {
        toast.success(`Sermon added — ${res.skippedQuotes} quote(s) skipped as unverifiable`)
      } else {
        toast.success('Sermon added')
      }
      setDialogOpen(false)
      setTranscript('')
      setTitle('')
      navigate(`/sermons/social/${res.id}`)
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Generation failed'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteSermon(id),
    onSuccess: () => {
      queryClient.invalidateQueries({queryKey: ['sermons']})
      toast.success('Sermon deleted')
      setPendingDelete(null)
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Delete failed'),
  })

  function handleFile(file: File | undefined) {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => setTranscript(String(reader.result ?? ''))
    reader.onerror = () => toast.error('Could not read that file')
    reader.readAsText(file)
  }

  const canSubmit = serviceTimeId != null && speakerPersonId != null && sermonDate && transcript.trim().length > 0

  if (isLoading && !data) return <PageSpinner />

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-2xl font-bold">
          Social Content
          {data ? <span className="ml-2 text-base font-normal text-muted-foreground">({data.total})</span> : null}
        </h2>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-1" /> New Sermon
        </Button>
      </div>

      <Card size="sm">
        <CardContent>
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Filter by title…"
            containerClassName="w-56"
            onClear={() => setSearch('')}
          />
        </CardContent>
        <div className="overflow-x-auto border-t">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Service</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Speaker</TableHead>
                <TableHead>Series</TableHead>
                <TableHead>Generated</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.data.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-12">
                    No sermons yet. Upload a transcript to get started.
                  </TableCell>
                </TableRow>
              ) : (
                (data?.data ?? []).map((s) => (
                  <TableRow
                    key={s.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => navigate(`/sermons/social/${s.id}`)}
                  >
                    <TableCell className="whitespace-nowrap">{fmtDate(s.sermonDate)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{s.serviceTimeName}</TableCell>
                    <TableCell className="font-medium">
                      {s.title || <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-sm">{s.speaker}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{s.series || '—'}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Badge variant="secondary" className="text-xs">
                          {s.quoteCount} quotes
                        </Badge>
                        <Badge variant="secondary" className="text-xs">
                          {s.reflectionCount} posts
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => {
                          e.stopPropagation()
                          setPendingDelete(s)
                        }}
                      >
                        <Trash2 className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
        {data && data.total > PAGE_SIZE && (
          <CardContent>
            <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} onPageChange={setPage} noun="sermons" />
          </CardContent>
        )}
      </Card>

      <Dialog open={dialogOpen} onOpenChange={(open) => !createMutation.isPending && setDialogOpen(open)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>New Sermon</DialogTitle>
            <DialogDescription>
              Upload or paste the transcript. Quotes and posts are generated on save — this takes up to a minute.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Service</Label>
              <Select
                value={serviceTimeId ? String(serviceTimeId) : undefined}
                onValueChange={(v) => setServiceTimeId(Number(v))}
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
              <Label htmlFor="sermon-date">Date</Label>
              <Input id="sermon-date" type="date" value={sermonDate} onChange={(e) => setSermonDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Speaker</Label>
              <PersonPicker value={speakerPersonId} onChange={setSpeakerPersonId} placeholder="Select speaker…" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sermon-series">Series (optional)</Label>
              <Input
                id="sermon-series"
                value={series}
                onChange={(e) => setSeries(e.target.value)}
                placeholder="Jesus is the Way, the Truth, and the Life"
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="sermon-title">Title (optional)</Label>
              <Input id="sermon-title" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="sermon-transcript">Transcript</Label>
              <label className="inline-flex cursor-pointer items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
                <Upload className="h-4 w-4" />
                Upload .txt
                <input
                  type="file"
                  accept=".txt,text/plain"
                  className="hidden"
                  onChange={(e) => handleFile(e.target.files?.[0])}
                />
              </label>
            </div>
            <Textarea
              id="sermon-transcript"
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              rows={10}
              placeholder="Paste the transcript, or upload a .txt file…"
            />
            {transcript.trim().length > 0 && (
              <p className="text-xs text-muted-foreground">
                {transcript.trim().split(/\s+/).length.toLocaleString()} words
              </p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={createMutation.isPending}>
              Cancel
            </Button>
            <Button onClick={() => createMutation.mutate()} disabled={!canSubmit || createMutation.isPending}>
              {createMutation.isPending ? 'Generating…' : 'Save & Generate'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title="Delete sermon?"
        description={
          pendingDelete
            ? `This permanently removes the transcript and every quote and post generated from ${fmtDate(pendingDelete.sermonDate)}.`
            : undefined
        }
        confirmLabel="Delete"
        variant="destructive"
        loading={deleteMutation.isPending}
        onConfirm={() => pendingDelete && deleteMutation.mutate(pendingDelete.id)}
      />
    </div>
  )
}
