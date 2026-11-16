import {monthEnd, notEnded} from '@/lib/search/current-period'
import type {SearchProvider} from '@/lib/search/registry'
import {type SundaySchoolRollSummary, fetchSundaySchoolRolls} from '@/lib/sunday-school-roll-api'
import {
  type Quarter,
  quarterMonths,
  quarterOrdinal,
  quarterRangeLabel,
  quarterTitleLabel,
} from '@/lib/sunday-school-roll-core'
import {ClipboardList} from 'lucide-react'

export const sundaySchoolRollsProvider: SearchProvider<SundaySchoolRollSummary> = {
  id: 'sunday-school-rolls',
  label: 'Sunday School Rolls',
  icon: ClipboardList,
  priority: 55,
  queryKey: ['sunday-school-rolls', 'search-index'] as const,
  ownsPath: /^(\/schedules\/sunday-school-rolls\/\d+)(?:\/|$)/,
  fetch: () => fetchSundaySchoolRolls(),
  // This quarter and later only.
  toItems: (rows) =>
    rows
      .filter((r) => notEnded(monthEnd(r.year, quarterMonths(r.quarter as Quarter)[2])))
      .map((r) => {
        const quarter = r.quarter as Quarter
        return {
          id: `sunday-school-roll-${r.id}`,
          label: quarterTitleLabel(r.year, quarter),
          subtitle: [
            quarterRangeLabel(r.year, quarter),
            `${r.sheetCount} sheets`,
            r.status === 'final' ? 'Final' : 'Draft',
          ]
            .filter(Boolean)
            .join(' · '),
          group: 'Schedules',
          icon: ClipboardList,
          // "attendance" is what these are called on paper, so it has to find
          // them even though the app calls them Rolls. See ADR 0029.
          keywords: [
            'sunday school roll',
            'attendance',
            'roll',
            String(r.year),
            `q${quarter}`,
            `${quarterOrdinal(quarter)} quarter`,
            quarterRangeLabel(r.year, quarter),
            r.status,
          ],
          navPath: `/schedules/sunday-school-rolls/${r.id}`,
          action: ({navigate, close}) => {
            navigate(`/schedules/sunday-school-rolls/${r.id}`)
            close()
          },
        }
      }),
}
