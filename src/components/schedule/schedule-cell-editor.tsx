import {PerformerMultiPicker} from '@/components/specials/performer-multi-picker'
import {Button} from '@/components/ui/button'
import {DialogFooter, DialogHeader, DialogTitle} from '@/components/ui/dialog'
import {Input} from '@/components/ui/input'
import {Label} from '@/components/ui/label'
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select'
import {fetchGroup, fetchPerson} from '@/lib/api'
import {formatDate} from '@/lib/date'
import {type SpecialMusicCell, fetchSchedulesSettings, schedulesKeys} from '@/lib/schedules-api'
import {SPECIAL_TYPE_LABELS, type Special, type SpecialType, specialsApi} from '@/lib/specials-api'
import {useMutation, useQueries, useQuery, useQueryClient} from '@tanstack/react-query'
import {ExternalLink, Trash2} from 'lucide-react'
import {useState} from 'react'
import {useNavigate} from 'react-router-dom'
import {toast} from 'sonner'

interface Props {
  date: string
  serviceType: 'sunday_am' | 'sunday_pm'
  cell: SpecialMusicCell | null
  scheduleId: number
  onClose: () => void
  onSaved: () => void
}

function deriveType(performerCount: number, guestCount: number): SpecialType {
  const total = performerCount + guestCount
  if (total === 1) return 'solo'
  if (total === 2) return 'duet'
  if (total === 3) return 'trio'
  return 'group'
}

// Renders inside a <Dialog><DialogContent>. Provides its own header + footer
// for the standard modal layout used elsewhere in the app.
export function ScheduleCellEditor({date, serviceType, cell, scheduleId, onClose, onSaved}: Props) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [performerIds, setPerformerIds] = useState<number[]>(cell?.performers.map((p) => p.personId) ?? [])
  const [guests, setGuests] = useState<string[]>(cell?.guestPerformers ?? [])
  const [overrideLabel, setOverrideLabel] = useState<string>(cell?.serviceLabel ?? '')
  const [type, setType] = useState<SpecialType>(cell?.type ?? 'solo')
  const [typeTouched, setTypeTouched] = useState(false)
  // Per-performer override of the schedule render flag. null = inherit from
  // the person's own displayFirstNameOnly setting.
  const [overrides, setOverrides] = useState<Record<number, boolean | null>>(() => {
    const out: Record<number, boolean | null> = {}
    for (const p of cell?.performers ?? []) out[p.personId] = p.cellOverride
    return out
  })

  const derivedType = deriveType(performerIds.length, guests.length)
  const effectiveType: SpecialType = typeTouched ? type : derivedType

  // Build the restricted person-id set from the configured singer Groups.
  const {data: settings} = useQuery({queryKey: schedulesKeys.settings, queryFn: fetchSchedulesSettings})
  const singerGroupIds = settings?.specialMusic.singerGroupIds ?? []
  const groupQueries = useQueries({
    queries: singerGroupIds.map((gid) => ({
      queryKey: ['group', gid],
      queryFn: () => fetchGroup(gid),
    })),
  })
  const restrictToPersonIds: number[] | undefined = singerGroupIds.length
    ? [...new Set(groupQueries.flatMap((q) => (q.data?.members ?? []).map((m) => m.id)))]
    : undefined

  // Fetch the linked performers so we can render the per-performer
  // last-name-display row even for performers that were just added.
  const personQueries = useQueries({
    queries: performerIds.map((pid) => ({
      queryKey: ['person', pid],
      queryFn: () => fetchPerson(pid),
    })),
  })
  const performerInfo = performerIds.map((pid, i) => {
    const data = personQueries[i]?.data
    return {
      personId: pid,
      firstName: data?.firstName ?? null,
      lastName: data?.lastName ?? null,
      personDefault: data?.displayFirstNameOnly ?? false,
    }
  })

  const invalidate = () => queryClient.invalidateQueries({queryKey: ['schedules', 'cells', scheduleId]})

  const saveMutation = useMutation({
    mutationFn: async (): Promise<Special> => {
      const body = {
        performerIds,
        guestPerformers: guests,
        serviceLabel: overrideLabel.trim() || null,
        type: effectiveType,
      }
      const performerOverrides = performerIds
        .filter((pid) => overrides[pid] !== undefined && overrides[pid] !== null)
        .map((pid) => ({personId: pid, displayFirstNameOnly: overrides[pid] as boolean}))
      const bodyWithOverrides = {...body, performerOverrides}
      if (cell) return specialsApi.update(cell.id, bodyWithOverrides)
      return specialsApi.create({date, serviceType, ...bodyWithOverrides})
    },
    onSuccess: () => {
      invalidate()
      onSaved()
      onClose()
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Save failed'),
  })

  const deleteMutation = useMutation({
    mutationFn: () => (cell ? specialsApi.remove(cell.id) : Promise.resolve({success: true as const})),
    onSuccess: () => {
      invalidate()
      onSaved()
      onClose()
      toast.success('Cell cleared')
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Delete failed'),
  })

  const hasContent = performerIds.length > 0 || guests.length > 0 || overrideLabel.trim().length > 0
  const slotLabel = serviceType === 'sunday_am' ? 'Sunday AM' : 'Sunday PM'

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {formatDate(date)} · {slotLabel}
        </DialogTitle>
      </DialogHeader>

      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label>Performers + Guests</Label>
          <PerformerMultiPicker
            value={performerIds}
            onChange={setPerformerIds}
            guestPerformers={guests}
            onGuestChange={setGuests}
            restrictToPersonIds={restrictToPersonIds}
          />
        </div>

        {performerInfo.length > 0 && (
          <div className="space-y-1.5">
            <Label className="text-xs">Last name on this cell</Label>
            <div className="bg-muted/30 space-y-1 rounded border p-2">
              {performerInfo.map((p) => {
                const fullName = [p.firstName, p.lastName].filter(Boolean).join(' ') || `Person ${p.personId}`
                const override = overrides[p.personId] ?? null
                const value = override === null ? 'inherit' : override ? 'hide' : 'show'
                return (
                  <div key={p.personId} className="flex items-center gap-2 text-sm">
                    <span className="flex-1 truncate">{fullName}</span>
                    <Select
                      value={value}
                      onValueChange={(v) =>
                        setOverrides((prev) => ({
                          ...prev,
                          [p.personId]: v === 'inherit' ? null : v === 'hide',
                        }))
                      }
                    >
                      <SelectTrigger className="h-7 w-44 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="inherit">
                          Inherit ({p.personDefault ? 'first name only' : 'show last name'})
                        </SelectItem>
                        <SelectItem value="show">Show last name</SelectItem>
                        <SelectItem value="hide">First name only</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        <div className="space-y-1.5">
          <Label>Override Label</Label>
          <Input
            value={overrideLabel}
            onChange={(e) => setOverrideLabel(e.target.value)}
            placeholder="e.g. Men's Group, Hispanic Special"
          />
        </div>

        <div className="space-y-1.5">
          <Label>
            Type{' '}
            {!typeTouched ? (
              <span className="text-muted-foreground font-normal">(auto: {SPECIAL_TYPE_LABELS[derivedType]})</span>
            ) : null}
          </Label>
          <Select
            value={effectiveType}
            onValueChange={(v) => {
              setType(v as SpecialType)
              setTypeTouched(true)
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(SPECIAL_TYPE_LABELS) as SpecialType[]).map((t) => (
                <SelectItem key={t} value={t}>
                  {SPECIAL_TYPE_LABELS[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <DialogFooter className="sm:justify-between">
        <div className="flex items-center gap-1">
          {cell && (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => deleteMutation.mutate()}
                disabled={deleteMutation.isPending}
                title="Clear cell"
              >
                <Trash2 className="mr-1 h-4 w-4" />
                Clear
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate(`/music/specials/${cell.id}`)}
                title="Open in Specials"
              >
                <ExternalLink className="mr-1 h-4 w-4" />
                Open in Specials
              </Button>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || (!cell && !hasContent)}>
            Save
          </Button>
        </div>
      </DialogFooter>
    </>
  )
}
