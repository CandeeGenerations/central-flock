import {Calendar} from '@/components/ui/calendar'
import {Popover, PopoverContent, PopoverTrigger} from '@/components/ui/popover'
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select'
import {cn} from '@/lib/utils'
import {CalendarIcon, X} from 'lucide-react'
import {useState} from 'react'

interface DatePickerProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
}

export function DatePicker({value, onChange, placeholder = 'Pick a date...'}: DatePickerProps) {
  const [open, setOpen] = useState(false)

  const date = value ? new Date(value + 'T12:00:00') : undefined

  const handleDateSelect = (selected: Date | undefined) => {
    if (!selected) return
    const yyyy = selected.getFullYear()
    const mm = String(selected.getMonth() + 1).padStart(2, '0')
    const dd = String(selected.getDate()).padStart(2, '0')
    onChange(`${yyyy}-${mm}-${dd}`)
    setOpen(false)
  }

  const displayValue = date ? date.toLocaleDateString('en-US', {month: 'short', day: 'numeric', year: 'numeric'}) : null

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <div className="relative">
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              'flex w-full items-center gap-1.5 rounded-3xl border border-transparent bg-input/50 px-3 py-2 text-sm whitespace-nowrap transition-[color,box-shadow,background-color] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 h-9 cursor-pointer',
              !value && 'text-muted-foreground',
              value && 'pr-8',
            )}
          >
            <CalendarIcon className="h-4 w-4 text-muted-foreground shrink-0" />
            {displayValue || placeholder}
          </button>
        </PopoverTrigger>
        {value && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onChange('')
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm opacity-70 hover:opacity-100 cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      <PopoverContent className="w-auto max-w-[calc(100vw-2rem)] p-0" align="start">
        <Calendar mode="single" defaultMonth={date} selected={date} onSelect={handleDateSelect} initialFocus />
      </PopoverContent>
    </Popover>
  )
}

const hourOptions = Array.from({length: 24}, (_, i) => {
  const h = String(i).padStart(2, '0')
  const label = i === 0 ? '12 AM' : i < 12 ? `${i} AM` : i === 12 ? '12 PM' : `${i - 12} PM`
  return {value: h, label}
})

const minuteOptions = Array.from({length: 12}, (_, i) => {
  const m = String(i * 5).padStart(2, '0')
  return {value: m, label: `:${m}`}
})

interface DateTimePickerProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
}

export function DateTimePicker({value, onChange, placeholder = 'Pick a date & time...'}: DateTimePickerProps) {
  const [open, setOpen] = useState(false)

  const date = value ? new Date(value) : undefined
  const hours = date ? String(date.getHours()).padStart(2, '0') : '09'
  const minutes = date ? String(Math.round(date.getMinutes() / 5) * 5).padStart(2, '0') : '00'

  const handleDateSelect = (selected: Date | undefined) => {
    if (!selected) return
    const h = date ? date.getHours() : 9
    const m = date ? date.getMinutes() : 0
    selected.setHours(h, m, 0, 0)
    onChange(formatLocal(selected))
  }

  const handleTimeChange = (h: string, m: string) => {
    const d = date ? new Date(date) : new Date()
    d.setHours(Number(h), Number(m), 0, 0)
    if (!date) {
      const today = new Date()
      d.setFullYear(today.getFullYear(), today.getMonth(), today.getDate())
    }
    onChange(formatLocal(d))
  }

  const formatLocal = (d: Date) => {
    const yyyy = d.getFullYear()
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    const hh = String(d.getHours()).padStart(2, '0')
    const min = String(d.getMinutes()).padStart(2, '0')
    return `${yyyy}-${mm}-${dd}T${hh}:${min}`
  }

  const displayValue = date
    ? date.toLocaleDateString('en-US', {month: 'short', day: 'numeric', year: 'numeric'}) +
      ' at ' +
      date.toLocaleTimeString('en-US', {hour: 'numeric', minute: '2-digit'})
    : null

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <div className="relative">
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              'flex w-full items-center gap-1.5 rounded-3xl border border-transparent bg-input/50 px-3 py-2 text-sm whitespace-nowrap transition-[color,box-shadow,background-color] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 h-9 cursor-pointer',
              !value && 'text-muted-foreground',
              value && 'pr-8',
            )}
          >
            <CalendarIcon className="h-4 w-4 text-muted-foreground shrink-0" />
            {displayValue || placeholder}
          </button>
        </PopoverTrigger>
        {value && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onChange('')
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm opacity-70 hover:opacity-100 cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      <PopoverContent className="w-auto max-w-[calc(100vw-2rem)] p-0" align="start">
        <Calendar
          mode="single"
          defaultMonth={date}
          selected={date}
          onSelect={handleDateSelect}
          disabled={{before: new Date()}}
          initialFocus
        />
        <TimeSelectors date={date} hours={hours} minutes={minutes} onTimeChange={handleTimeChange} />
      </PopoverContent>
    </Popover>
  )
}

function TimeSelectors({
  date,
  hours,
  minutes,
  onTimeChange,
}: {
  date: Date | undefined
  hours: string
  minutes: string
  onTimeChange: (h: string, m: string) => void
}) {
  const now = new Date()
  const isToday =
    date &&
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()

  const currentHour = now.getHours()
  const currentMinute = now.getMinutes()

  const filteredHours = isToday ? hourOptions.filter((o) => Number(o.value) >= currentHour) : hourOptions
  const filteredMinutes =
    isToday && Number(hours) === currentHour
      ? minuteOptions.filter((o) => Number(o.value) > currentMinute)
      : minuteOptions

  // Auto-select first available option if current selection is filtered out
  const hourInList = filteredHours.some((o) => o.value === hours)
  const minuteInList = filteredMinutes.some((o) => o.value === minutes)

  if (!hourInList && filteredHours.length > 0) {
    const firstHour = filteredHours[0].value
    const newMinutes =
      Number(firstHour) === currentHour && isToday
        ? (minuteOptions.find((o) => Number(o.value) > currentMinute)?.value ?? '00')
        : minutes
    onTimeChange(firstHour, newMinutes)
  } else if (!minuteInList && filteredMinutes.length > 0) {
    onTimeChange(hours, filteredMinutes[0].value)
  }

  return (
    <div className="border-t px-4 py-3 flex items-center gap-2">
      <span className="text-sm text-muted-foreground shrink-0">Time:</span>
      <Select value={hours} onValueChange={(v) => onTimeChange(v, minutes)}>
        <SelectTrigger className="flex-1">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {filteredHours.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={minutes} onValueChange={(v) => onTimeChange(hours, v)}>
        <SelectTrigger className="flex-1">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {filteredMinutes.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
