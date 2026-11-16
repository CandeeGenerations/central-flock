import {monthEnd, notEnded} from '@/lib/search/current-period'
import type {SearchProvider} from '@/lib/search/registry'
import {type WorkersNotesEditionSummary, fetchWorkersNotesEditions} from '@/lib/workers-notes-api'
import {type WorkersNotesTerm, termMonths, termRangeLabel} from '@/lib/workers-notes-core'
import {GraduationCap} from 'lucide-react'

export const workersNotesProvider: SearchProvider<WorkersNotesEditionSummary> = {
  id: 'workers-notes',
  label: "Workers' Notes",
  icon: GraduationCap,
  priority: 56,
  queryKey: ['workers-notes', 'search-index'] as const,
  ownsPath: /^(\/schedules\/sunday-school\/\d+)(?:\/|$)/,
  fetch: () => fetchWorkersNotesEditions(),
  // This term and later only (a term is four months).
  toItems: (rows) =>
    rows
      .filter((e) => notEnded(monthEnd(e.year, termMonths(e.term as WorkersNotesTerm)[3])))
      .map((e) => {
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
