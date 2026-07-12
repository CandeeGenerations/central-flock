import {Button} from '@/components/ui/button'
import {DatePicker} from '@/components/ui/date-time-picker'
import {Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle} from '@/components/ui/dialog'
import {Input} from '@/components/ui/input'
import {Label} from '@/components/ui/label'
import {MultiSelect} from '@/components/ui/multi-select'
import {SearchableSelect} from '@/components/ui/searchable-select'
import {Tabs, TabsContent, TabsList, TabsTrigger} from '@/components/ui/tabs'
import {fetchGroups} from '@/lib/api'
import {formatDate, formatDateTime, localDateFromUTC, localTimeFromUTC} from '@/lib/date'
import {queryKeys} from '@/lib/query-keys'
import {createRsvpList, fetchRsvpCalendarEvents} from '@/lib/rsvp-api'
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'
import {useState} from 'react'
import {useNavigate} from 'react-router-dom'
import {toast} from 'sonner'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  prefillGroupId?: number
  prefillCalendarEventUid?: string
  prefillName?: string
}

export function RsvpListCreateDialog(props: Props) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-w-3xl sm:max-h-[calc(100vh-1rem)]">
        <DialogHeader>
          <DialogTitle>New RSVP List</DialogTitle>
        </DialogHeader>
        {props.open && <CreateForm {...props} />}
      </DialogContent>
    </Dialog>
  )
}

type Mode = 'calendar' | 'standalone'

function CreateForm({onOpenChange, prefillGroupId, prefillCalendarEventUid, prefillName}: Props) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const hasCalendarPrefill = Boolean(prefillCalendarEventUid)
  const [mode, setMode] = useState<Mode>(hasCalendarPrefill ? 'calendar' : 'standalone')
  const [nameInput, setNameInput] = useState(prefillName || '')
  const [nameTouched, setNameTouched] = useState(Boolean(prefillName))
  const [standaloneDate, setStandaloneDate] = useState('')
  const [standaloneTime, setStandaloneTime] = useState('')
  const [standaloneEndTime, setStandaloneEndTime] = useState('')
  const [eventTitleOverride, setEventTitleOverride] = useState('')
  const [groupIds, setGroupIds] = useState<string[]>(prefillGroupId ? [String(prefillGroupId)] : [])

  const {data: groups} = useQuery({queryKey: queryKeys.groups, queryFn: fetchGroups})
  const {data: calendarEvents} = useQuery({
    queryKey: queryKeys.rsvpCalendarEvents,
    queryFn: () => fetchRsvpCalendarEvents(180),
    enabled: mode === 'calendar',
  })

  // Link by the stable event_uid (prefill is already a uid).
  const [calendarEventUid, setCalendarEventUid] = useState<string>(prefillCalendarEventUid ?? '')

  // When a calendar event is picked, repopulate the date/time fields from the event
  // (user can then override). Reset every time the picked event changes.
  const [lastSyncedEventUid, setLastSyncedEventUid] = useState('')
  if (mode === 'calendar' && calendarEventUid !== lastSyncedEventUid && calendarEvents) {
    setLastSyncedEventUid(calendarEventUid)
    const ev = calendarEvents.find((e) => e.eventUid === calendarEventUid)
    if (ev) {
      setStandaloneDate(ev.allDay ? ev.startDate.slice(0, 10) : localDateFromUTC(ev.startDate))
      setStandaloneTime(!ev.allDay ? localTimeFromUTC(ev.startDate) : '')
      setStandaloneEndTime(!ev.allDay && ev.endDate ? localTimeFromUTC(ev.endDate) : '')
    }
  }

  // Derived name: if user hasn't typed, default from selected calendar event title.
  const derivedName =
    mode === 'calendar' && calendarEventUid
      ? calendarEvents?.find((e) => e.eventUid === calendarEventUid)?.title || ''
      : ''
  const name = nameTouched ? nameInput : derivedName || nameInput

  const createMutation = useMutation({
    mutationFn: () =>
      createRsvpList({
        name: name.trim(),
        calendarEventUid: mode === 'calendar' && calendarEventUid ? calendarEventUid : null,
        standaloneTitle: mode === 'calendar' ? eventTitleOverride.trim() || null : name.trim(),
        standaloneDate: standaloneDate || null,
        standaloneTime: standaloneTime || null,
        standaloneEndTime: standaloneEndTime || null,
        seedGroupIds: groupIds.map((g) => Number(g)),
      }),
    onSuccess: (list) => {
      queryClient.invalidateQueries({queryKey: ['rsvpLists']})
      toast.success('RSVP list created')
      onOpenChange(false)
      navigate(`/rsvp/${list.id}`)
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const canSubmit =
    name.trim().length > 0 && (mode === 'calendar' ? Boolean(calendarEventUid) : Boolean(standaloneDate))

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
              <Label htmlFor="rsvp-calendar-event">Event</Label>
              <SearchableSelect
                value={calendarEventUid}
                onValueChange={setCalendarEventUid}
                options={(calendarEvents || []).map((ev) => ({
                  value: ev.eventUid,
                  label: `${ev.title} — ${ev.allDay ? formatDate(ev.startDate) : formatDateTime(ev.startDate)}`,
                }))}
                placeholder="Pick a calendar event"
                className="w-full"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="rsvp-title-override">Event title (override, optional)</Label>
              <Input
                id="rsvp-title-override"
                value={eventTitleOverride}
                onChange={(e) => setEventTitleOverride(e.target.value)}
                placeholder="Leave blank to use the calendar event title"
              />
            </div>
          </TabsContent>
        </Tabs>

        <div className="space-y-2">
          <div className="space-y-1">
            <Label htmlFor="rsvp-date">Date{mode === 'calendar' ? ' (override)' : ''}</Label>
            <DatePicker value={standaloneDate} onChange={setStandaloneDate} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor="rsvp-time">Start{mode === 'calendar' ? ' (override)' : ' (optional)'}</Label>
              <Input
                id="rsvp-time"
                type="time"
                value={standaloneTime}
                onChange={(e) => setStandaloneTime(e.target.value)}
                className="max-w-[10rem]"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="rsvp-end-time">End{mode === 'calendar' ? ' (override)' : ' (optional)'}</Label>
              <Input
                id="rsvp-end-time"
                type="time"
                value={standaloneEndTime}
                onChange={(e) => setStandaloneEndTime(e.target.value)}
                className="max-w-[10rem]"
              />
            </div>
          </div>
        </div>

        <div className="space-y-1">
          <Label htmlFor="rsvp-name">List name</Label>
          <Input
            id="rsvp-name"
            value={name}
            onChange={(e) => {
              setNameInput(e.target.value)
              setNameTouched(true)
            }}
            placeholder="e.g. Extravaganza — Members"
          />
        </div>

        <div className="space-y-1">
          <Label>Seed from groups (optional)</Label>
          <MultiSelect
            value={groupIds}
            onValueChange={setGroupIds}
            options={(groups || []).map((g) => ({value: String(g.id), label: g.name}))}
            allLabel="All groups"
            placeholder="Pick groups to seed"
            className="w-full"
          />
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button disabled={!canSubmit || createMutation.isPending} onClick={() => createMutation.mutate()}>
          {createMutation.isPending ? 'Creating…' : 'Create'}
        </Button>
      </DialogFooter>
    </>
  )
}
