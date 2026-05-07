import {
  SpecialForm,
  SpecialFormSaveBar,
  type SpecialFormState,
  emptySpecialFormState,
  toCreateBody,
} from '@/components/specials/special-form'
import {YoutubeExtractCard} from '@/components/specials/youtube-extract-card'
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card'
import {type YoutubeExtraction, specialsApi} from '@/lib/specials-api'
import {useMutation, useQueryClient} from '@tanstack/react-query'
import {useState} from 'react'
import {useNavigate} from 'react-router-dom'
import {toast} from 'sonner'

export function SpecialNewPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [state, setState] = useState<SpecialFormState>(emptySpecialFormState())

  const createMutation = useMutation({
    mutationFn: () => specialsApi.create(toCreateBody(state)),
    onSuccess: (created) => {
      toast.success('Special created')
      qc.invalidateQueries({queryKey: ['specials-list']})
      navigate(`/music/specials/${created.id}`)
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const onYoutubeExtracted = (result: YoutubeExtraction, sourceUrl: string) => {
    const next: SpecialFormState = {...state, youtubeUrl: sourceUrl}
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
    setState(next)
  }

  return (
    <div className="container mx-auto p-6 space-y-6 max-w-4xl">
      <h1 className="text-2xl font-semibold">New Special</h1>

      <YoutubeExtractCard onExtracted={onYoutubeExtracted} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <SpecialForm state={state} onChange={setState} />
          <SpecialFormSaveBar
            onSave={() => {
              if (!state.songTitle.trim()) {
                toast.error('Song title is required')
                return
              }
              createMutation.mutate()
            }}
            onCancel={() => navigate('/music/specials')}
            saving={createMutation.isPending}
            saveLabel="Create"
          />
        </CardContent>
      </Card>
    </div>
  )
}
