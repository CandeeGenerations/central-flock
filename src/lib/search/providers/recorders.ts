import {type Recorder, fetchRecorders} from '@/lib/attendance-api'
import {queryKeys} from '@/lib/query-keys'
import type {SearchProvider} from '@/lib/search/registry'
import {Contact} from 'lucide-react'

export const recordersProvider: SearchProvider<Recorder> = {
  id: 'recorders',
  label: 'Recorders',
  icon: Contact,
  priority: 55,
  queryKey: queryKeys.attendanceRecorders,
  fetch: fetchRecorders,
  toItems: (rows) =>
    rows.map((r) => ({
      id: `recorder-${r.id}`,
      label: r.name,
      subtitle: `Recorder · ${r.editCount} edits${r.active ? '' : ' · retired'}`,
      group: 'Attendance',
      icon: Contact,
      keywords: [r.name, 'recorder', 'attendance', 'token'],
      navPath: '/attendance/recorders',
      action: ({navigate, close}) => {
        navigate('/attendance/recorders')
        close()
      },
    })),
}
