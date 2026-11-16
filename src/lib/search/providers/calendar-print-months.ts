import type {SearchProvider} from '@/lib/search/registry'
import {Printer} from 'lucide-react'

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

interface PrintMonth {
  year: number
  month: number
}

// Static: this month through the end of next year, so "calendar print march" jumps straight to
// that month. Past months are left out (see current-period.ts).
export const calendarPrintMonthsProvider: SearchProvider<PrintMonth> = {
  id: 'calendar-print-months',
  label: 'Calendar Print',
  icon: Printer,
  priority: 70,
  // Keyed by month so the list rolls forward when the month changes.
  queryKey: ['calendar-print-months', new Date().getFullYear(), new Date().getMonth()] as const,
  fetch: async () => {
    const now = new Date()
    const year = now.getFullYear()
    const month = now.getMonth() + 1
    return [year, year + 1]
      .flatMap((y) => MONTHS.map((_, i) => ({year: y, month: i + 1})))
      .filter((m) => m.year > year || m.month >= month)
  },
  staleTime: Infinity,
  toItems: (rows) =>
    rows.map(({year, month}) => {
      const ym = `${year}-${String(month).padStart(2, '0')}`
      const name = MONTHS[month - 1]
      return {
        id: `calendar-print-${ym}`,
        label: `Calendar Print – ${name} ${year}`,
        group: 'Calendar',
        icon: Printer,
        keywords: ['calendar print', 'print', 'month', name, String(year), ym],
        action: ({navigate, close}) => {
          navigate(`/calendar/print?month=${ym}`)
          close()
        },
      }
    }),
}
