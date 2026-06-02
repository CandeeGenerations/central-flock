import {Button} from '@/components/ui/button'
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card'
import {Label} from '@/components/ui/label'
import {SearchableSelect} from '@/components/ui/searchable-select'
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select'
import {PageSpinner} from '@/components/ui/spinner'
import {deriveFairDays, formatTimeShort, maxShiftRoleFor, slotIndexForSignup} from '@/lib/fair-booth-render'
import {
  type FairBoothFairRole,
  type FairBoothShiftRole,
  type FairBoothSignup,
  createFairBoothSignup,
  deleteFairBoothSignup,
  fetchFairBoothSchedule,
  moveFairBoothSignup,
  rowFairBoothSignup,
  schedulesKeys,
  updateFairBoothSignup,
} from '@/lib/schedules-api'
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'
import {ArrowDown, ArrowLeft, ArrowUp, ChevronLeft, ChevronRight, Plus, Trash2} from 'lucide-react'
import {useNavigate, useParams} from 'react-router-dom'
import {toast} from 'sonner'

import {FairBoothGrid} from './fair-booth-grid'

const SHIFT_LABEL: Record<FairBoothShiftRole, string> = {
  unit_leader: '— Unit Leader',
  asst_unit: '—— Asst Unit Leader',
  worker: '——— Worker',
}

const TIERS: {role: FairBoothShiftRole; label: string; emptyMsg: string | null}[] = [
  {role: 'unit_leader', label: 'Unit Leader', emptyMsg: 'No Unit Leader assigned'},
  {role: 'asst_unit', label: 'Asst Unit Leader', emptyMsg: 'No Asst Unit Leader assigned'},
  {role: 'worker', label: 'Workers', emptyMsg: null},
]

export function FairBoothDayPage() {
  const {id, date} = useParams<{id: string; date: string}>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const scheduleId = Number(id)

  const {data: detail, isLoading} = useQuery({
    queryKey: schedulesKeys.fairBooth(scheduleId),
    queryFn: () => fetchFairBoothSchedule(scheduleId),
  })

  const invalidate = () => queryClient.invalidateQueries({queryKey: schedulesKeys.fairBooth(scheduleId)})

  const addMutation = useMutation({
    mutationFn: (body: {
      personId: number
      dayDate: string
      startMinute: number
      endMinute: number
      shiftRole: FairBoothShiftRole
    }) => createFairBoothSignup(scheduleId, body),
    onSuccess: invalidate,
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
  })
  const updateMutation = useMutation({
    mutationFn: ({signupId, body}: {signupId: number; body: Partial<FairBoothSignup>}) =>
      updateFairBoothSignup(scheduleId, signupId, body),
    onSuccess: invalidate,
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
  })
  const deleteMutation = useMutation({
    mutationFn: (signupId: number) => deleteFairBoothSignup(scheduleId, signupId),
    onSuccess: invalidate,
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
  })
  const moveMutation = useMutation({
    mutationFn: ({signupId, direction}: {signupId: number; direction: 'up' | 'down'}) =>
      moveFairBoothSignup(scheduleId, signupId, direction),
    onSuccess: invalidate,
  })
  const rowMutation = useMutation({
    mutationFn: ({signupId, direction}: {signupId: number; direction: 'up' | 'down' | 'reset'}) =>
      rowFairBoothSignup(scheduleId, signupId, direction),
    onSuccess: invalidate,
  })

  if (isLoading || !detail) return <PageSpinner />
  if (!detail.schedule.scopeStart) return <div className="p-4">Schedule missing scope start.</div>
  if (!date) return <div className="p-4">Missing date</div>

  let days: ReturnType<typeof deriveFairDays>
  try {
    days = deriveFairDays(detail.schedule.scopeStart)
  } catch {
    return <div className="text-destructive p-4">Invalid schedule start (not a Friday).</div>
  }
  const dayIdx = days.findIndex((d) => d.date === date)
  if (dayIdx === -1) return <div className="p-4">Date not in this fair</div>
  const day = days[dayIdx]
  const dayDate = new Date(date + 'T12:00:00')
  const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dayDate.getDay()]

  const daySignups = detail.signups.filter((s) => s.dayDate === date)
  const rosterIds = new Set(detail.rosterPersonIds)
  const attrsByPerson = new Map(detail.rosterAttrs.map((a) => [a.personId, a]))

  function addToSlot(slotIdx: number) {
    const inSlot = new Set(daySignups.filter((sg) => slotIndexForSignup(sg, day) === slotIdx).map((sg) => sg.personId))
    const pid = detail!.rosterPersonIds.find((p) => !inSlot.has(p))
    if (!pid) {
      toast.error('Every roster member is already in this slot.')
      return
    }
    const slot = day.slots[slotIdx]
    addMutation.mutate({
      personId: pid,
      dayDate: date!,
      startMinute: slot.startMinute,
      endMinute: slot.endMinute,
      shiftRole: 'worker',
    })
  }

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-5xl">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => navigate(`/schedules/fair-booth/${scheduleId}`)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h2 className="text-2xl font-bold">
          {dayName}, {dayDate.toLocaleDateString(undefined, {month: 'short', day: 'numeric', year: 'numeric'})}
        </h2>
        <div className="ml-auto flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            disabled={dayIdx === 0}
            onClick={() => navigate(`/schedules/fair-booth/${scheduleId}/day/${days[dayIdx - 1].date}`)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            disabled={dayIdx === days.length - 1}
            onClick={() => navigate(`/schedules/fair-booth/${scheduleId}/day/${days[dayIdx + 1].date}`)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="grid items-start gap-4 md:grid-cols-2">
        <div className="md:sticky md:top-4 md:self-start">
          <h3 className="mb-2 font-medium">Preview</h3>
          <div className="max-h-[calc(100vh-8rem)] overflow-x-auto overflow-y-auto rounded border p-2">
            <FairBoothGrid
              scopeStart={detail.schedule.scopeStart}
              signups={daySignups}
              people={detail.people}
              rosterAttrs={detail.rosterAttrs}
              onlyDate={date}
            />
          </div>
        </div>

        <div className="space-y-4">
          {day.slots.map((slot, slotIdx) => {
            const slotSignups = daySignups
              .filter((s) => slotIndexForSignup(s, day) === slotIdx)
              .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)
            const slotLabel = `${formatTimeShort(slot.startMinute)}–${formatTimeShort(slot.endMinute)} PM`
            return (
              <Card key={slotIdx}>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center justify-between text-base">
                    <span>
                      {day.slots.length > 1 ? `Slot ${slotIdx + 1} ` : ''}
                      <span className="text-muted-foreground text-sm font-normal">({slotLabel})</span>
                    </span>
                    <Button variant="outline" size="sm" onClick={() => addToSlot(slotIdx)}>
                      <Plus className="mr-1 h-3 w-3" /> Add signup
                    </Button>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {TIERS.map((tier) => {
                    const tierSignups = slotSignups.filter((s) => s.shiftRole === tier.role)
                    return (
                      <div key={tier.role} className="space-y-2">
                        <div className="text-muted-foreground text-xs font-semibold uppercase tracking-wide">
                          {tier.label}
                        </div>
                        {tierSignups.length === 0
                          ? tier.emptyMsg && <p className="text-destructive/70 text-xs italic">{tier.emptyMsg}</p>
                          : tierSignups.map((s) => (
                              <SignupCard
                                key={s.id}
                                signup={s}
                                day={day}
                                detail={detail}
                                daySignups={daySignups}
                                rosterIds={rosterIds}
                                attrsByPerson={attrsByPerson}
                                onUpdate={(body) => updateMutation.mutate({signupId: s.id, body})}
                                onDelete={() => deleteMutation.mutate(s.id)}
                                onMove={(direction) => moveMutation.mutate({signupId: s.id, direction})}
                                onRow={(direction) => rowMutation.mutate({signupId: s.id, direction})}
                              />
                            ))}
                      </div>
                    )
                  })}
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>
    </div>
  )
}

interface SignupCardProps {
  signup: FairBoothSignup
  day: ReturnType<typeof deriveFairDays>[number]
  detail: NonNullable<ReturnType<typeof useQuery<Awaited<ReturnType<typeof fetchFairBoothSchedule>>>>['data']>
  daySignups: FairBoothSignup[]
  rosterIds: Set<number>
  attrsByPerson: Map<number, {fairRole: FairBoothFairRole}>
  onUpdate: (body: Partial<FairBoothSignup>) => void
  onDelete: () => void
  onMove: (direction: 'up' | 'down') => void
  onRow: (direction: 'up' | 'down' | 'reset') => void
}

function SignupCard({
  signup: s,
  day,
  detail,
  daySignups,
  rosterIds,
  attrsByPerson,
  onUpdate,
  onDelete,
  onMove,
  onRow,
}: SignupCardProps) {
  const person = detail.people.find((p) => p.id === s.personId)
  const fairRole: FairBoothFairRole = attrsByPerson.get(s.personId)?.fairRole ?? 'worker'
  const maxRole = maxShiftRoleFor(fairRole)
  const allowedShifts: FairBoothShiftRole[] =
    maxRole === 'worker'
      ? ['worker']
      : maxRole === 'asst_unit'
        ? ['worker', 'asst_unit']
        : ['worker', 'asst_unit', 'unit_leader']
  const onRoster = rosterIds.has(s.personId)
  return (
    <div
      className={`space-y-2 rounded p-2 ${
        s.shiftRole === 'unit_leader'
          ? 'border-2 border-purple-400'
          : s.shiftRole === 'asst_unit'
            ? 'border-2 border-blue-400'
            : 'border'
      }`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Label className="w-14 shrink-0 text-xs">Person</Label>
        <SearchableSelect
          value={String(s.personId)}
          onValueChange={(v) => onUpdate({personId: Number(v)} as Partial<FairBoothSignup>)}
          options={detail.people
            .filter((p) => {
              if (p.id === s.personId) return true
              const mySlot = slotIndexForSignup(s, day)
              return !daySignups.some(
                (other) => other.id !== s.id && other.personId === p.id && slotIndexForSignup(other, day) === mySlot,
              )
            })
            .map((p) => ({
              value: String(p.id),
              label: [p.firstName, p.lastName].filter(Boolean).join(' ') || `Person ${p.id}`,
            }))}
          className="w-56"
        />
        {!onRoster && <span className="text-xs text-yellow-700">⚠ no longer on roster</span>}
        {person?.isHispanic && <span className="text-xs text-emerald-700">Hispanic</span>}
        <div className="ml-auto flex gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onMove('up')}>
            <ArrowUp className="h-3 w-3" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onMove('down')}>
            <ArrowDown className="h-3 w-3" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onDelete}>
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Label className="w-14 shrink-0 text-xs">Time</Label>
        <TimePicker value={s.startMinute} onChange={(v) => onUpdate({startMinute: v})} />
        <span>→</span>
        <TimePicker value={s.endMinute} onChange={(v) => onUpdate({endMinute: v})} />
        <Label className="ml-4 shrink-0 text-xs">Row</Label>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onRow('up')}>
          <ArrowUp className="h-3 w-3" />
        </Button>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onRow('down')}>
          <ArrowDown className="h-3 w-3" />
        </Button>
        {s.displayRowOverride !== null && (
          <Button variant="link" size="sm" className="h-6 px-1 text-xs" onClick={() => onRow('reset')}>
            reset
          </Button>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Label className="w-14 shrink-0 text-xs">Role</Label>
        {allowedShifts.length === 1 ? (
          <span className="text-muted-foreground bg-muted/30 rounded border px-2 py-1 text-xs">
            {SHIFT_LABEL[s.shiftRole]}
          </span>
        ) : (
          <Select value={s.shiftRole} onValueChange={(v) => onUpdate({shiftRole: v as FairBoothShiftRole})}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {allowedShifts.map((r) => (
                <SelectItem key={r} value={r}>
                  {SHIFT_LABEL[r]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
    </div>
  )
}

function TimePicker({value, onChange}: {value: number; onChange: (v: number) => void}) {
  // 30-minute options from 2:00 PM to 10:00 PM (unbounded — soft slot reflow).
  const opts: number[] = []
  for (let m = 14 * 60; m <= 22 * 60; m += 30) opts.push(m)
  return (
    <Select value={String(value)} onValueChange={(v) => onChange(Number(v))}>
      <SelectTrigger className="h-7 w-24 text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {opts.map((m) => (
          <SelectItem key={m} value={String(m)}>
            {formatTimeShort(m)} PM
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
