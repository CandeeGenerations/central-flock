import {Card, CardContent} from '@/components/ui/card'
import {PageSpinner} from '@/components/ui/spinner'
import {
  type WorkersNotesBlock,
  fetchWorkersNotesEdition,
  saveWorkersNotesBlocks,
  workersNotesKeys,
} from '@/lib/workers-notes-api'
import {NotesBlockEditor} from '@/pages/schedules-settings/notes-block-editor'
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'
import {useParams} from 'react-router-dom'
import {toast} from 'sonner'

import {EditShell} from './edit-shell'

/** Page 1's bullet list — free text plus the three derived placeholders. */
export function WorkersNotesBlocksPage() {
  const editionId = Number(useParams<{id: string}>().id)
  const queryClient = useQueryClient()

  const {data: edition} = useQuery({
    queryKey: workersNotesKeys.detail(editionId),
    queryFn: () => fetchWorkersNotesEdition(editionId),
    enabled: Number.isFinite(editionId),
  })

  const save = useMutation({
    mutationFn: (blocks: WorkersNotesBlock[]) => saveWorkersNotesBlocks(editionId, blocks),
    onSuccess: () => {
      queryClient.invalidateQueries({queryKey: workersNotesKeys.all})
      toast.success('Bullets saved')
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed to save'),
  })

  if (!edition) return <PageSpinner />

  return (
    <EditShell
      editionId={editionId}
      title="Bullets"
      subtitle="The bullet paragraphs on page 1. These copy forward into the next edition, so wording you fix here carries on."
    >
      <Card className="max-w-3xl">
        <CardContent className="p-4">
          <NotesBlockEditor blocks={edition.blocks} onSave={(b) => save.mutate(b)} saving={save.isPending} />
        </CardContent>
      </Card>
    </EditShell>
  )
}
