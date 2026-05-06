import {Button} from '@/components/ui/button'
import {Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle} from '@/components/ui/dialog'
import {Input} from '@/components/ui/input'
import {Label} from '@/components/ui/label'
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select'
import {Tabs, TabsContent, TabsList, TabsTrigger} from '@/components/ui/tabs'
import {formatDate} from '@/lib/date'
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
      <DialogContent className="max-w-md">
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

  const {data: calendarEvents} = useQuery({
    queryKey: queryKeys.rsvpCalendarEvents,
    queryFn: () => fetchRsvpCalendarEvents(180),
    enabled: mode === 'calendar',
  })

  const updateMutation = useMutation({
    mutationFn: () =>
      updateRsvpList(list.id, {
        name: name.trim(),
        calendarEventId: mode === 'calendar' ? (calendarEventId ? Number(calendarEventId) : null) : null,
        standaloneTitle: mode === 'standalone' ? name.trim() : null,
        standaloneDate: mode === 'standalone' ? standaloneDate || null : null,
        standaloneTime: mode === 'standalone' ? standaloneTime || null : null,
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
          <TabsContent value="calendar" className="space-y-2 mt-3">
            <Label htmlFor="rsvp-edit-event">Event</Label>
            <Select value={calendarEventId} onValueChange={setCalendarEventId}>
              <SelectTrigger id="rsvp-edit-event">
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
                <Label htmlFor="rsvp-edit-date">Date</Label>
                <Input
                  id="rsvp-edit-date"
                  type="date"
                  value={standaloneDate}
                  onChange={(e) => setStandaloneDate(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="rsvp-edit-time">Time (optional)</Label>
                <Input
                  id="rsvp-edit-time"
                  type="time"
                  value={standaloneTime}
                  onChange={(e) => setStandaloneTime(e.target.value)}
                />
              </div>
            </div>
          </TabsContent>
        </Tabs>

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
