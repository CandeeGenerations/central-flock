import {Button} from '@/components/ui/button'
import {Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle} from '@/components/ui/dialog'
import {Input} from '@/components/ui/input'
import {Label} from '@/components/ui/label'
import {MultiSelect} from '@/components/ui/multi-select'
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select'
import {Tabs, TabsContent, TabsList, TabsTrigger} from '@/components/ui/tabs'
import {fetchGroups} from '@/lib/api'
import {formatDate} from '@/lib/date'
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
  prefillName?: string
}

export function RsvpListCreateDialog(props: Props) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New RSVP List</DialogTitle>
        </DialogHeader>
        {props.open && <CreateForm {...props} />}
      </DialogContent>
    </Dialog>
  )
}

type Mode = 'calendar' | 'standalone'

function CreateForm({onOpenChange, prefillGroupId, prefillCalendarEventId, prefillName}: Props) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [mode, setMode] = useState<Mode>(prefillCalendarEventId ? 'calendar' : 'standalone')
  const [calendarEventId, setCalendarEventId] = useState<string>(
    prefillCalendarEventId ? String(prefillCalendarEventId) : '',
  )
  const [nameInput, setNameInput] = useState(prefillName || '')
  const [nameTouched, setNameTouched] = useState(Boolean(prefillName))
  const [standaloneDate, setStandaloneDate] = useState('')
  const [standaloneTime, setStandaloneTime] = useState('')
  const [groupIds, setGroupIds] = useState<string[]>(prefillGroupId ? [String(prefillGroupId)] : [])

  const {data: groups} = useQuery({queryKey: queryKeys.groups, queryFn: fetchGroups})
  const {data: calendarEvents} = useQuery({
    queryKey: queryKeys.rsvpCalendarEvents,
    queryFn: () => fetchRsvpCalendarEvents(180),
    enabled: mode === 'calendar',
  })

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
        standaloneDate: mode === 'standalone' && standaloneDate ? standaloneDate : null,
        standaloneTime: mode === 'standalone' && standaloneTime ? standaloneTime : null,
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
            <Select value={calendarEventId} onValueChange={setCalendarEventId}>
              <SelectTrigger id="rsvp-calendar-event">
                <SelectValue placeholder="Pick a calendar event" />
              </SelectTrigger>
              <SelectContent>
                {(calendarEvents || []).map((ev) => (
                  <SelectItem key={ev.id} value={String(ev.id)}>
                    {ev.title} — {formatDate(ev.startDate)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </TabsContent>
          <TabsContent value="standalone" className="space-y-2 mt-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label htmlFor="rsvp-date">Date</Label>
                <Input
                  id="rsvp-date"
                  type="date"
                  value={standaloneDate}
                  onChange={(e) => setStandaloneDate(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="rsvp-time">Time (optional)</Label>
                <Input
                  id="rsvp-time"
                  type="time"
                  value={standaloneTime}
                  onChange={(e) => setStandaloneTime(e.target.value)}
                />
              </div>
            </div>
          </TabsContent>
        </Tabs>

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
