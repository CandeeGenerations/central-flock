import {PerformerMultiPicker} from '@/components/specials/performer-multi-picker'
import {Button} from '@/components/ui/button'
import {Input} from '@/components/ui/input'
import {Label} from '@/components/ui/label'
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select'
import type {SpecialMusicCell} from '@/lib/schedules-api'
import {SPECIAL_TYPE_LABELS, type Special, type SpecialType, specialsApi} from '@/lib/specials-api'
import {useMutation, useQueryClient} from '@tanstack/react-query'
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

export function ScheduleCellEditorPopover({date, serviceType, cell, scheduleId, onClose, onSaved}: Props) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [performerIds, setPerformerIds] = useState<number[]>(cell?.performers.map((p) => p.personId) ?? [])
  const [guests, setGuests] = useState<string[]>(cell?.guestPerformers ?? [])
  const [overrideLabel, setOverrideLabel] = useState<string>(cell?.serviceLabel ?? '')
  const [type, setType] = useState<SpecialType>(cell?.type ?? 'solo')
  const [typeTouched, setTypeTouched] = useState(false)

  const derivedType = deriveType(performerIds.length, guests.length)
  const effectiveType: SpecialType = typeTouched ? type : derivedType

  const invalidate = () => queryClient.invalidateQueries({queryKey: ['schedules', 'cells', scheduleId]})

  const saveMutation = useMutation({
    mutationFn: async (): Promise<Special> => {
      const body = {
        performerIds,
        guestPerformers: guests,
        serviceLabel: overrideLabel.trim() || null,
        type: effectiveType,
      }
      if (cell) {
        return specialsApi.update(cell.id, body)
      }
      return specialsApi.create({
        date,
        serviceType,
        ...body,
      })
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

  return (
    <div className="w-[420px] space-y-3 p-3">
      <div className="text-muted-foreground text-xs">
        {date} · {serviceType === 'sunday_am' ? 'Sunday A.M.' : 'Sunday P.M.'}
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Performers + Guests</Label>
        <PerformerMultiPicker
          value={performerIds}
          onChange={setPerformerIds}
          guestPerformers={guests}
          onGuestChange={setGuests}
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Override Label</Label>
        <Input
          value={overrideLabel}
          onChange={(e) => setOverrideLabel(e.target.value)}
          placeholder="e.g. Men's Group, Hispanic Special"
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Type {!typeTouched ? `(auto: ${SPECIAL_TYPE_LABELS[derivedType]})` : null}</Label>
        <Select
          value={effectiveType}
          onValueChange={(v) => {
            setType(v as SpecialType)
            setTypeTouched(true)
          }}
        >
          <SelectTrigger>
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

      <div className="flex items-center justify-between pt-1">
        <div className="flex items-center gap-1">
          {cell && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => deleteMutation.mutate()}
              disabled={deleteMutation.isPending}
              title="Clear cell"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
          {cell && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate(`/music/specials/${cell.id}`)}
              title="Open in Specials"
            >
              <ExternalLink className="mr-1 h-3.5 w-3.5" />
              Specials
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending || (!cell && !hasContent)}
          >
            Save
          </Button>
        </div>
      </div>
    </div>
  )
}
