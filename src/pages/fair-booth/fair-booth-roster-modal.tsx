import {Button} from '@/components/ui/button'
import {Checkbox} from '@/components/ui/checkbox'
import {Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle} from '@/components/ui/dialog'
import {Input} from '@/components/ui/input'
import {Label} from '@/components/ui/label'
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select'
import {updatePerson} from '@/lib/api'
import {
  type FairBoothFairRole,
  type FairBoothRosterAttr,
  deleteFairBoothRosterAttrs,
  schedulesKeys,
  upsertFairBoothRosterAttrs,
} from '@/lib/schedules-api'
import {useMutation, useQueryClient} from '@tanstack/react-query'
import {useState} from 'react'
import {toast} from 'sonner'

interface Props {
  scheduleId: number
  personId: number
  person: {id: number; firstName: string | null; lastName: string | null; isHispanic: boolean}
  attrs: FairBoothRosterAttr | null
  signupCount: number
  onClose: () => void
  onShowShifts: () => void
}

const FAIR_ROLES: {value: FairBoothFairRole; label: string}[] = [
  {value: 'worker', label: '★ Worker'},
  {value: 'asst_unit', label: '★★ Asst Unit Leader'},
  {value: 'unit_leader', label: '★★★ Unit Leader'},
  {value: 'asst_fair_mgr', label: '★★★★ Asst Fair Manager'},
  {value: 'fair_mgr', label: '★★★★★ Fair Manager'},
]

export function FairBoothRosterModal({scheduleId, personId, person, attrs, signupCount, onClose, onShowShifts}: Props) {
  const queryClient = useQueryClient()
  const [override, setOverride] = useState(attrs?.initialsOverride ?? '')
  const [nameOverride, setNameOverride] = useState(attrs?.nameOverride ?? '')
  const [fairRole, setFairRole] = useState<FairBoothFairRole>(attrs?.fairRole ?? 'worker')
  const [isHispanic, setIsHispanic] = useState(person.isHispanic)

  const saveAttrs = useMutation({
    mutationFn: () =>
      upsertFairBoothRosterAttrs(scheduleId, personId, {
        fairRole,
        initialsOverride: override.trim() === '' ? null : override.trim(),
        nameOverride: nameOverride.trim() === '' ? null : nameOverride.trim(),
      }),
    onSuccess: () => queryClient.invalidateQueries({queryKey: schedulesKeys.fairBooth(scheduleId)}),
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
  })

  const clearAttrs = useMutation({
    mutationFn: () => deleteFairBoothRosterAttrs(scheduleId, personId),
    onSuccess: () => {
      queryClient.invalidateQueries({queryKey: schedulesKeys.fairBooth(scheduleId)})
      toast.success('Reset to defaults')
      onClose()
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
  })

  const hasOtherOverride = fairRole !== 'worker' || override.trim() !== '' || nameOverride.trim() !== ''
  const removeFromList = useMutation({
    mutationFn: async () => {
      if (hasOtherOverride) await upsertFairBoothRosterAttrs(scheduleId, personId, {manualInclude: false})
      else await deleteFairBoothRosterAttrs(scheduleId, personId)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({queryKey: schedulesKeys.fairBooth(scheduleId)})
      toast.success('Removed from list')
      onClose()
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
  })

  const saveHispanic = useMutation({
    mutationFn: () => updatePerson(personId, {isHispanic}),
    onSuccess: () => queryClient.invalidateQueries({queryKey: schedulesKeys.fairBooth(scheduleId)}),
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
  })

  const fullName = [person.firstName, person.lastName].filter(Boolean).join(' ') || `Person ${person.id}`

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{fullName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Name override</Label>
            <Input
              value={nameOverride}
              onChange={(e) => setNameOverride(e.target.value)}
              placeholder="e.g. Mark Candee"
            />
            <p className="text-muted-foreground mt-1 text-xs">
              Per-schedule display name. Initials are computed from this when set.
            </p>
          </div>
          <div>
            <Label>Initials override</Label>
            <Input
              value={override}
              onChange={(e) => setOverride(e.target.value)}
              placeholder="Leave blank for computed"
            />
          </div>
          <div>
            <Label>Fair role</Label>
            <Select value={fairRole} onValueChange={(v) => setFairRole(v as FairBoothFairRole)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FAIR_ROLES.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="hispanic-modal" checked={isHispanic} onCheckedChange={(v) => setIsHispanic(v === true)} />
            <Label htmlFor="hispanic-modal" className="cursor-pointer text-sm font-normal">
              Hispanic — applies app-wide, not just this fair
            </Label>
          </div>
          <div className="flex items-center justify-between">
            <p className="text-muted-foreground text-sm">Signups this fair: {signupCount}</p>
            {signupCount > 0 ? (
              <Button variant="outline" size="sm" onClick={onShowShifts}>
                Show Shifts
              </Button>
            ) : attrs?.manualInclude ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => removeFromList.mutate()}
                disabled={removeFromList.isPending}
              >
                Remove from list
              </Button>
            ) : null}
          </div>
        </div>
        <DialogFooter className="flex flex-wrap gap-2">
          {attrs && (
            <Button variant="ghost" onClick={() => clearAttrs.mutate()} disabled={clearAttrs.isPending}>
              Reset to defaults
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={async () => {
              if (isHispanic !== person.isHispanic) await saveHispanic.mutateAsync()
              await saveAttrs.mutateAsync()
              onClose()
            }}
            disabled={saveAttrs.isPending || saveHispanic.isPending}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
