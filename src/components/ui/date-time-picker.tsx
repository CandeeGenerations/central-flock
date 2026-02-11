import {Button} from '@/components/ui/button'
import {Calendar} from '@/components/ui/calendar'
import {Input} from '@/components/ui/input'
import {Popover, PopoverContent, PopoverTrigger} from '@/components/ui/popover'
import {cn} from '@/lib/utils'
import {CalendarIcon, X} from 'lucide-react'
import {useState} from 'react'

interface DateTimePickerProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
}

export function DateTimePicker({value, onChange, placeholder = 'Pick a date & time...'}: DateTimePickerProps) {
  const [open, setOpen] = useState(false)

  const date = value ? new Date(value) : undefined
  const hours = date ? String(date.getHours()).padStart(2, '0') : '09'
  const minutes = date ? String(date.getMinutes()).padStart(2, '0') : '00'

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
      // If no date was set yet, use today
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
    <div className="flex items-center gap-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className={cn('w-64 justify-start text-left font-normal', !value && 'text-muted-foreground')}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {displayValue || placeholder}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar mode="single" selected={date} onSelect={handleDateSelect} initialFocus />
          <div className="border-t px-4 py-3 flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Time:</span>
            <Input
              type="number"
              min={0}
              max={23}
              value={hours}
              onChange={(e) => handleTimeChange(e.target.value, minutes)}
              className="w-16 text-center"
            />
            <span className="text-sm font-medium">:</span>
            <Input
              type="number"
              min={0}
              max={59}
              step={5}
              value={minutes}
              onChange={(e) => handleTimeChange(hours, e.target.value)}
              className="w-16 text-center"
            />
          </div>
        </PopoverContent>
      </Popover>
      {value && (
        <Button variant="ghost" size="icon" onClick={() => onChange('')} className="h-8 w-8">
          <X className="h-4 w-4" />
        </Button>
      )}
    </div>
  )
}
