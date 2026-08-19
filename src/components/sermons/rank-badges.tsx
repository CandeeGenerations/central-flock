import {Badge} from '@/components/ui/badge'
import {Tooltip, TooltipContent, TooltipTrigger} from '@/components/ui/tooltip'
import type {RankTier} from '@/lib/sermons-api'
import {AlertTriangle} from 'lucide-react'

const TIER_LABEL: Record<RankTier, string> = {high: 'High', medium: 'Medium', low: 'Low'}

export function RankBadge({tier, note}: {tier: RankTier; note: string | null}) {
  const badge = (
    <Badge variant={tier === 'high' ? 'default' : tier === 'medium' ? 'secondary' : 'outline'} className="text-xs">
      {TIER_LABEL[tier]}
    </Badge>
  )
  if (!note) return badge
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span>{badge}</span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">{note}</TooltipContent>
    </Tooltip>
  )
}

// Contested material is flagged, never filtered or down-ranked — the pastor decides what to post.
// See docs/adr/0019.
export function SensitiveBadge({reason}: {reason: string | null}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant="destructive" className="text-xs">
          <AlertTriangle className="h-3 w-3" />
          Contested
        </Badge>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">
        {reason || 'Touches a politically contested topic — read before posting.'}
      </TooltipContent>
    </Tooltip>
  )
}
