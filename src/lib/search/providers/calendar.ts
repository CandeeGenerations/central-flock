import {type CalendarEvent, fetchCalendarEvents} from '@/lib/api'
import type {SearchProvider} from '@/lib/search/registry'
import {Calendar} from 'lucide-react'

const CALENDAR_LOOKAHEAD_DAYS = 365

export const calendarProvider: SearchProvider<CalendarEvent> = {
  id: 'calendar',
  label: 'Calendar Events',
  icon: Calendar,
  priority: 50,
  queryKey: ['calendar-events', CALENDAR_LOOKAHEAD_DAYS, 'search-index'] as const,
  fetch: async () => {
    const res = await fetchCalendarEvents(CALENDAR_LOOKAHEAD_DAYS)
    return res.events
  },
  toItems: (rows) =>
    rows.map((e) => ({
      id: `calendar-${e.id}`,
      label: e.title,
      subtitle: [new Date(e.startDate).toLocaleDateString(), e.location, e.calendarName].filter(Boolean).join(' · '),
      group: 'Calendar',
      icon: Calendar,
      keywords: [e.title, e.location ?? '', e.calendarName],
      action: ({navigate, close}) => {
        navigate('/calendar')
        close()
      },
    })),
}
