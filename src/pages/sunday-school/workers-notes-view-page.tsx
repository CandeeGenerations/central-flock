import {ScaledPage} from '@/components/print/scaled-page'
import {DocumentHeader, SettingsAction} from '@/components/schedule/document-header'
import {PageSpinner} from '@/components/ui/spinner'
import {WorkersNotesPage1} from '@/components/workers-notes/workers-notes-page-1'
import {WorkersNotesPage2} from '@/components/workers-notes/workers-notes-page-2'
import {exportFixedPagePdf} from '@/lib/fixed-page-pdf'
import {fetchSchedulesSettings, schedulesKeys} from '@/lib/schedules-api'
import {
  deleteWorkersNotesEdition,
  fetchWorkersNotesEdition,
  updateWorkersNotesEdition,
  workersNotesKeys,
} from '@/lib/workers-notes-api'
import {type WorkersNotesTerm, termRangeLabel, termSlug} from '@/lib/workers-notes-core'
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'
import {Trash2} from 'lucide-react'
import {useRef, useState} from 'react'
import {useNavigate, useParams} from 'react-router-dom'
import {toast} from 'sonner'

import {RegionOverlay} from './region-overlay'

export function WorkersNotesViewPage() {
  const {id} = useParams<{id: string}>()
  const editionId = Number(id)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
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
  const editMode = edition.status === 'draft'
  const label = termRangeLabel(edition.year, term)
  const go = (sub: string) => navigate(`/schedules/sunday-school/${editionId}/${sub}`)

  return (
    <div className="space-y-4 p-4 md:p-6">
      <DocumentHeader
        onBack={() => navigate('/schedules/sunday-school')}
        title={label}
        status={edition.status}
        onFinalize={() => patch.mutate({status: 'final'})}
        onReopen={() => patch.mutate({status: 'draft'})}
        statusPending={patch.isPending}
        exporting={exporting}
        downloads={[
          {
            label: 'PDF',
            onSelect: async () => {
              if (!page1Ref.current || !page2Ref.current) return
              setExporting(true)
              try {
                await exportFixedPagePdf(
                  [page1Ref.current, page2Ref.current],
                  `workers-notes-${termSlug(edition.year, term)}`,
                )
              } catch (e) {
                toast.error(e instanceof Error ? e.message : 'Export failed')
              } finally {
                setExporting(false)
              }
            },
          },
        ]}
        settings={() => (
          <SettingsAction
            icon={<Trash2 />}
            destructive
            onClick={() => {
              if (confirm(`Delete the ${label} edition? This cannot be undone.`)) remove.mutate()
            }}
          >
            Delete this edition
          </SettingsAction>
        )}
      />

      <p className="text-muted-foreground text-sm">
        {editMode
          ? 'Click any part of the page to edit it. Finalize locks editing; PDF export works either way.'
          : 'Final — editing is locked. Reopen to make changes.'}
      </p>

      <div className="grid gap-6 2xl:grid-cols-2">
        <div className="rounded border bg-white shadow-sm">
          <ScaledPage zoom="fit">
            <div style={{position: 'relative'}}>
              <WorkersNotesPage1
                ref={page1Ref}
                churchName={settings.workersNotes.churchName}
                logoPath={settings.workersNotes.useLogoHeader ? settings.logoPath : null}
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
          <ScaledPage zoom="fit">
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
