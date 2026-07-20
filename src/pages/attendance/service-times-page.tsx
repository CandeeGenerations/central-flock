import {Button} from '@/components/ui/button'
import {Card} from '@/components/ui/card'
import {Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle} from '@/components/ui/dialog'
import {Input} from '@/components/ui/input'
import {Label} from '@/components/ui/label'
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select'
import {PageSpinner} from '@/components/ui/spinner'
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from '@/components/ui/table'
import {
  DAY_NAMES,
  type ServiceTime,
  createServiceTime,
  deleteServiceTime,
  fetchServiceTimes,
  reorderServiceTimes,
  updateServiceTime,
} from '@/lib/attendance-api'
import {queryKeys} from '@/lib/query-keys'
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'
import {ArrowDown, ArrowUp, Pencil, Plus, Trash2} from 'lucide-react'
import {useState} from 'react'
import {toast} from 'sonner'

function formatTime(t: string) {
  const [h, m] = t.split(':').map(Number)
  const ampm = h >= 12 ? 'pm' : 'am'
  const h12 = h % 12 || 12
  return `${h12}:${String(m).padStart(2, '0')}${ampm}`
}

export function ServiceTimesPage() {
  const qc = useQueryClient()
  const key = queryKeys.serviceTimes(true)
  const {data: times, isLoading} = useQuery({queryKey: key, queryFn: () => fetchServiceTimes(true)})

  const [editing, setEditing] = useState<ServiceTime | null>(null)
  const [creating, setCreating] = useState(false)

  const invalidate = () => qc.invalidateQueries({queryKey: ['serviceTimes']})

  const saveMutation = useMutation({
    mutationFn: (data: {id?: number; name: string; dayOfWeek: number; time: string}) =>
      data.id
        ? updateServiceTime(data.id, {name: data.name, dayOfWeek: data.dayOfWeek, time: data.time})
        : createServiceTime({name: data.name, dayOfWeek: data.dayOfWeek, time: data.time}),
    onSuccess: () => {
      invalidate()
      setEditing(null)
      setCreating(false)
      toast.success('Service time saved')
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Save failed'),
  })

  const toggleMutation = useMutation({
    mutationFn: ({id, active}: {id: number; active: boolean}) => updateServiceTime(id, {active}),
    onSuccess: invalidate,
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Update failed'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteServiceTime(id),
    onSuccess: () => {
      invalidate()
      toast.success('Service time deleted')
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Delete failed'),
  })

  const reorderMutation = useMutation({
    mutationFn: (ids: number[]) => reorderServiceTimes(ids),
    onSuccess: invalidate,
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Reorder failed'),
  })

  function move(index: number, dir: -1 | 1) {
    if (!times) return
    const ids = times.map((t) => t.id)
    const j = index + dir
    if (j < 0 || j >= ids.length) return
    ;[ids[index], ids[j]] = [ids[j], ids[index]]
    reorderMutation.mutate(ids)
  }

  if (isLoading) return <PageSpinner />
  const list = times ?? []

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Service Times</h2>
        <Button onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Add Service Time
        </Button>
      </div>

      <Card size="sm">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-20">Order</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Day</TableHead>
                <TableHead>Time</TableHead>
                <TableHead className="text-center">Records</TableHead>
                <TableHead className="text-center">Active</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.map((st, i) => (
                <TableRow key={st.id} className={st.active ? '' : 'opacity-50'}>
                  <TableCell>
                    <div className="flex gap-0.5">
                      <Button variant="ghost" size="icon" disabled={i === 0} onClick={() => move(i, -1)}>
                        <ArrowUp className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" disabled={i === list.length - 1} onClick={() => move(i, 1)}>
                        <ArrowDown className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell className="font-medium">{st.name}</TableCell>
                  <TableCell>{DAY_NAMES[st.dayOfWeek]}</TableCell>
                  <TableCell>{formatTime(st.time)}</TableCell>
                  <TableCell className="text-center text-muted-foreground">{st.recordCount}</TableCell>
                  <TableCell className="text-center">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleMutation.mutate({id: st.id, active: !st.active})}
                    >
                      {st.active ? 'Active' : 'Retired'}
                    </Button>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => setEditing(st)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={st.recordCount > 0}
                        title={st.recordCount > 0 ? 'Retire instead — it has records' : 'Delete'}
                        onClick={() => deleteMutation.mutate(st.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {list.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    No service times yet. Add one to get started.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      <ServiceTimeDialog
        open={creating || !!editing}
        initial={editing}
        pending={saveMutation.isPending}
        onClose={() => {
          setCreating(false)
          setEditing(null)
        }}
        onSave={(data) => saveMutation.mutate(editing ? {id: editing.id, ...data} : data)}
      />
    </div>
  )
}

function ServiceTimeDialog(props: {
  open: boolean
  initial: ServiceTime | null
  pending: boolean
  onClose: () => void
  onSave: (data: {name: string; dayOfWeek: number; time: string}) => void
}) {
  const {open, initial, pending, onClose, onSave} = props
  const [name, setName] = useState('')
  const [dayOfWeek, setDayOfWeek] = useState('0')
  const [time, setTime] = useState('09:45')

  // Reset fields whenever the dialog target changes.
  const targetKey = initial?.id ?? 'new'
  const [lastKey, setLastKey] = useState<string | number>('')
  if (open && lastKey !== targetKey) {
    setLastKey(targetKey)
    setName(initial?.name ?? '')
    setDayOfWeek(String(initial?.dayOfWeek ?? 0))
    setTime(initial?.time ?? '09:45')
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{initial ? 'Edit Service Time' : 'Add Service Time'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="st-name">Name</Label>
            <Input id="st-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Sunday 11:00am" />
          </div>
          <div className="space-y-1.5">
            <Label>Day</Label>
            <Select value={dayOfWeek} onValueChange={setDayOfWeek}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DAY_NAMES.map((d, i) => (
                  <SelectItem key={i} value={String(i)}>
                    {d}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="st-time">Time</Label>
            <Input id="st-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={pending || !name.trim()}
            onClick={() => onSave({name: name.trim(), dayOfWeek: Number(dayOfWeek), time})}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
