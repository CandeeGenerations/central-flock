import type {SearchProvider} from '@/lib/search/registry'
import {type WorkersNotesEditionSummary, fetchWorkersNotesEditions} from '@/lib/workers-notes-api'
import {type WorkersNotesTerm, termRangeLabel} from '@/lib/workers-notes-core'
import {GraduationCap} from 'lucide-react'

export const workersNotesProvider: SearchProvider<WorkersNotesEditionSummary> = {
  id: 'workers-notes',
  label: "Workers' Notes",
  icon: GraduationCap,
  priority: 56,
  queryKey: ['workers-notes', 'search-index'] as const,
  fetch: () => fetchWorkersNotesEditions(),
  toItems: (rows) =>
    rows.map((e) => {
      const term = e.term as WorkersNotesTerm
      return {
        id: `workers-notes-${e.id}`,
        label: termRangeLabel(e.year, term),
        subtitle: [`from #${e.startingLessonNumber}`, e.status === 'final' ? 'Final' : 'Draft'].join(' · '),
        group: 'Schedules',
        icon: GraduationCap,
        keywords: ['workers notes', 'sunday school', String(e.year), e.scopeLabel, e.status],
        navPath: `/schedules/sunday-school/${e.id}`,
        action: ({navigate, close}) => {
          navigate(`/schedules/sunday-school/${e.id}`)
          close()
        },
      }
    }),
}
