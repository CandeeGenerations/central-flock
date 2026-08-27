import {type CampaignSummary, fetchCampaigns} from '@/lib/fill-america-api'
import {SEASON_LABELS} from '@/lib/fill-america-core'
import type {SearchProvider} from '@/lib/search/registry'
import {Megaphone} from 'lucide-react'

export const fillAmericaCampaignsProvider: SearchProvider<CampaignSummary> = {
  id: 'fill-america-campaigns',
  label: 'Fill America',
  icon: Megaphone,
  priority: 54,
  queryKey: ['fill-america-campaigns', 'search-index'] as const,
  fetch: () => fetchCampaigns(),
  toItems: (rows) =>
    rows.map((c) => ({
      id: `fill-america-campaign-${c.id}`,
      label: c.title,
      subtitle: [
        SEASON_LABELS[c.season],
        `${c.uniqueParticipants} participants`,
        `${c.tracts.toLocaleString()} tracts`,
      ].join(' · '),
      group: 'Fill America',
      icon: Megaphone,
      keywords: [
        'fill america',
        'campaign',
        'tracts',
        'door hangers',
        'soul winning',
        SEASON_LABELS[c.season],
        c.startDate.slice(0, 4),
      ],
      // Lets the Recent group de-dupe against this provider's result.
      navPath: `/fill-america/${c.id}`,
      action: ({navigate, close}) => {
        navigate(`/fill-america/${c.id}`)
        close()
      },
    })),
}
