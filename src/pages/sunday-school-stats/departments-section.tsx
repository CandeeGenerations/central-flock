import {Button} from '@/components/ui/button'
import {Card} from '@/components/ui/card'
import {Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle} from '@/components/ui/dialog'
import {Input} from '@/components/ui/input'
import {Label} from '@/components/ui/label'
import {PageSpinner} from '@/components/ui/spinner'
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from '@/components/ui/table'
import {queryKeys} from '@/lib/query-keys'
import {
  type SundaySchoolDepartment,
  createDepartment,
  deleteDepartment,
  fetchDepartments,
  reorderDepartments,
  updateDepartment,
} from '@/lib/sunday-school-stats-api'
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'
import {ArrowDown, ArrowUp, Pencil, Plus, Trash2} from 'lucide-react'
import {useState} from 'react'
import {toast} from 'sonner'

export function SundaySchoolDepartmentsSection() {
  const qc = useQueryClient()
  const key = queryKeys.sundaySchoolDepartments(true)
  const {data: departments, isLoading} = useQuery({queryKey: key, queryFn: () => fetchDepartments(true)})

  const [editing, setEditing] = useState<SundaySchoolDepartment | null>(null)
  const [creating, setCreating] = useState(false)

  // Renaming or retiring a department changes what every chart series is
  // labelled, so the grid and series caches go too.
  const invalidate = () => {
    qc.invalidateQueries({queryKey: ['sundaySchoolDepartments']})
    qc.invalidateQueries({queryKey: ['sundaySchoolGrid']})
    qc.invalidateQueries({queryKey: ['sundaySchoolSeries']})
  }

  const saveMutation = useMutation({
    mutationFn: (data: {id?: number; name: string}) =>
      data.id ? updateDepartment(data.id, {name: data.name}) : createDepartment(data.name),
    onSuccess: () => {
      invalidate()
      setEditing(null)
      setCreating(false)
      toast.success('Department saved')
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Save failed'),
  })

  const toggleMutation = useMutation({
    mutationFn: ({id, active}: {id: number; active: boolean}) => updateDepartment(id, {active}),
    onSuccess: invalidate,
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Update failed'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteDepartment(id),
    onSuccess: () => {
      invalidate()
      toast.success('Department deleted')
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Delete failed'),
  })

  const reorderMutation = useMutation({
    mutationFn: (ids: number[]) => reorderDepartments(ids),
    onSuccess: invalidate,
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Reorder failed'),
  })

  function move(index: number, dir: -1 | 1) {
    if (!departments) return
    const ids = departments.map((d) => d.id)
    const j = index + dir
    if (j < 0 || j >= ids.length) return
    ;[ids[index], ids[j]] = [ids[j], ids[index]]
    reorderMutation.mutate(ids)
  }

  if (isLoading) return <PageSpinner />
  const list = departments ?? []

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground text-sm">
          The age bands Sunday School counts are recorded against, in the order they appear across the weekly grid.
          Separate from the Sunday School Roll&rsquo;s classes, which are free text on the printed sheet.
        </p>
        <Button onClick={() => setCreating(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Add Department
        </Button>
      </div>

      <Card size="sm">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-20">Order</TableHead>
                <TableHead>Name</TableHead>
                <TableHead className="text-center">Weeks recorded</TableHead>
                <TableHead className="text-center">Active</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.map((d, i) => (
                <TableRow key={d.id} className={d.active ? '' : 'opacity-50'}>
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
                  <TableCell className="font-medium">{d.name}</TableCell>
                  <TableCell className="text-muted-foreground text-center">{d.countCount}</TableCell>
                  <TableCell className="text-center">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleMutation.mutate({id: d.id, active: !d.active})}
                    >
                      {d.active ? 'Active' : 'Retired'}
                    </Button>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => setEditing(d)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={d.countCount > 0}
                        title={d.countCount > 0 ? 'Retire instead — it has recorded weeks' : 'Delete'}
                        onClick={() => deleteMutation.mutate(d.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {list.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-muted-foreground py-8 text-center">
                    No departments yet. Add one to get started.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      <DepartmentDialog
        open={creating || !!editing}
        initial={editing}
        pending={saveMutation.isPending}
        onClose={() => {
          setCreating(false)
          setEditing(null)
        }}
        onSave={(name) => saveMutation.mutate(editing ? {id: editing.id, name} : {name})}
      />
    </div>
  )
}

function DepartmentDialog(props: {
  open: boolean
  initial: SundaySchoolDepartment | null
  pending: boolean
  onClose: () => void
  onSave: (name: string) => void
}) {
  const {open, initial, pending, onClose, onSave} = props
  const [name, setName] = useState('')

  // Reset fields whenever the dialog target changes.
  const targetKey = initial?.id ?? 'new'
  const [lastKey, setLastKey] = useState<string | number>('')
  if (open && lastKey !== targetKey) {
    setLastKey(targetKey)
    setName(initial?.name ?? '')
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{initial ? 'Edit Department' : 'Add Department'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="ss-dept-name">Name</Label>
          <Input
            id="ss-dept-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="6th-12th"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && name.trim()) onSave(name.trim())
            }}
          />
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
