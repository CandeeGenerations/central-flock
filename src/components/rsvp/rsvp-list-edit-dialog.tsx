import {Button} from '@/components/ui/button'
import {DatePicker} from '@/components/ui/date-time-picker'
import {Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle} from '@/components/ui/dialog'
import {Input} from '@/components/ui/input'
import {Label} from '@/components/ui/label'
import {SearchableSelect} from '@/components/ui/searchable-select'
import {Tabs, TabsContent, TabsList, TabsTrigger} from '@/components/ui/tabs'
import {formatDate, formatDateTime, localDateFromUTC, localTimeFromUTC} from '@/lib/date'
import {queryKeys} from '@/lib/query-keys'
import {type RsvpListDetail, fetchRsvpCalendarEvents, updateRsvpList} from '@/lib/rsvp-api'
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'
import {useState} from 'react'
import {toast} from 'sonner'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  list: RsvpListDetail
}

type Mode = 'calendar' | 'standalone'

export function RsvpListEditDialog({open, onOpenChange, list}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl sm:max-h-[calc(100vh-1rem)]">
        <DialogHeader>
          <DialogTitle>Edit RSVP List</DialogTitle>
        </DialogHeader>
        {open && <EditForm list={list} onOpenChange={onOpenChange} />}
      </DialogContent>
    </Dialog>
  )
}

function EditForm({list, onOpenChange}: {list: RsvpListDetail; onOpenChange: (open: boolean) => void}) {
  const queryClient = useQueryClient()
  const [mode, setMode] = useState<Mode>(list.calendarEventId ? 'calendar' : 'standalone')
  const [name, setName] = useState(list.name)
  const [calendarEventId, setCalendarEventId] = useState<string>(
    list.calendarEventId ? String(list.calendarEventId) : '',
  )
  const [standaloneDate, setStandaloneDate] = useState(list.standaloneDate || '')
  const [standaloneTime, setStandaloneTime] = useState(list.standaloneTime || '')
  const [standaloneEndTime, setStandaloneEndTime] = useState(list.standaloneEndTime || '')
  // In calendar mode this acts as the {{eventTitle}} override.
  const [eventTitleOverride, setEventTitleOverride] = useState(list.calendarEventId ? list.standaloneTitle || '' : '')

  const {data: calendarEvents} = useQuery({
    queryKey: queryKeys.rsvpCalendarEvents,
    queryFn: () => fetchRsvpCalendarEvents(180),
    enabled: mode === 'calendar',
  })

  // When the user picks a different calendar event, repopulate date/time from that event
  // (user can then override). Initial mount keeps the persisted override values.
  const [lastSyncedEventId, setLastSyncedEventId] = useState(calendarEventId)
  if (mode === 'calendar' && calendarEventId !== lastSyncedEventId && calendarEvents) {
    setLastSyncedEventId(calendarEventId)
    const ev = calendarEvents.find((e) => e.id === Number(calendarEventId))
    if (ev) {
      setStandaloneDate(ev.allDay ? ev.startDate.slice(0, 10) : localDateFromUTC(ev.startDate))
      setStandaloneTime(!ev.allDay ? localTimeFromUTC(ev.startDate) : '')
      setStandaloneEndTime(!ev.allDay && ev.endDate ? localTimeFromUTC(ev.endDate) : '')
    }
  }

  // Synthesize an option for the currently-linked event so the picker shows it
  // even before the fetch resolves, or when the event is filtered out (past date,
  // recurring, or beyond the 180-day window).
  const eventOptions = (() => {
    const fmt = (ev: {startDate: string; allDay: boolean}) =>
      ev.allDay ? formatDate(ev.startDate) : formatDateTime(ev.startDate)
    const base = (calendarEvents || []).map((ev) => ({
      value: String(ev.id),
      label: `${ev.title} — ${fmt(ev)}`,
    }))
    if (
      list.calendarEventId &&
      list.calendarEventTitle &&
      !base.some((o) => o.value === String(list.calendarEventId))
    ) {
      // Linked event isn't in the fetch result; assume timed (allDay flag not available here).
      base.unshift({
        value: String(list.calendarEventId),
        label: `${list.calendarEventTitle}${list.calendarEventStartDate ? ` — ${formatDateTime(list.calendarEventStartDate)}` : ''}`,
      })
    }
    return base
  })()

  const updateMutation = useMutation({
    mutationFn: () =>
      updateRsvpList(list.id, {
        name: name.trim(),
        calendarEventId: mode === 'calendar' ? (calendarEventId ? Number(calendarEventId) : null) : null,
        standaloneTitle: mode === 'calendar' ? eventTitleOverride.trim() || null : name.trim(),
        standaloneDate: standaloneDate || null,
        standaloneTime: standaloneTime || null,
        standaloneEndTime: standaloneEndTime || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({queryKey: queryKeys.rsvpList(list.id)})
      queryClient.invalidateQueries({queryKey: ['rsvpLists']})
      toast.success('RSVP list updated')
      onOpenChange(false)
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const canSubmit = name.trim().length > 0 && (mode === 'calendar' ? Boolean(calendarEventId) : Boolean(standaloneDate))

  return (
    <>
      <div className="space-y-4">
        <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)}>
          <TabsList className="w-full">
            <TabsTrigger value="calendar" className="flex-1">
              Calendar event
            </TabsTrigger>
            <TabsTrigger value="standalone" className="flex-1">
              Standalone
            </TabsTrigger>
          </TabsList>
          <TabsContent value="calendar" className="space-y-3 mt-3">
            <div className="space-y-1">
              <Label htmlFor="rsvp-edit-event">Event</Label>
              <SearchableSelect
                value={calendarEventId}
                onValueChange={setCalendarEventId}
                options={eventOptions}
                placeholder="Pick a calendar event"
                className="w-full"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="rsvp-edit-title-override">Event title (override, optional)</Label>
              <Input
                id="rsvp-edit-title-override"
                value={eventTitleOverride}
                onChange={(e) => setEventTitleOverride(e.target.value)}
                placeholder="Leave blank to use the calendar event title"
              />
            </div>
          </TabsContent>
        </Tabs>

        <div className="space-y-2">
          <div className="space-y-1">
            <Label htmlFor="rsvp-edit-date">Date{mode === 'calendar' ? ' (override)' : ''}</Label>
            <DatePicker value={standaloneDate} onChange={setStandaloneDate} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor="rsvp-edit-time">Start{mode === 'calendar' ? ' (override)' : ' (optional)'}</Label>
              <Input
                id="rsvp-edit-time"
                type="time"
                value={standaloneTime}
                onChange={(e) => setStandaloneTime(e.target.value)}
                className="max-w-[10rem]"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="rsvp-edit-end-time">End{mode === 'calendar' ? ' (override)' : ' (optional)'}</Label>
              <Input
                id="rsvp-edit-end-time"
                type="time"
                value={standaloneEndTime}
                onChange={(e) => setStandaloneEndTime(e.target.value)}
                className="max-w-[10rem]"
              />
            </div>
          </div>
        </div>

        <div className="space-y-1">
          <Label htmlFor="rsvp-edit-name">List name</Label>
          <Input id="rsvp-edit-name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button disabled={!canSubmit || updateMutation.isPending} onClick={() => updateMutation.mutate()}>
          {updateMutation.isPending ? 'Saving…' : 'Save'}
        </Button>
      </DialogFooter>
    </>
  )
}
