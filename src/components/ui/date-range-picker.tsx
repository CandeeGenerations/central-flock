import {Button} from '@/components/ui/button'
import {Calendar} from '@/components/ui/calendar'
import {Popover, PopoverContent, PopoverTrigger} from '@/components/ui/popover'
import {cn} from '@/lib/utils'
import {CalendarIcon} from 'lucide-react'
import {useState} from 'react'
import type {DateRange as RdpDateRange} from 'react-day-picker'

export interface DateRange {
  from: string
  to: string
}

const pad2 = (n: number) => String(n).padStart(2, '0')

// Local-time ISO. Going through toISOString() would shift the day for anyone
// west of UTC, which is every user of this app.
function toIso(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}
function fromIso(iso: string): Date | undefined {
  if (!iso) return undefined
  const d = new Date(iso + 'T12:00:00')
  return isNaN(d.getTime()) ? undefined : d
}
function addDays(d: Date, n: number): Date {
  const out = new Date(d)
  out.setDate(out.getDate() + n)
  return out
}
function addMonths(d: Date, n: number): Date {
  const out = new Date(d)
  out.setMonth(out.getMonth() + n)
  return out
}

// The earliest date the app could hold a record for. Cheaper than a round trip
// for a true min(serviceDate), and any wider range returns the same rows.
const EPOCH = '2000-01-01'

export interface RangePreset {
  label: string
  range: () => DateRange
}

// Ordered roughly by how often they get reached for.
export const DATE_RANGE_PRESETS: RangePreset[] = [
  {
    label: 'Year to date',
    range: () => {
      const now = new Date()
      return {from: `${now.getFullYear()}-01-01`, to: toIso(now)}
    },
  },
  {
    label: 'Last 30 days',
    range: () => {
      const now = new Date()
      return {from: toIso(addDays(now, -29)), to: toIso(now)}
    },
  },
  {
    label: 'Last 90 days',
    range: () => {
      const now = new Date()
      return {from: toIso(addDays(now, -89)), to: toIso(now)}
    },
  },
  {
    label: 'Last 6 months',
    range: () => {
      const now = new Date()
      return {from: toIso(addMonths(now, -6)), to: toIso(now)}
    },
  },
  {
    label: 'Last 12 months',
    range: () => {
      const now = new Date()
      return {from: toIso(addMonths(now, -12)), to: toIso(now)}
    },
  },
  {
    label: 'This month',
    range: () => {
      const now = new Date()
      return {from: `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-01`, to: toIso(now)}
    },
  },
  {
    label: 'Last month',
    range: () => {
      const now = new Date()
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const end = new Date(now.getFullYear(), now.getMonth(), 0)
      return {from: toIso(start), to: toIso(end)}
    },
  },
  {
    label: 'Last year',
    range: () => {
      const y = new Date().getFullYear() - 1
      return {from: `${y}-01-01`, to: `${y}-12-31`}
    },
  },
  {
    label: 'All time',
    range: () => ({from: EPOCH, to: toIso(new Date())}),
  },
]

function formatRange({from, to}: DateRange): string {
  const f = fromIso(from)
  const t = fromIso(to)
  if (!f || !t) return 'Pick a range...'
  const sameYear = f.getFullYear() === t.getFullYear()
  const fmt = (d: Date, withYear: boolean) =>
    d.toLocaleDateString('en-US', {month: 'short', day: 'numeric', ...(withYear ? {year: 'numeric'} : {})})
  return `${fmt(f, !sameYear)} – ${fmt(t, true)}`
}

interface DateRangePickerProps {
  value: DateRange
  onChange: (value: DateRange) => void
  presets?: RangePreset[]
  className?: string
}

export function DateRangePicker({value, onChange, presets = DATE_RANGE_PRESETS, className}: DateRangePickerProps) {
  const [open, setOpen] = useState(false)

  const selected: RdpDateRange | undefined = fromIso(value.from)
    ? {from: fromIso(value.from), to: fromIso(value.to)}
    : undefined

  // Commit only once both ends exist, so the first click of a new range does
  // not refetch against a half-built range.
  const handleSelect = (range: RdpDateRange | undefined) => {
    if (!range?.from) return
    if (!range.to) return
    onChange({from: toIso(range.from), to: toIso(range.to)})
    setOpen(false)
  }

  const activePreset = presets.find((p) => {
    const r = p.range()
    return r.from === value.from && r.to === value.to
  })

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className={cn('justify-start font-normal', className)}>
          <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
          {activePreset ? activePreset.label : formatRange(value)}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <div className="flex flex-col sm:flex-row">
          <div className="flex shrink-0 gap-1 overflow-x-auto border-b p-2 sm:w-40 sm:flex-col sm:overflow-visible sm:border-r sm:border-b-0">
            {presets.map((p) => (
              <Button
                key={p.label}
                variant={activePreset?.label === p.label ? 'secondary' : 'ghost'}
                size="sm"
                className="justify-start whitespace-nowrap"
                onClick={() => {
                  onChange(p.range())
                  setOpen(false)
                }}
              >
                {p.label}
              </Button>
            ))}
          </div>
          <Calendar
            mode="range"
            defaultMonth={fromIso(value.to)}
            selected={selected}
            onSelect={handleSelect}
            numberOfMonths={2}
            autoFocus
          />
        </div>
      </PopoverContent>
    </Popover>
  )
}
