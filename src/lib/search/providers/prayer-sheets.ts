import {type PrayerSheetEditionSummary, fetchPrayerSheetEditions} from '@/lib/api'
import {localToday, monthsAgo} from '@/lib/search/current-period'
import type {SearchProvider} from '@/lib/search/registry'
import {HandHeart} from 'lucide-react'

const longDate = (iso: string) =>
  new Date(iso + 'T12:00:00').toLocaleDateString('en-US', {month: 'long', day: 'numeric', year: 'numeric'})

// The list endpoint pages at 25, so walk every page to index all editions.
async function fetchAllEditions(): Promise<PrayerSheetEditionSummary[]> {
  const first = await fetchPrayerSheetEditions({page: 1})
  const pages = Math.ceil(first.total / first.limit)
  const rest = await Promise.all(
    Array.from({length: Math.max(0, pages - 1)}, (_, i) => fetchPrayerSheetEditions({page: i + 2})),
  )
  return [first, ...rest].flatMap((p) => p.items)
}

export const prayerSheetsProvider: SearchProvider<PrayerSheetEditionSummary> = {
  id: 'prayer-sheets',
  label: 'Prayer Sheets',
  icon: HandHeart,
  priority: 57,
  queryKey: ['prayer-sheets', 'search-index'] as const,
  ownsPath: /^(\/prayer-sheet\/\d+)(?:\/|$)/,
  fetch: fetchAllEditions,
  // One month's worth: editions whose latest Sunday is within the last month (or still to come).
  toItems: (rows) => {
    const from = monthsAgo(localToday(), 1)
    return rows
      .filter((e) => !e.latestDate || e.latestDate >= from)
      .map((e) => {
        const date = e.latestDate ? longDate(e.latestDate) : 'No Sundays'
        return {
          id: `prayer-sheet-${e.id}`,
          label: `Prayer Sheet – ${date}`,
          subtitle: `${e.sundayCount} Sunday${e.sundayCount === 1 ? '' : 's'} · ${e.entryCount} entries`,
          group: 'Schedules',
          icon: HandHeart,
          keywords: ['prayer sheet', 'prayer', date, e.latestDate ?? ''],
          navPath: `/prayer-sheet/${e.id}`,
          action: ({navigate, close}) => {
            navigate(`/prayer-sheet/${e.id}`)
            close()
          },
        }
      })
  },
}
