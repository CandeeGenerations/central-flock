import {Button} from '@/components/ui/button'
import {DatePicker} from '@/components/ui/date-time-picker'
import {Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle} from '@/components/ui/dialog'
import {Input} from '@/components/ui/input'
import {Label} from '@/components/ui/label'
import {MultiSelect} from '@/components/ui/multi-select'
import {SearchableSelect} from '@/components/ui/searchable-select'
import {Tabs, TabsContent, TabsList, TabsTrigger} from '@/components/ui/tabs'
import {fetchGroups} from '@/lib/api'
import {formatDate, formatDateTime} from '@/lib/date'
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
  prefillCalendarEventId?: number
  prefillCalendarEventUid?: string
  prefillName?: string
}

export function RsvpListCreateDialog(props: Props) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>New RSVP List</DialogTitle>
        </DialogHeader>
        {props.open && <CreateForm {...props} />}
      </DialogContent>
    </Dialog>
  )
}

type Mode = 'calendar' | 'standalone'

function CreateForm({
  onOpenChange,
  prefillGroupId,
  prefillCalendarEventId,
  prefillCalendarEventUid,
  prefillName,
}: Props) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const hasCalendarPrefill = Boolean(prefillCalendarEventId || prefillCalendarEventUid)
  const [mode, setMode] = useState<Mode>(hasCalendarPrefill ? 'calendar' : 'standalone')
  const [nameInput, setNameInput] = useState(prefillName || '')
  const [nameTouched, setNameTouched] = useState(Boolean(prefillName))
  const [standaloneDate, setStandaloneDate] = useState('')
  const [standaloneTime, setStandaloneTime] = useState('')
  const [standaloneEndTime, setStandaloneEndTime] = useState('')
  const [groupIds, setGroupIds] = useState<string[]>(prefillGroupId ? [String(prefillGroupId)] : [])

  const {data: groups} = useQuery({queryKey: queryKeys.groups, queryFn: fetchGroups})
  const {data: calendarEvents} = useQuery({
    queryKey: queryKeys.rsvpCalendarEvents,
    queryFn: () => fetchRsvpCalendarEvents(180),
    enabled: mode === 'calendar',
  })

  // Resolve initial calendar event ID from either explicit numeric ID or eventUid.
  const resolvedPrefillId = prefillCalendarEventId
    ? String(prefillCalendarEventId)
    : prefillCalendarEventUid
      ? (calendarEvents?.find((e) => e.eventUid === prefillCalendarEventUid)?.id?.toString() ?? '')
      : ''
  const [calendarEventId, setCalendarEventId] = useState<string>(resolvedPrefillId)
  const [hasResolved, setHasResolved] = useState(Boolean(resolvedPrefillId))
  if (!hasResolved && resolvedPrefillId) {
    setHasResolved(true)
    setCalendarEventId(resolvedPrefillId)
  }

  // When a calendar event is picked, repopulate the date/time fields from the event
  // (user can then override). Reset every time the picked event changes.
  const [lastSyncedEventId, setLastSyncedEventId] = useState('')
  if (mode === 'calendar' && calendarEventId !== lastSyncedEventId && calendarEvents) {
    setLastSyncedEventId(calendarEventId)
    const ev = calendarEvents.find((e) => e.id === Number(calendarEventId))
    if (ev) {
      setStandaloneDate(ev.startDate.slice(0, 10))
      setStandaloneTime(!ev.allDay && ev.startDate.length >= 16 ? ev.startDate.slice(11, 16) : '')
      setStandaloneEndTime(!ev.allDay && ev.endDate && ev.endDate.length >= 16 ? ev.endDate.slice(11, 16) : '')
    }
  }

  // Derived name: if user hasn't typed, default from selected calendar event title.
  const derivedName =
    mode === 'calendar' && calendarEventId
      ? calendarEvents?.find((e) => e.id === Number(calendarEventId))?.title || ''
      : ''
  const name = nameTouched ? nameInput : derivedName || nameInput

  const createMutation = useMutation({
    mutationFn: () =>
      createRsvpList({
        name: name.trim(),
        calendarEventId: mode === 'calendar' && calendarEventId ? Number(calendarEventId) : null,
        standaloneTitle: mode === 'standalone' ? name.trim() : null,
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
          <TabsContent value="calendar" className="space-y-2 mt-3">
            <Label htmlFor="rsvp-calendar-event">Event</Label>
            <SearchableSelect
              value={calendarEventId}
              onValueChange={setCalendarEventId}
              options={(calendarEvents || []).map((ev) => ({
                value: String(ev.id),
                label: `${ev.title} — ${ev.allDay ? formatDate(ev.startDate) : formatDateTime(ev.startDate)}`,
              }))}
              placeholder="Pick a calendar event"
              className="w-full"
            />
          </TabsContent>
        </Tabs>

        <div className="grid grid-cols-3 gap-2">
          <div className="space-y-1">
            <Label htmlFor="rsvp-date">Date{mode === 'calendar' ? ' (override)' : ''}</Label>
            <DatePicker value={standaloneDate} onChange={setStandaloneDate} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="rsvp-time">Start{mode === 'calendar' ? ' (override)' : ' (optional)'}</Label>
            <Input
              id="rsvp-time"
              type="time"
              value={standaloneTime}
              onChange={(e) => setStandaloneTime(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="rsvp-end-time">End{mode === 'calendar' ? ' (override)' : ' (optional)'}</Label>
            <Input
              id="rsvp-end-time"
              type="time"
              value={standaloneEndTime}
              onChange={(e) => setStandaloneEndTime(e.target.value)}
            />
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
