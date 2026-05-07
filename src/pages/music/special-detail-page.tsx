import {ConfirmDialog} from '@/components/confirm-dialog'
import {SpecialForm, SpecialFormSaveBar, type SpecialFormState, toCreateBody} from '@/components/specials/special-form'
import {YoutubeExtractCard} from '@/components/specials/youtube-extract-card'
import {Badge} from '@/components/ui/badge'
import {Button} from '@/components/ui/button'
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card'
import {PageSpinner} from '@/components/ui/spinner'
import {formatDate} from '@/lib/date'
import {
  SERVICE_TYPE_LABELS,
  SPECIAL_STATUS_LABELS,
  SPECIAL_TYPE_LABELS,
  type SpecialDetail,
  type SpecialStatus,
  type YoutubeExtraction,
  parseGuestPerformers,
  performerDisplayName,
  specialsApi,
} from '@/lib/specials-api'
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'
import {Check, FileText, Trash2, Upload} from 'lucide-react'
import {useRef, useState} from 'react'
import {useNavigate, useParams} from 'react-router-dom'
import {toast} from 'sonner'

const STATUS_STYLE: Record<SpecialStatus, string> = {
  needs_review: 'bg-yellow-100 text-yellow-900 dark:bg-yellow-900 dark:text-yellow-100',
  will_perform: 'bg-blue-100 text-blue-900 dark:bg-blue-900 dark:text-blue-100',
  performed: 'bg-green-100 text-green-900 dark:bg-green-900 dark:text-green-100',
}

function detailToFormState(d: SpecialDetail): SpecialFormState {
  return {
    date: d.date,
    serviceType: d.serviceType,
    serviceLabel: d.serviceLabel ?? '',
    songTitle: d.songTitle,
    hymnId: d.hymnId,
    songArranger: d.songArranger ?? '',
    songWriter: d.songWriter ?? '',
    type: d.type,
    occasion: d.occasion ?? '',
    performerIds: d.performers.map((p) => p.personId),
    guestPerformers: parseGuestPerformers(d.guestPerformers),
    youtubeUrl: d.youtubeUrl ?? '',
    notes: d.notes ?? '',
  }
}

function youtubeEmbedUrl(url: string | null): string | null {
  if (!url) return null
  const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\s]+)/)
  const id = m?.[1] ?? (/^[A-Za-z0-9_-]{11}$/.test(url) ? url : null)
  return id ? `https://www.youtube.com/embed/${id}` : null
}

interface SpecialEditorProps {
  data: SpecialDetail
}

function SpecialEditor({data}: SpecialEditorProps) {
  const id = data.id
  const navigate = useNavigate()
  const qc = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [formState, setFormState] = useState<SpecialFormState>(() => detailToFormState(data))

  const updateMutation = useMutation({
    mutationFn: (state: SpecialFormState) => specialsApi.update(id, toCreateBody(state)),
    onSuccess: () => {
      toast.success('Saved')
      qc.invalidateQueries({queryKey: ['special', id]})
      qc.invalidateQueries({queryKey: ['specials-list']})
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const markReviewedMutation = useMutation({
    mutationFn: () => specialsApi.markReviewed(id),
    onSuccess: () => {
      toast.success('Marked reviewed')
      qc.invalidateQueries({queryKey: ['special', id]})
      qc.invalidateQueries({queryKey: ['specials-list']})
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const deleteMutation = useMutation({
    mutationFn: () => specialsApi.remove(id),
    onSuccess: () => {
      toast.success('Deleted')
      qc.invalidateQueries({queryKey: ['specials-list']})
      navigate('/music/specials')
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const uploadMutation = useMutation({
    mutationFn: ({fileName, fileData}: {fileName: string; fileData: string}) =>
      specialsApi.uploadSheetMusic(id, fileName, fileData),
    onSuccess: () => {
      toast.success('Sheet music uploaded')
      qc.invalidateQueries({queryKey: ['special', id]})
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const removeSheetMutation = useMutation({
    mutationFn: () => specialsApi.removeSheetMusic(id),
    onSuccess: () => {
      toast.success('Sheet music removed')
      qc.invalidateQueries({queryKey: ['special', id]})
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const onYoutubeExtracted = (result: YoutubeExtraction, sourceUrl: string) => {
    const next: SpecialFormState = {...formState, youtubeUrl: sourceUrl}
    if (result.date) next.date = result.date
    if (result.songTitle) next.songTitle = result.songTitle
    if (result.type) next.type = result.type
    if (result.hymnSuggestion) next.hymnId = result.hymnSuggestion.hymnId
    const newPerformerIds = [...next.performerIds]
    const newGuests = [...next.guestPerformers]
    for (const sug of result.performerSuggestions) {
      if (sug.candidatePersonIds.length === 1) {
        if (!newPerformerIds.includes(sug.candidatePersonIds[0])) newPerformerIds.push(sug.candidatePersonIds[0])
      } else if (sug.candidatePersonIds.length === 0) {
        if (!newGuests.includes(sug.name)) newGuests.push(sug.name)
      }
    }
    next.performerIds = newPerformerIds
    next.guestPerformers = newGuests
    setFormState(next)
  }

  const onPickSheetFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result
      if (typeof result !== 'string') return
      uploadMutation.mutate({fileName: f.name, fileData: result})
    }
    reader.readAsDataURL(f)
  }

  const embed = youtubeEmbedUrl(data.youtubeUrl)
  const isPdf = data.sheetMusicPath?.toLowerCase().endsWith('.pdf')

  return (
    <div className="container mx-auto p-6 space-y-6 max-w-4xl">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="text-xl">{data.songTitle}</CardTitle>
            <div className="text-sm text-muted-foreground mt-1">
              {formatDate(data.date)} · {SERVICE_TYPE_LABELS[data.serviceType]}
              {data.serviceLabel ? ` · ${data.serviceLabel}` : ''} · {SPECIAL_TYPE_LABELS[data.type]}
            </div>
            {(data.performers.length > 0 || parseGuestPerformers(data.guestPerformers).length > 0) && (
              <div className="text-sm mt-2 flex flex-wrap gap-1">
                {data.performers.map((p) => (
                  <Badge key={p.personId} variant="secondary">
                    {performerDisplayName(p)}
                  </Badge>
                ))}
                {parseGuestPerformers(data.guestPerformers).map((g, i) => (
                  <Badge key={`g-${i}`} variant="outline" className="italic">
                    {g}
                  </Badge>
                ))}
              </div>
            )}
          </div>
          <div className="flex flex-col items-end gap-2">
            <Badge className={STATUS_STYLE[data.status]}>{SPECIAL_STATUS_LABELS[data.status]}</Badge>
            {data.status === 'needs_review' && (
              <Button size="sm" onClick={() => markReviewedMutation.mutate()} disabled={markReviewedMutation.isPending}>
                <Check className="h-4 w-4 mr-1" /> Mark Reviewed
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => setConfirmOpen(true)}>
              <Trash2 className="h-4 w-4 mr-1" /> Delete
            </Button>
          </div>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Media</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {embed ? (
            <div className="aspect-video">
              <iframe
                src={embed}
                title="YouTube"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="w-full h-full rounded-md border"
              />
            </div>
          ) : (
            <YoutubeExtractCard initialUrl={formState.youtubeUrl} onExtracted={onYoutubeExtracted} />
          )}

          <div>
            {data.sheetMusicPath ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <FileText className="h-4 w-4" />
                  <a href={data.sheetMusicPath} target="_blank" rel="noreferrer" className="hover:underline">
                    {data.sheetMusicPath.split('/').pop()}
                  </a>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => removeSheetMutation.mutate()}
                    disabled={removeSheetMutation.isPending}
                  >
                    <Trash2 className="h-3 w-3 mr-1" /> Remove
                  </Button>
                </div>
                {isPdf ? (
                  <iframe src={data.sheetMusicPath} className="w-full h-[60vh] rounded-md border" />
                ) : (
                  <img src={data.sheetMusicPath} alt="Sheet music" className="max-h-[60vh] mx-auto rounded-md border" />
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" onClick={() => fileRef.current?.click()}>
                  <Upload className="h-4 w-4 mr-1" /> Upload sheet music
                </Button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="application/pdf,image/*"
                  className="hidden"
                  onChange={onPickSheetFile}
                />
                <span className="text-xs text-muted-foreground">PDF or image</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Edit details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <SpecialForm state={formState} onChange={setFormState} excludeSpecialId={id} />
          <SpecialFormSaveBar
            onSave={() => updateMutation.mutate(formState)}
            saving={updateMutation.isPending}
            saveLabel="Save changes"
          />
        </CardContent>
      </Card>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Delete this special?"
        description="This cannot be undone. Performer links and any uploaded sheet music will also be removed."
        confirmLabel="Delete"
        variant="destructive"
        loading={deleteMutation.isPending}
        onConfirm={() => deleteMutation.mutate()}
      />
    </div>
  )
}

export function SpecialDetailPage() {
  const {id: idStr} = useParams<{id: string}>()
  const id = Number(idStr)

  const {data, isLoading, error} = useQuery({
    queryKey: ['special', id],
    queryFn: () => specialsApi.get(id),
  })

  if (isLoading) return <PageSpinner />
  if (error) return <div className="p-6 text-destructive">Failed to load: {error.message}</div>
  if (!data) return null

  // Key on (id, updatedAt) so the editor remounts when a fresh fetch lands.
  return <SpecialEditor key={`${data.id}-${data.updatedAt}`} data={data} />
}
