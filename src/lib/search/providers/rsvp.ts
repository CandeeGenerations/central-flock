import {queryKeys} from '@/lib/query-keys'
import {type RsvpListSummary, fetchRsvpLists} from '@/lib/rsvp-api'
import type {SearchProvider} from '@/lib/search/registry'
import {CheckSquare} from 'lucide-react'

export const rsvpProvider: SearchProvider<RsvpListSummary> = {
  id: 'rsvp',
  label: 'RSVPs',
  icon: CheckSquare,
  priority: 90,
  queryKey: queryKeys.rsvpLists(false),
  fetch: () => fetchRsvpLists(false),
  toItems: (rows) =>
    rows.map((l) => ({
      id: `rsvp-${l.id}`,
      label: l.name,
      subtitle: `Yes ${l.counts.yes} · No ${l.counts.no} · Maybe ${l.counts.maybe} · No Response ${l.counts.no_response}`,
      group: 'Calendar',
      icon: CheckSquare,
      keywords: [l.name, 'rsvp'],
      action: ({navigate, close}) => {
        navigate(`/rsvp/${l.id}`)
        close()
      },
    })),
}
