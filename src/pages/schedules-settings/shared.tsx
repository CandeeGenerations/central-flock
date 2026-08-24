import {Button} from '@/components/ui/button'
import {Input} from '@/components/ui/input'
import {Label} from '@/components/ui/label'
import {MultiSelect} from '@/components/ui/multi-select'
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select'
import {Textarea} from '@/components/ui/textarea'
import {type GroupWithMembers, fetchGroup} from '@/lib/api'
import {
  type FooterBlock,
  type Household,
  type SchedulesSettings,
  createHousehold,
  deleteHousehold,
  fetchHouseholds,
  schedulesKeys,
  updateHousehold,
  updateSchedulesSettings,
} from '@/lib/schedules-api'
import {useMutation, useQueries, useQuery, useQueryClient} from '@tanstack/react-query'
import {ArrowDown, ArrowUp, Plus, Trash2, Users} from 'lucide-react'
import {useEffect, useState} from 'react'
import {toast} from 'sonner'

// Shared building blocks for the Schedules Settings sections. Extracted from the
// former single-scroll settings page when it became a left rail of routed
// sections; the components themselves are unchanged.

export function FairBoothFooterEditor({
  label,
  blocks,
  onSave,
}: {
  label: string
  blocks: FooterBlock[]
  onSave: (blocks: FooterBlock[]) => void
}) {
  const [local, setLocal] = useState<FooterBlock[]>(blocks)
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setLocal(blocks), [blocks])
  const dirty = JSON.stringify(local) !== JSON.stringify(blocks)
  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium">{label}</Label>
      <div className="space-y-2">
        {local.map((b, i) => (
          <div key={i} className="bg-muted/30 flex items-start gap-2 rounded border p-2">
            <Select
              value={b.kind}
              onValueChange={(v) =>
                setLocal((prev) => prev.map((x, idx) => (idx === i ? {...x, kind: v as FooterBlock['kind']} : x)))
              }
            >
              <SelectTrigger className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="quote">Quote</SelectItem>
                <SelectItem value="note">Note</SelectItem>
                <SelectItem value="spacer">Spacer</SelectItem>
              </SelectContent>
            </Select>
            {b.kind === 'spacer' ? (
              <div className="text-muted-foreground flex-1 self-center text-xs">— blank line —</div>
            ) : (
              <Textarea
                value={b.text}
                onChange={(e) =>
                  setLocal((prev) => prev.map((x, idx) => (idx === i ? {...x, text: e.target.value} : x)))
                }
                rows={2}
                className="flex-1"
              />
            )}
            <div className="flex flex-col gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                disabled={i === 0}
                onClick={() =>
                  setLocal((prev) => {
                    const next = [...prev]
                    ;[next[i - 1], next[i]] = [next[i], next[i - 1]]
                    return next
                  })
                }
              >
                <ArrowUp className="h-3 w-3" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                disabled={i === local.length - 1}
                onClick={() =>
                  setLocal((prev) => {
                    const next = [...prev]
                    ;[next[i], next[i + 1]] = [next[i + 1], next[i]]
                    return next
                  })
                }
              >
                <ArrowDown className="h-3 w-3" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => setLocal((prev) => prev.filter((_, idx) => idx !== i))}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={() => setLocal((p) => [...p, {kind: 'note', text: ''}])}>
          <Plus className="mr-1 h-3 w-3" /> Note
        </Button>
        <Button variant="outline" size="sm" onClick={() => setLocal((p) => [...p, {kind: 'quote', text: ''}])}>
          <Plus className="mr-1 h-3 w-3" /> Quote
        </Button>
        <Button variant="outline" size="sm" onClick={() => setLocal((p) => [...p, {kind: 'spacer', text: ''}])}>
          <Plus className="mr-1 h-3 w-3" /> Spacer
        </Button>
        <Button disabled={!dirty} size="sm" onClick={() => onSave(local)}>
          Save
        </Button>
      </div>
    </div>
  )
}

export async function saveType(
  queryClient: ReturnType<typeof useQueryClient>,
  body: Parameters<typeof updateSchedulesSettings>[0],
) {
  try {
    await updateSchedulesSettings(body)
    queryClient.invalidateQueries({queryKey: schedulesKeys.settings})
    toast.success('Saved')
  } catch (e) {
    toast.error(e instanceof Error ? e.message : 'Save failed')
  }
}

// ── Title + Footer Blocks editor ────────────────────────────────────────

interface TypeDefaultsCardProps {
  titleLabel: string
  titlePrefix: string
  footerBlocks: FooterBlock[]
  // Rendered between the title prefix and the footer-blocks editor — used to
  // tuck type-specific config (nursery worker counts, special music singer
  // pool) above the footer per UX preference.
  middleSlot?: React.ReactNode
  onSave: (
    patch:
      | Partial<SchedulesSettings['nursery']>
      | Partial<SchedulesSettings['specialMusic']>
      | Partial<SchedulesSettings['musicSchedule']>,
  ) => Promise<void> | void
}

export function TypeDefaultsCard({titleLabel, titlePrefix, footerBlocks, middleSlot, onSave}: TypeDefaultsCardProps) {
  const [prefix, setPrefix] = useState(titlePrefix)
  const [blocks, setBlocks] = useState<FooterBlock[]>(footerBlocks)

  // Re-sync local edit state when the upstream defaults change (e.g. after a
  // successful save invalidates the query and refetches).
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setPrefix(titlePrefix), [titlePrefix])
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setBlocks(footerBlocks), [footerBlocks])

  const dirty = prefix !== titlePrefix || JSON.stringify(blocks) !== JSON.stringify(footerBlocks)

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label className="text-sm font-medium">{titleLabel}</Label>
        <Input value={prefix} onChange={(e) => setPrefix(e.target.value)} />
      </div>

      {middleSlot}

      <div className="space-y-2">
        <Label className="text-sm font-medium">Footer blocks</Label>
        <div className="space-y-2">
          {blocks.map((b, i) => (
            <div key={i} className="bg-muted/30 flex items-start gap-2 rounded border p-2">
              <Select
                value={b.kind}
                onValueChange={(v) =>
                  setBlocks((prev) => prev.map((x, idx) => (idx === i ? {...x, kind: v as FooterBlock['kind']} : x)))
                }
              >
                <SelectTrigger className="w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="quote">Quote</SelectItem>
                  <SelectItem value="note">Note</SelectItem>
                  <SelectItem value="spacer">Spacer</SelectItem>
                </SelectContent>
              </Select>
              {b.kind === 'spacer' ? (
                <div className="text-muted-foreground flex-1 self-center text-xs">— blank line —</div>
              ) : (
                <Textarea
                  value={b.text}
                  onChange={(e) =>
                    setBlocks((prev) => prev.map((x, idx) => (idx === i ? {...x, text: e.target.value} : x)))
                  }
                  rows={2}
                  className="flex-1"
                />
              )}
              <div className="flex flex-col gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  disabled={i === 0}
                  onClick={() =>
                    setBlocks((prev) => {
                      const next = [...prev]
                      ;[next[i - 1], next[i]] = [next[i], next[i - 1]]
                      return next
                    })
                  }
                >
                  <ArrowUp className="h-3 w-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  disabled={i === blocks.length - 1}
                  onClick={() =>
                    setBlocks((prev) => {
                      const next = [...prev]
                      ;[next[i], next[i + 1]] = [next[i + 1], next[i]]
                      return next
                    })
                  }
                >
                  <ArrowDown className="h-3 w-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => setBlocks((prev) => prev.filter((_, idx) => idx !== i))}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setBlocks((p) => [...p, {kind: 'note', text: ''}])}>
            <Plus className="mr-1 h-3 w-3" /> Note
          </Button>
          <Button variant="outline" size="sm" onClick={() => setBlocks((p) => [...p, {kind: 'quote', text: ''}])}>
            <Plus className="mr-1 h-3 w-3" /> Quote
          </Button>
          <Button variant="outline" size="sm" onClick={() => setBlocks((p) => [...p, {kind: 'spacer', text: ''}])}>
            <Plus className="mr-1 h-3 w-3" /> Spacer
          </Button>
        </div>
      </div>

      <div className="flex justify-end">
        <Button disabled={!dirty} onClick={() => onSave({titlePrefix: prefix, footerBlocks: blocks})}>
          Save
        </Button>
      </div>
    </div>
  )
}

// ── Households editor ──────────────────────────────────────────────────

export function HouseholdsSection({singerGroupIds}: {singerGroupIds: number[]}) {
  const queryClient = useQueryClient()
  const {data: households} = useQuery({queryKey: schedulesKeys.households, queryFn: fetchHouseholds})
  const groupQueries = useQueries({
    queries: singerGroupIds.map((gid) => ({queryKey: ['group', gid], queryFn: () => fetchGroup(gid)})),
  })
  const singerPool: {id: number; firstName: string | null; lastName: string | null}[] = [
    ...new Map(
      groupQueries
        .flatMap((q) => (q.data as GroupWithMembers | undefined)?.members ?? [])
        .map((m) => [m.id, {id: m.id, firstName: m.firstName, lastName: m.lastName}]),
    ).values(),
  ].sort((a, b) => (a.firstName ?? '').localeCompare(b.firstName ?? ''))

  const takenPersonIds = new Set((households ?? []).flatMap((h) => h.members.map((m) => m.personId)))

  const [adding, setAdding] = useState(false)
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [newName, setNewName] = useState('')

  const createMut = useMutation({
    mutationFn: ({ids, name}: {ids: number[]; name: string}) => createHousehold(ids, name || undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({queryKey: schedulesKeys.households})
      setAdding(false)
      setSelectedIds([])
      setNewName('')
      toast.success('Household created')
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
  })

  const renameMut = useMutation({
    mutationFn: ({id, name}: {id: number; name: string}) => updateHousehold(id, {name}),
    onSuccess: () => queryClient.invalidateQueries({queryKey: schedulesKeys.households}),
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteHousehold(id),
    onSuccess: () => {
      queryClient.invalidateQueries({queryKey: schedulesKeys.households})
      toast.success('Household removed')
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
  })

  const available = singerPool.filter((p) => !takenPersonIds.has(p.id))

  return (
    <div className="space-y-3 border-t pt-4">
      <div>
        <Label className="text-sm font-medium">Households</Label>
        <p className="text-muted-foreground text-xs">
          People in the same household share one highlighted page when exporting PDFs.
        </p>
      </div>

      {(households ?? []).length > 0 && (
        <div className="space-y-1.5">
          {(households ?? []).map((h) => (
            <HouseholdRow
              key={h.id}
              household={h}
              onRename={renameMut.mutate}
              onDelete={deleteMut.mutate}
              busy={deleteMut.isPending}
            />
          ))}
        </div>
      )}

      {adding ? (
        <div className="space-y-2 rounded border p-3">
          <MultiSelect
            value={selectedIds.map(String)}
            onValueChange={(v) => setSelectedIds(v.map(Number).filter((n) => !Number.isNaN(n)))}
            options={available.map((p) => ({
              value: String(p.id),
              label: [p.firstName, p.lastName].filter(Boolean).join(' ') || `Person ${p.id}`,
            }))}
            placeholder="Pick members"
            className="w-full"
          />
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Household name (e.g. Tyler & Carissa)"
            className="text-sm"
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={selectedIds.length < 2 || createMut.isPending}
              onClick={() => createMut.mutate({ids: selectedIds, name: newName})}
            >
              {createMut.isPending ? 'Creating...' : 'Create'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setAdding(false)
                setSelectedIds([])
                setNewName('')
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="outline" size="sm" onClick={() => setAdding(true)} disabled={available.length < 2}>
          <Plus className="mr-1 h-3 w-3" /> Add Household
        </Button>
      )}
    </div>
  )
}

function HouseholdRow({
  household,
  onRename,
  onDelete,
  busy,
}: {
  household: Household
  onRename: (v: {id: number; name: string}) => void
  onDelete: (id: number) => void
  busy: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(household.name)

  return (
    <div className="bg-muted/30 flex items-center gap-2 rounded border px-3 py-2">
      <Users className="text-muted-foreground h-4 w-4 shrink-0" />
      {editing ? (
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => {
            if (name.trim() && name.trim() !== household.name) onRename({id: household.id, name: name.trim()})
            setEditing(false)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
            if (e.key === 'Escape') {
              setName(household.name)
              setEditing(false)
            }
          }}
          className="h-7 flex-1 text-sm"
          autoFocus
        />
      ) : (
        <button
          type="button"
          className="flex-1 truncate text-left text-sm hover:underline"
          onClick={() => setEditing(true)}
        >
          {household.name || household.members.map((m) => m.firstName || 'Unknown').join(' & ')}
        </button>
      )}
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0"
        onClick={() => onDelete(household.id)}
        disabled={busy}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  )
}
