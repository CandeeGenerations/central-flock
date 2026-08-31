import {Button} from '@/components/ui/button'
import {Card} from '@/components/ui/card'
import {Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle} from '@/components/ui/dialog'
import {Input} from '@/components/ui/input'
import {Label} from '@/components/ui/label'
import {PageSpinner} from '@/components/ui/spinner'
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from '@/components/ui/table'
import {
  type Household,
  createHousehold,
  deleteHousehold,
  fetchHouseholds,
  reorderHouseholds,
  updateHousehold,
} from '@/lib/fill-america-api'
import {queryKeys} from '@/lib/query-keys'
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'
import {ArrowDown, ArrowUp, Pencil, Plus, Trash2} from 'lucide-react'
import {useState} from 'react'
import {toast} from 'sonner'

export function FillAmericaHouseholdsSection() {
  const qc = useQueryClient()
  const key = queryKeys.fillAmericaHouseholds(true)
  const {data: departments, isLoading} = useQuery({queryKey: key, queryFn: () => fetchHouseholds(true)})

  const [editing, setEditing] = useState<Household | null>(null)
  const [creating, setCreating] = useState(false)

  // A household name shows on every campaign roster it appears on, so the
  // campaign caches go too.
  const invalidate = () => {
    qc.invalidateQueries({queryKey: ['fillAmericaHouseholds']})
    qc.invalidateQueries({queryKey: ['fillAmericaCampaigns']})
    qc.invalidateQueries({queryKey: ['fillAmericaCampaign']})
  }

  const saveMutation = useMutation({
    mutationFn: (data: {id?: number; name: string}) =>
      data.id ? updateHousehold(data.id, {name: data.name}) : createHousehold(data.name),
    onSuccess: () => {
      invalidate()
      setEditing(null)
      setCreating(false)
      toast.success('Household saved')
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Save failed'),
  })

  const toggleMutation = useMutation({
    mutationFn: ({id, active}: {id: number; active: boolean}) => updateHousehold(id, {active}),
    onSuccess: invalidate,
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Update failed'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteHousehold(id),
    onSuccess: () => {
      invalidate()
      toast.success('Household deleted')
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Delete failed'),
  })

  const reorderMutation = useMutation({
    mutationFn: (ids: number[]) => reorderHouseholds(ids),
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
          The families and individuals Fill America tracts are recorded against. Reused by every campaign, which is what
          lets a household&rsquo;s totals span four years. Headcount is not here &mdash; it is stored per campaign,
          because families grow.
        </p>
        <Button onClick={() => setCreating(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Add Household
        </Button>
      </div>

      <Card size="sm">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-20">Order</TableHead>
                <TableHead>Name</TableHead>
                <TableHead className="text-center">Campaigns</TableHead>
                <TableHead className="text-right">Total tracts</TableHead>
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
                  <TableCell className="text-muted-foreground text-center tabular-nums">{d.campaignCount}</TableCell>
                  <TableCell className="text-muted-foreground text-right tabular-nums">
                    {d.totalTracts.toLocaleString()}
                  </TableCell>
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
                        disabled={d.campaignCount > 0}
                        title={d.campaignCount > 0 ? 'Retire instead — it is on a campaign roster' : 'Delete'}
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
                  <TableCell colSpan={6} className="text-muted-foreground py-8 text-center">
                    No households yet. Add one to get started.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      <HouseholdDialog
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

function HouseholdDialog(props: {
  open: boolean
  initial: Household | null
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
          <DialogTitle>{initial ? 'Edit Household' : 'Add Household'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="fa-household-name">Name</Label>
          <Input
            id="fa-household-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Newcombs"
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
