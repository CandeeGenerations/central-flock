import {fetchGroups, fetchSettings, fetchTemplates} from '@/lib/api'
import {queryKeys} from '@/lib/query-keys'
import {useQuery} from '@tanstack/react-query'
import {useMemo} from 'react'

// A Prayer Request is an ordinary compose preselected with the prayer chain's group and
// template, started from a one-press shortcut. See CONTEXT.md and plans/prayer-request.md.
export const PRAYER_REQUEST_GROUP_KEY = 'prayerRequest.groupId'
export const PRAYER_REQUEST_TEMPLATE_KEY = 'prayerRequest.templateId'
export const PRAYER_REQUEST_HREF = '/messages/compose?prayerRequest=1'

// Deleting either one hides the shortcut, which is otherwise silent — so the delete
// confirmations say so. Nothing is blocked and the setting is left alone.
export const PRAYER_REQUEST_GROUP_WARNING =
  'This is the Prayer Request group — the shortcut will be hidden until you choose another in Settings.'
export const PRAYER_REQUEST_TEMPLATE_WARNING =
  'This is the Prayer Request template — the shortcut will be hidden until you choose another in Settings.'

export type PrayerRequestConfig = {
  /** Both settings resolve to a live group and template — the only state the shortcut shows in. */
  ready: boolean
  /** Every query has answered, so `ready: false` means "not configured", not "not yet known". */
  loaded: boolean
  groupId: number | null
  templateId: number | null
  href: string
}

function parseId(raw: string | undefined): number | null {
  if (!raw) return null
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : null
}

export function usePrayerRequest(): PrayerRequestConfig {
  const {data: settings} = useQuery({queryKey: queryKeys.settings, queryFn: fetchSettings, staleTime: 5 * 60 * 1000})
  const {data: groups} = useQuery({queryKey: queryKeys.groups, queryFn: fetchGroups, staleTime: 5 * 60 * 1000})
  const {data: templates} = useQuery({
    queryKey: queryKeys.templates(),
    queryFn: () => fetchTemplates(),
    staleTime: 5 * 60 * 1000,
  })

  return useMemo(() => {
    const groupId = parseId(settings?.[PRAYER_REQUEST_GROUP_KEY])
    const templateId = parseId(settings?.[PRAYER_REQUEST_TEMPLATE_KEY])
    // Deleting either one hides the shortcut rather than opening a compose that
    // silently drops half of what was configured.
    const groupLives = groupId != null && !!groups?.some((g) => g.id === groupId)
    const templateLives = templateId != null && !!templates?.some((t) => t.id === templateId)
    return {
      ready: groupLives && templateLives,
      loaded: !!settings && !!groups && !!templates,
      groupId: groupLives ? groupId : null,
      templateId: templateLives ? templateId : null,
      href: PRAYER_REQUEST_HREF,
    }
  }, [settings, groups, templates])
}
