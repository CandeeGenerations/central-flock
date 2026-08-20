import {PageSpinner} from '@/components/ui/spinner'
import {fetchWorkersNotesEdition, saveYearlyTheme, workersNotesKeys} from '@/lib/workers-notes-api'
import {type ThemeFields, ThemeForm} from '@/pages/schedules-settings/sunday-school-themes'
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'
import {useParams} from 'react-router-dom'
import {toast} from 'sonner'

import {EditShell} from './edit-shell'

/**
 * The year's theme, reached by clicking the chorus (or the growth-plan bullet)
 * on page 1. Same form as the settings pane — a theme belongs to the year, not
 * to this edition, so editing here changes all three of that year's editions.
 */
export function WorkersNotesThemePage() {
  const editionId = Number(useParams<{id: string}>().id)
  const queryClient = useQueryClient()

  const {data: edition} = useQuery({
    queryKey: workersNotesKeys.detail(editionId),
    queryFn: () => fetchWorkersNotesEdition(editionId),
    enabled: Number.isFinite(editionId),
  })

  const save = useMutation({
    mutationFn: (body: ThemeFields) => saveYearlyTheme(edition!.year, body),
    onSuccess: () => {
      queryClient.invalidateQueries({queryKey: workersNotesKeys.all})
      toast.success('Theme saved')
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed to save'),
  })

  if (!edition) return <PageSpinner />

  const theme = edition.theme ?? {
    id: 0,
    year: edition.year,
    songTitle: '',
    songCredit: '',
    chorusLyrics: '',
    tagLyrics: '',
    verseText: '',
    verseRef: '',
    growthPlan: '',
  }

  return (
    <EditShell
      editionId={editionId}
      title={`${edition.year} Theme`}
      subtitle={`Shared by all three ${edition.year} editions — editing it changes every one of them.`}
    >
      <div className="max-w-2xl">
        <ThemeForm key={edition.year} theme={theme} saving={save.isPending} onSave={(body) => save.mutate(body)} />
      </div>
    </EditShell>
  )
}
