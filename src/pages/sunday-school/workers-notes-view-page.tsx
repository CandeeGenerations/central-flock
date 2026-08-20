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
import {type WorkersNotesTerm, termRangeLabel, termSlug} from '@/lib/workers-notes-core'
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'
import {ArrowLeft, Download, Lock, LockOpen, Trash2} from 'lucide-react'
import {useRef, useState} from 'react'
import {useNavigate, useParams} from 'react-router-dom'
import {toast} from 'sonner'

import {RegionOverlay} from './region-overlay'
import {exportWorkersNotesPdf} from './workers-notes-export'

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
  const [exporting, setExporting] = useState(false)
  const page1Ref = useRef<HTMLDivElement>(null)
  const page2Ref = useRef<HTMLDivElement>(null)

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
        <Button variant="ghost" size="icon" onClick={() => navigate('/schedules/sunday-school')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h2 className="text-2xl font-bold">{termRangeLabel(edition.year, term)}</h2>
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
          <Button
            size="sm"
            variant="outline"
            disabled={exporting}
            onClick={async () => {
              if (!page1Ref.current || !page2Ref.current) return
              setExporting(true)
              try {
                await exportWorkersNotesPdf(
                  [page1Ref.current, page2Ref.current],
                  `workers-notes-${termSlug(edition.year, term)}`,
                )
              } catch (e) {
                toast.error(e instanceof Error ? e.message : 'Export failed')
              } finally {
                setExporting(false)
              }
            }}
          >
            <Download className="mr-1 h-4 w-4" />
            {exporting ? 'Exporting…' : 'PDF'}
          </Button>
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
                ref={page1Ref}
                churchName={settings.workersNotes.churchName}
                year={edition.year}
                term={term}
                theme={edition.theme}
                blocks={edition.blocks}
                months={edition.months}
              />
              {/* Hit zones are measured from the page's own DOM, so they track
                  content instead of drifting (ADR 0005 keeps them in a wrapper). */}
              {editMode ? <RegionOverlay pageRef={page1Ref} onOpen={go} deps={edition} /> : null}
            </div>
          </ScaledPage>
        </div>

        <div className="rounded border bg-white shadow-sm">
          <ScaledPage zoom={zoom}>
            <div style={{position: 'relative'}}>
              <WorkersNotesPage2
                ref={page2Ref}
                year={edition.year}
                term={term}
                months={edition.months}
                lessonRows={edition.lessonRows}
              />
              {editMode ? <RegionOverlay pageRef={page2Ref} onOpen={go} deps={edition} /> : null}
            </div>
          </ScaledPage>
        </div>
      </div>
    </div>
  )
}
