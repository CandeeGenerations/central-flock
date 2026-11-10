import {Tooltip, TooltipContent, TooltipTrigger} from '@/components/ui/tooltip'
import {cn} from '@/lib/utils'
import {Check} from 'lucide-react'

export const PRAYER_SHEET_COLORS = [
  {label: 'Blue', value: '#1D4ED8'},
  {label: 'Dark Blue', value: '#1E3A8A'},
  {label: 'Green', value: '#15803D'},
  {label: 'Olive', value: '#4A5E2A'},
  {label: 'Red', value: '#B91C1C'},
  {label: 'Copper', value: '#8B3A2A'},
  {label: 'Gold', value: '#B45309'},
  {label: 'Orange', value: '#C2410C'},
  {label: 'Purple', value: '#6D28D9'},
  {label: 'Burgundy', value: '#7C2D52'},
  {label: 'Brown', value: '#78350F'},
  {label: 'Black', value: '#111111'},
]

export function ColorSwatches({
  value,
  onChange,
  usedColors,
}: {
  value: string
  onChange: (color: string) => void
  /** Colors taken elsewhere; shown faded and unclickable. */
  usedColors?: Set<string>
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {PRAYER_SHEET_COLORS.map((c) => {
        const isSelected = c.value === value
        const isUsedElsewhere = !isSelected && !!usedColors?.has(c.value)
        return (
          <Tooltip key={c.value}>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={c.label}
                aria-pressed={isSelected}
                className={cn(
                  'flex h-6 w-6 items-center justify-center rounded transition-transform hover:scale-110 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:scale-100',
                  isSelected && 'ring-foreground ring-offset-background ring-2 ring-offset-2',
                )}
                style={{backgroundColor: c.value}}
                disabled={isUsedElsewhere}
                onClick={() => onChange(c.value)}
              >
                {isSelected && <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />}
              </button>
            </TooltipTrigger>
            <TooltipContent>
              {c.label}
              {isUsedElsewhere ? ' (used)' : ''}
            </TooltipContent>
          </Tooltip>
        )
      })}
    </div>
  )
}
