import {DAY_NAMES, type ServiceTime, fetchServiceTimes} from '@/lib/attendance-api'
import {queryKeys} from '@/lib/query-keys'
import type {SearchProvider} from '@/lib/search/registry'
import {Clock} from 'lucide-react'

export const serviceTimesProvider: SearchProvider<ServiceTime> = {
  id: 'service-times',
  label: 'Service Times',
  icon: Clock,
  priority: 60,
  queryKey: queryKeys.serviceTimes(true),
  fetch: () => fetchServiceTimes(true),
  toItems: (rows) =>
    rows.map((st) => ({
      id: `service-time-${st.id}`,
      label: st.name,
      subtitle: `${DAY_NAMES[st.dayOfWeek]} · ${st.time}${st.active ? '' : ' · retired'}`,
      group: 'Attendance',
      icon: Clock,
      keywords: [st.name, 'service time', 'attendance', DAY_NAMES[st.dayOfWeek]],
      navPath: '/attendance/times',
      action: ({navigate, close}) => {
        navigate('/attendance/times')
        close()
      },
    })),
}
