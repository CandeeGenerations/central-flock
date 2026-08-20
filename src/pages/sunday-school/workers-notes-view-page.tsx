import {Button} from '@/components/ui/button'
import {PageSpinner} from '@/components/ui/spinner'
import {ScaledPage, type ZoomMode} from '@/components/workers-notes/scaled-page'
import {WorkersNotesPage1} from '@/components/workers-notes/workers-notes-page-1'
import {WorkersNotesPage2} from '@/components/workers-notes/workers-notes-page-2'
import {fetchSchedulesSettings, schedulesKeys} from '@/lib/schedules-api'
import {
  deleteWorkersNotesEdition,
  fetchWorkersNotesEdition,
  updateWorkersNotesEdition,
  workersNotesKeys,
} from '@/lib/workers-notes-api'
import {type WorkersNotesTerm, termRangeLabel} from '@/lib/workers-notes-core'
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'
import {ArrowLeft, Lock, LockOpen, Trash2} from 'lucide-react'
import {useState} from 'react'
import {useNavigate, useParams} from 'react-router-dom'
import {toast} from 'sonner'

import {EditableRegion} from './editable-region'

const ZOOMS: {value: ZoomMode; label: string}[] = [
  {value: 'fit', label: 'Fit'},
  {value: 1, label: '100%'},
  {value: 1.5, label: '150%'},
]

export function WorkersNotesViewPage() {
  const {id} = useParams<{id: string}>()
  const editionId = Number(id)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [zoom, setZoom] = useState<ZoomMode>('fit')
  const [editMode, setEditMode] = useState(true)

  const {data: edition, isLoading} = useQuery({
    queryKey: workersNotesKeys.detail(editionId),
    queryFn: () => fetchWorkersNotesEdition(editionId),
    enabled: Number.isFinite(editionId),
  })
  const {data: settings} = useQuery({queryKey: schedulesKeys.settings, queryFn: fetchSchedulesSettings})

  const patch = useMutation({
    mutationFn: (body: {status?: 'draft' | 'final'}) => updateWorkersNotesEdition(editionId, body),
    onSuccess: () => queryClient.invalidateQueries({queryKey: workersNotesKeys.all}),
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed to update'),
  })

  const remove = useMutation({
    mutationFn: () => deleteWorkersNotesEdition(editionId),
    onSuccess: () => {
      queryClient.invalidateQueries({queryKey: workersNotesKeys.all})
      navigate('/schedules/sunday-school')
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed to delete'),
  })

  if (isLoading || !edition || !settings) return <PageSpinner />

  const term = edition.term as WorkersNotesTerm
  const go = (sub: string) => navigate(`/schedules/sunday-school/${editionId}/${sub}`)

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => navigate('/schedules/sunday-school')}>
          <ArrowLeft className="mr-1 h-4 w-4" />
          Sunday School
        </Button>
        <h2 className="text-xl font-bold">{termRangeLabel(edition.year, term)}</h2>
        <span
          className={
            edition.status === 'final'
              ? 'rounded bg-green-100 px-2 py-0.5 text-xs text-green-800'
              : 'bg-muted rounded px-2 py-0.5 text-xs'
          }
        >
          {edition.status}
        </span>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="flex gap-1">
            {ZOOMS.map((z) => (
              <Button
                key={String(z.value)}
                size="sm"
                variant={zoom === z.value ? 'default' : 'outline'}
                onClick={() => setZoom(z.value)}
              >
                {z.label}
              </Button>
            ))}
          </div>
          <Button size="sm" variant={editMode ? 'default' : 'outline'} onClick={() => setEditMode((v) => !v)}>
            {editMode ? 'Editing' : 'Edit'}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => patch.mutate({status: edition.status === 'final' ? 'draft' : 'final'})}
          >
            {edition.status === 'final' ? (
              <>
                <LockOpen className="mr-1 h-4 w-4" />
                Reopen
              </>
            ) : (
              <>
                <Lock className="mr-1 h-4 w-4" />
                Finalize
              </>
            )}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              if (confirm(`Delete the ${termRangeLabel(edition.year, term)} edition? This cannot be undone.`))
                remove.mutate()
            }}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {editMode ? (
        <p className="text-muted-foreground text-sm">
          Click any part of the page to edit it. PDF export works in draft — finalizing only locks editing.
        </p>
      ) : null}

      <div className="grid gap-6 2xl:grid-cols-2">
        <div className="rounded border bg-white shadow-sm">
          <ScaledPage zoom={zoom}>
            <div style={{position: 'relative'}}>
              <WorkersNotesPage1
                churchName={settings.workersNotes.churchName}
                year={edition.year}
                term={term}
                theme={edition.theme}
                blocks={edition.blocks}
                months={edition.months}
              />
              {editMode ? (
                <>
                  {/* Hit zones sit over an untouched render, so no edit chrome
                      can reach the export path (ADR 0005). */}
                  <EditableRegion label="Yearly Theme" top={130} height={300} onClick={() => go('theme')} />
                  <EditableRegion label="Bullets" top={430} height={430} onClick={() => go('blocks')} />
                  <EditableRegion label="Month themes" top={860} height={150} onClick={() => go('months')} />
                </>
              ) : null}
            </div>
          </ScaledPage>
        </div>

        <div className="rounded border bg-white shadow-sm">
          <ScaledPage zoom={zoom}>
            <div style={{position: 'relative'}}>
              <WorkersNotesPage2
                year={edition.year}
                term={term}
                months={edition.months}
                lessonRows={edition.lessonRows}
              />
              {editMode ? (
                <>
                  <EditableRegion label="Songs, mottos, verses" top={48} height={330} onClick={() => go('months')} />
                  <EditableRegion label="Lessons" top={378} height={630} onClick={() => go('lessons')} />
                </>
              ) : null}
            </div>
          </ScaledPage>
        </div>
      </div>
    </div>
  )
}
