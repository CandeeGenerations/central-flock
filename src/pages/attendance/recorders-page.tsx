import {Button} from '@/components/ui/button'
import {Card} from '@/components/ui/card'
import {Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle} from '@/components/ui/dialog'
import {Input} from '@/components/ui/input'
import {Label} from '@/components/ui/label'
import {PageSpinner} from '@/components/ui/spinner'
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from '@/components/ui/table'
import {
  type Recorder,
  createRecorder,
  deleteRecorder,
  fetchAttendanceConfig,
  fetchRecorders,
  regenerateRecorderToken,
  updateRecorder,
} from '@/lib/attendance-api'
import {queryKeys} from '@/lib/query-keys'
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'
import {Copy, Link2, Pencil, Plus, RefreshCw, Trash2} from 'lucide-react'
import {useState} from 'react'
import {toast} from 'sonner'

export function RecordersPage() {
  const qc = useQueryClient()
  const {data: recorders, isLoading} = useQuery({queryKey: queryKeys.attendanceRecorders, queryFn: fetchRecorders})
  const {data: config} = useQuery({queryKey: queryKeys.attendanceConfig, queryFn: fetchAttendanceConfig})
  const base = config?.publicUrlBase ?? ''

  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<Recorder | null>(null)
  const invalidate = () => qc.invalidateQueries({queryKey: queryKeys.attendanceRecorders})

  const createMut = useMutation({
    mutationFn: (name: string) => createRecorder(name),
    onSuccess: () => {
      invalidate()
      setCreating(false)
      toast.success('Recorder added')
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
  })
  const saveMut = useMutation({
    mutationFn: ({id, name}: {id: number; name: string}) => updateRecorder(id, {name}),
    onSuccess: () => {
      invalidate()
      setEditing(null)
      toast.success('Saved')
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
  })
  const toggleMut = useMutation({
    mutationFn: ({id, active}: {id: number; active: boolean}) => updateRecorder(id, {active}),
    onSuccess: invalidate,
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
  })
  const regenMut = useMutation({
    mutationFn: (id: number) => regenerateRecorderToken(id),
    onSuccess: () => {
      invalidate()
      toast.success('New link generated — old link is now invalid')
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
  })
  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteRecorder(id),
    onSuccess: () => {
      invalidate()
      toast.success('Recorder deleted')
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
  })

  function linkFor(r: Recorder) {
    return `${base}/r/${r.token}`
  }
  async function copyLink(r: Recorder) {
    if (!base) {
      toast.error('ATTENDANCE_PUBLIC_URL_BASE not configured')
      return
    }
    await navigator.clipboard.writeText(linkFor(r))
    toast.success(`Copied link for ${r.name}`)
  }

  if (isLoading) return <PageSpinner />
  const list = recorders ?? []

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Recorders</h2>
        <Button onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Add Recorder
        </Button>
      </div>
      {!base && (
        <p className="text-sm text-muted-foreground">
          Set <code>ATTENDANCE_PUBLIC_URL_BASE</code> to enable copy-link.
        </p>
      )}

      <Card size="sm">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="text-center">Edits</TableHead>
                <TableHead className="text-center">Active</TableHead>
                <TableHead className="w-48">Link</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.map((r) => (
                <TableRow key={r.id} className={r.active ? '' : 'opacity-50'}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell className="text-center text-muted-foreground">{r.editCount}</TableCell>
                  <TableCell className="text-center">
                    <Button variant="ghost" size="sm" onClick={() => toggleMut.mutate({id: r.id, active: !r.active})}>
                      {r.active ? 'Active' : 'Retired'}
                    </Button>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="outline" size="sm" disabled={!base} onClick={() => copyLink(r)}>
                        <Copy className="h-3.5 w-3.5 mr-1" />
                        Copy
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Regenerate link (invalidates old)"
                        onClick={() => regenMut.mutate(r.id)}
                      >
                        <RefreshCw className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => setEditing(r)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={r.editCount > 0}
                        title={r.editCount > 0 ? 'Retire instead — has history' : 'Delete'}
                        onClick={() => deleteMut.mutate(r.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {list.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    <Link2 className="h-5 w-5 mx-auto mb-2 opacity-50" />
                    No recorders yet. Add one to generate a link.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      <RecorderDialog
        open={creating || !!editing}
        initial={editing}
        pending={createMut.isPending || saveMut.isPending}
        onClose={() => {
          setCreating(false)
          setEditing(null)
        }}
        onSave={(name) => (editing ? saveMut.mutate({id: editing.id, name}) : createMut.mutate(name))}
      />
    </div>
  )
}

function RecorderDialog(props: {
  open: boolean
  initial: Recorder | null
  pending: boolean
  onClose: () => void
  onSave: (name: string) => void
}) {
  const {open, initial, pending, onClose, onSave} = props
  const [name, setName] = useState('')
  const [lastKey, setLastKey] = useState<string | number>('')
  const targetKey = initial?.id ?? 'new'
  if (open && lastKey !== targetKey) {
    setLastKey(targetKey)
    setName(initial?.name ?? '')
  }
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{initial ? 'Edit Recorder' : 'Add Recorder'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="rec-name">Name</Label>
          <Input id="rec-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Smith" />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={pending || !name.trim()} onClick={() => onSave(name.trim())}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
