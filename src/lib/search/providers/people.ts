import {type Person, fetchPeople} from '@/lib/api'
import {queryKeys} from '@/lib/query-keys'
import type {SearchProvider} from '@/lib/search/registry'
import {Users} from 'lucide-react'

const PEOPLE_SEARCH_LIMIT = 5000

function personLabel(p: Person): string {
  const first = p.firstName?.trim() ?? ''
  const last = p.lastName?.trim() ?? ''
  const name = `${first} ${last}`.trim()
  return name || p.phoneDisplay || p.phoneNumber || `Person #${p.id}`
}

export const peopleProvider: SearchProvider<Person> = {
  id: 'people',
  label: 'People',
  icon: Users,
  priority: 100,
  queryKey: [...queryKeys.people, 'search-index'] as const,
  fetch: async () => {
    const res = await fetchPeople({limit: PEOPLE_SEARCH_LIMIT, sort: 'lastName', sortDir: 'asc'})
    return res.data
  },
  toItems: (rows) =>
    rows.map((p) => ({
      id: `people-${p.id}`,
      label: personLabel(p),
      subtitle: p.phoneDisplay ?? p.phoneNumber ?? undefined,
      group: 'People',
      icon: Users,
      keywords: [p.firstName ?? '', p.lastName ?? '', p.phoneNumber ?? '', p.phoneDisplay ?? ''].filter(Boolean),
      action: ({navigate, close}) => {
        navigate(`/people/${p.id}`)
        close()
      },
    })),
}
