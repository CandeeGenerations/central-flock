import {type Group, fetchGroups} from '@/lib/api'
import {queryKeys} from '@/lib/query-keys'
import type {SearchProvider} from '@/lib/search/registry'
import {FolderOpen} from 'lucide-react'

export const groupsProvider: SearchProvider<Group> = {
  id: 'groups',
  label: 'Groups',
  icon: FolderOpen,
  priority: 95,
  queryKey: queryKeys.groups,
  fetch: fetchGroups,
  toItems: (rows) =>
    rows.map((g) => ({
      id: `groups-${g.id}`,
      label: g.name,
      subtitle: g.description ?? (g.memberCount !== undefined ? `${g.memberCount} members` : undefined),
      group: 'Groups',
      icon: FolderOpen,
      keywords: [g.name, g.description ?? ''].filter(Boolean),
      action: ({navigate, close}) => {
        navigate(`/groups/${g.id}`)
        close()
      },
    })),
}
