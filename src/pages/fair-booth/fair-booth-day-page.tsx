import {Button} from '@/components/ui/button'
import {Label} from '@/components/ui/label'
import {SearchableSelect} from '@/components/ui/searchable-select'
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select'
import {PageSpinner} from '@/components/ui/spinner'
import {deriveFairDays, formatTimeShort, maxShiftRoleFor} from '@/lib/fair-booth-render'
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
import {ArrowDown, ArrowLeft, ArrowUp, ChevronLeft, ChevronRight, Trash2} from 'lucide-react'
import {useNavigate, useParams} from 'react-router-dom'
import {toast} from 'sonner'

import {FairBoothGrid} from './fair-booth-grid'

const SHIFT_LABEL: Record<FairBoothShiftRole, string> = {
  unit_leader: '— Unit Leader',
  asst_unit: '—— Asst Unit Leader',
  worker: '——— Worker',
}

const SHIFT_RANK: Record<FairBoothShiftRole, number> = {unit_leader: 0, asst_unit: 1, worker: 2}

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
    return <div className="p-4 text-destructive">Invalid schedule start (not a Friday).</div>
  }
  const dayIdx = days.findIndex((d) => d.date === date)
  if (dayIdx === -1) return <div className="p-4">Date not in this fair</div>
  const day = days[dayIdx]
  const dayDate = new Date(date + 'T12:00:00')
  const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dayDate.getDay()]

  const daySignups = detail.signups.filter((s) => s.dayDate === date)
  const rosterIds = new Set(detail.rosterPersonIds)
  const attrsByPerson = new Map(detail.rosterAttrs.map((a) => [a.personId, a]))

  const alreadyOnDay = new Set(daySignups.map((s) => s.personId))
  const firstAvailable = detail!.rosterPersonIds.find((pid) => !alreadyOnDay.has(pid))

  function addToSlot(slotIdx: number) {
    if (!firstAvailable) {
      toast.error('Everyone on the roster is already on this day.')
      return
    }
    const slot = day.slots[slotIdx]
    addMutation.mutate({
      personId: firstAvailable,
      dayDate: date!,
      startMinute: slot.startMinute,
      endMinute: slot.endMinute,
      shiftRole: 'worker',
    })
  }
  function addSpanningBoth() {
    if (!firstAvailable) {
      toast.error('Everyone on the roster is already on this day.')
      return
    }
    addMutation.mutate({
      personId: firstAvailable,
      dayDate: date!,
      startMinute: day.slots[0].startMinute,
      endMinute: day.slots[day.slots.length - 1].endMinute,
      shiftRole: 'worker',
    })
  }

  const sortedSignups = [...daySignups].sort(
    (a, b) =>
      (SHIFT_RANK[a.shiftRole] ?? 9) - (SHIFT_RANK[b.shiftRole] ?? 9) || a.sortOrder - b.sortOrder || a.id - b.id,
  )

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

      <div className="grid md:grid-cols-2 gap-4 items-start">
        <div className="md:sticky md:top-4 md:self-start">
          <h3 className="font-medium mb-2">Preview</h3>
          <div className="border rounded overflow-x-auto p-2 max-h-[calc(100vh-8rem)] overflow-y-auto">
            <FairBoothGrid
              scopeStart={detail.schedule.scopeStart}
              signups={daySignups}
              people={detail.people}
              rosterAttrs={detail.rosterAttrs}
              onlyDate={date}
            />
          </div>
        </div>

        <div className="space-y-3">
          <h3 className="font-medium">Signups</h3>
          <AddSignupButtons day={day} addToSlot={addToSlot} addSpanningBoth={addSpanningBoth} />

          {sortedSignups.length === 0 && (
            <p className="text-muted-foreground text-sm">No signups yet — use the buttons above to add one.</p>
          )}

          {sortedSignups.map((s) => {
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
                key={s.id}
                className={`rounded p-2 space-y-2 ${
                  SHIFT_RANK[s.shiftRole] === 0
                    ? 'border-2 border-purple-400'
                    : SHIFT_RANK[s.shiftRole] === 1
                      ? 'border-2 border-blue-400'
                      : 'border'
                }`}
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <Label className="text-xs w-14 shrink-0">Person</Label>
                  <SearchableSelect
                    value={String(s.personId)}
                    onValueChange={(v) =>
                      updateMutation.mutate({signupId: s.id, body: {personId: Number(v)} as Partial<FairBoothSignup>})
                    }
                    options={detail.people
                      .filter(
                        (p) =>
                          p.id === s.personId ||
                          !daySignups.some((other) => other.id !== s.id && other.personId === p.id),
                      )
                      .map((p) => ({
                        value: String(p.id),
                        label: [p.firstName, p.lastName].filter(Boolean).join(' ') || `Person ${p.id}`,
                      }))}
                    className="w-56"
                  />
                  {!onRoster && <span className="text-xs text-yellow-700">⚠ no longer on roster</span>}
                  {person?.isHispanic && <span className="text-xs text-emerald-700">Hispanic</span>}
                  <div className="ml-auto flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => moveMutation.mutate({signupId: s.id, direction: 'up'})}
                    >
                      <ArrowUp className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => moveMutation.mutate({signupId: s.id, direction: 'down'})}
                    >
                      <ArrowDown className="h-3 w-3" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deleteMutation.mutate(s.id)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap text-xs">
                  <Label className="text-xs w-14 shrink-0">Time</Label>
                  <TimePicker
                    value={s.startMinute}
                    onChange={(v) => updateMutation.mutate({signupId: s.id, body: {startMinute: v}})}
                  />
                  <span>→</span>
                  <TimePicker
                    value={s.endMinute}
                    onChange={(v) => updateMutation.mutate({signupId: s.id, body: {endMinute: v}})}
                  />
                  <Label className="text-xs ml-4 shrink-0">Row</Label>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => rowMutation.mutate({signupId: s.id, direction: 'up'})}
                  >
                    <ArrowUp className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => rowMutation.mutate({signupId: s.id, direction: 'down'})}
                  >
                    <ArrowDown className="h-3 w-3" />
                  </Button>
                  {s.displayRowOverride !== null && (
                    <Button
                      variant="link"
                      size="sm"
                      className="text-xs h-6 px-1"
                      onClick={() => rowMutation.mutate({signupId: s.id, direction: 'reset'})}
                    >
                      reset
                    </Button>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-wrap text-xs">
                  <Label className="text-xs w-14 shrink-0">Role</Label>
                  {allowedShifts.length === 1 ? (
                    <span className="text-muted-foreground text-xs px-2 py-1 rounded border bg-muted/30">
                      {SHIFT_LABEL[s.shiftRole]}
                    </span>
                  ) : (
                    <Select
                      value={s.shiftRole}
                      onValueChange={(v) =>
                        updateMutation.mutate({signupId: s.id, body: {shiftRole: v as FairBoothShiftRole}})
                      }
                    >
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
          })}
          {sortedSignups.length > 3 && (
            <AddSignupButtons day={day} addToSlot={addToSlot} addSpanningBoth={addSpanningBoth} />
          )}
        </div>
      </div>
    </div>
  )
}

function AddSignupButtons({
  day,
  addToSlot,
  addSpanningBoth,
}: {
  day: {slots: {startMinute: number; endMinute: number}[]}
  addToSlot: (i: number) => void
  addSpanningBoth: () => void
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {day.slots.map((s, i) => (
        <Button key={i} variant="outline" size="sm" onClick={() => addToSlot(i)}>
          + Add to Slot {i + 1} ({formatTimeShort(s.startMinute)}-{formatTimeShort(s.endMinute)})
        </Button>
      ))}
      {day.slots.length > 1 && (
        <Button variant="outline" size="sm" onClick={addSpanningBoth}>
          + Add spanning both
        </Button>
      )}
    </div>
  )
}

function TimePicker({value, onChange}: {value: number; onChange: (v: number) => void}) {
  // 30-minute options from 2:00 PM to 10:00 PM.
  const opts: number[] = []
  for (let m = 14 * 60; m <= 22 * 60; m += 30) opts.push(m)
  return (
    <Select value={String(value)} onValueChange={(v) => onChange(Number(v))}>
      <SelectTrigger className="w-24 h-7 text-xs">
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
