import {fetchServiceTimes} from '@/lib/attendance-api'
import type {ServiceTime} from '@/lib/attendance-api'
import {queryKeys} from '@/lib/query-keys'
import {useQuery} from '@tanstack/react-query'
import {useMemo} from 'react'

// Service Times are the app's single service vocabulary (docs/adr/0025), so
// anything that used to render a service enum label resolves it through here.
// Inactive ones are included: a retired Service Time still has to label the
// history that references it.
export function useServiceTimes() {
  const {data} = useQuery({
    queryKey: queryKeys.serviceTimes(true),
    queryFn: () => fetchServiceTimes(true),
    staleTime: 5 * 60 * 1000,
  })

  return useMemo(() => {
    const all: ServiceTime[] = data ?? []
    const byId = new Map(all.map((st) => [st.id, st]))
    return {
      all,
      active: all.filter((st) => st.active),
      byId,
      // `serviceLabel` is the one-off's own name, used when there is no Service
      // Time — the row that can never be double booked.
      label(serviceTimeId: number | null, serviceLabel?: string | null): string {
        if (serviceTimeId == null) return serviceLabel?.trim() || 'Other'
        return byId.get(serviceTimeId)?.name ?? `Service #${serviceTimeId}`
      },
    }
  }, [data])
}
