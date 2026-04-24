import {type Template, fetchTemplates} from '@/lib/api'
import {queryKeys} from '@/lib/query-keys'
import type {SearchProvider} from '@/lib/search/registry'
import {FileText} from 'lucide-react'

export const templatesProvider: SearchProvider<Template> = {
  id: 'templates',
  label: 'Templates',
  icon: FileText,
  priority: 75,
  queryKey: queryKeys.templates(),
  fetch: () => fetchTemplates(),
  toItems: (rows) =>
    rows.map((t) => ({
      id: `templates-${t.id}`,
      label: t.name,
      subtitle: t.content.slice(0, 80),
      group: 'Templates',
      icon: FileText,
      keywords: [t.name, t.content.slice(0, 200)].filter(Boolean),
      action: ({navigate, close}) => {
        navigate(`/templates/${t.id}/edit`)
        close()
      },
    })),
}
