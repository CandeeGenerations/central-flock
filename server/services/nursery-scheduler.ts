import type {ServiceType} from '../db-nursery/schema.js'

export interface ServiceConfig {
  serviceType: ServiceType
  label: string
  workerCount: number
  sortOrder: number
}

export interface WorkerServiceEligibility {
  serviceType: ServiceType
  maxPerMonth: number | null
}

export interface WorkerWithEligibility {
  id: number
  name: string
  maxPerMonth: number
  allowMultiplePerDay: boolean
  services: WorkerServiceEligibility[]
}

export interface ScheduleSlot {
  date: string
  serviceType: ServiceType
  slot: number
  workerId: number | null
}

export interface DatePair {
  sunday: string
  wednesday: string
}

function formatDate(d: Date): string {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function addDays(d: Date, days: number): Date {
  const result = new Date(d.getFullYear(), d.getMonth(), d.getDate() + days)
  return result
}

export function computeDatePairs(month: number, year: number): DatePair[] {
  // Find all Sundays in the target month (month is 1-based)
  const sundays: Date[] = []
  const daysInMonth = new Date(year, month, 0).getDate()

  for (let day = 1; day <= daysInMonth; day++) {
    const d = new Date(year, month - 1, day)
    if (d.getDay() === 0) {
      sundays.push(d)
    }
  }

  // If fewer than 5 Sundays, prepend last Sunday of previous month
  if (sundays.length < 5) {
    const prevMonthLastDay = new Date(year, month - 1, 0)
    let d = new Date(prevMonthLastDay.getFullYear(), prevMonthLastDay.getMonth(), prevMonthLastDay.getDate())
    while (d.getDay() !== 0) {
      d = addDays(d, -1)
    }
    sundays.unshift(d)
  }

  // Take first 5 Sundays
  const chosen = sundays.slice(0, 5)

  return chosen.map((sunday) => ({
    sunday: formatDate(sunday),
    wednesday: formatDate(addDays(sunday, 3)),
  }))
}

export function buildSlots(pairs: DatePair[], serviceConfig: ServiceConfig[]): ScheduleSlot[] {
  const slots: ScheduleSlot[] = []
  const sundayServices = serviceConfig
    .filter((s) => s.serviceType !== 'wednesday_evening')
    .sort((a, b) => a.sortOrder - b.sortOrder)
  const wednesdayServices = serviceConfig.filter((s) => s.serviceType === 'wednesday_evening')

  for (const pair of pairs) {
    // Sunday services
    for (const svc of sundayServices) {
      for (let s = 1; s <= svc.workerCount; s++) {
        slots.push({date: pair.sunday, serviceType: svc.serviceType, slot: s, workerId: null})
      }
    }
    // Wednesday services
    for (const svc of wednesdayServices) {
      for (let s = 1; s <= svc.workerCount; s++) {
        slots.push({date: pair.wednesday, serviceType: svc.serviceType, slot: s, workerId: null})
      }
    }
  }

  return slots
}

export function assignWorkers(slots: ScheduleSlot[], workers: WorkerWithEligibility[]): ScheduleSlot[] {
  const activeWorkers = workers.filter((w) => w.services.length > 0)

  // Counters
  const totalAssignments = new Map<number, number>()
  const serviceAssignments = new Map<number, Map<string, number>>()
  const dayAssignments = new Map<number, Map<string, number>>()
  // Per-(serviceType:slot) assignment count per worker — long-term slot rotation
  const slotPositionAssignments = new Map<number, Map<string, number>>()
  // All assignments per service+date — used to penalize cross-slot repeats from the prior date
  const assignmentsByServiceDate = new Map<string, Map<string, Set<number>>>() // service → date → worker ids

  for (const w of activeWorkers) {
    totalAssignments.set(w.id, 0)
    serviceAssignments.set(w.id, new Map())
    dayAssignments.set(w.id, new Map())
    slotPositionAssignments.set(w.id, new Map())
  }

  for (const slot of slots) {
    // Workers already assigned to another slot of this same service+date (no double-booking)
    const alreadyAssignedSameServiceDate = new Set(
      slots
        .filter((s) => s !== slot && s.date === slot.date && s.serviceType === slot.serviceType && s.workerId !== null)
        .map((s) => s.workerId!),
    )

    const hasServiceEligibility = (w: WorkerWithEligibility) =>
      w.services.some((s) => s.serviceType === slot.serviceType)
    const hasDayConflict = (w: WorkerWithEligibility) => {
      if (w.allowMultiplePerDay) return false
      return (dayAssignments.get(w.id)?.get(slot.date) || 0) > 0
    }
    const hasDoubleBook = (w: WorkerWithEligibility) => alreadyAssignedSameServiceDate.has(w.id)
    const hitsOverallMax = (w: WorkerWithEligibility) => (totalAssignments.get(w.id) || 0) >= w.maxPerMonth
    const hitsServiceMax = (w: WorkerWithEligibility) => {
      const svcConfig = w.services.find((s) => s.serviceType === slot.serviceType)
      if (!svcConfig || svcConfig.maxPerMonth === null) return false
      return (serviceAssignments.get(w.id)?.get(slot.serviceType) || 0) >= svcConfig.maxPerMonth
    }
    // "Oversaturated" = already assigned 2+ services on this date. Near-disqualifier.
    const isOversaturatedToday = (w: WorkerWithEligibility) => (dayAssignments.get(w.id)?.get(slot.date) || 0) >= 2

    // Hard blocks (always): service eligibility, no double-booking same service/date, no day conflict
    const passesHardBlocks = (w: WorkerWithEligibility) =>
      hasServiceEligibility(w) && !hasDoubleBook(w) && !hasDayConflict(w)

    // Tiered eligibility. Priority order: respect per-service cap > respect overall max > avoid oversaturation.
    //   T1: all caps respected + not oversaturated                       (ideal)
    //   T2: all caps respected, oversaturated allowed                    (3rd service today but within caps)
    //   T3: ignore overall max, per-service cap respected, not oversat   (slightly over total)
    //   T4: ignore overall max, per-service cap respected, oversat       (over total AND 3rd service)
    //   T5: ignore all caps, not oversaturated                           (exceeds service cap)
    //   T6: ignore all caps, oversaturated                               (absolute last resort)
    let eligible = activeWorkers.filter(
      (w) => passesHardBlocks(w) && !isOversaturatedToday(w) && !hitsOverallMax(w) && !hitsServiceMax(w),
    )
    if (eligible.length === 0)
      eligible = activeWorkers.filter((w) => passesHardBlocks(w) && !hitsOverallMax(w) && !hitsServiceMax(w))
    if (eligible.length === 0)
      eligible = activeWorkers.filter((w) => passesHardBlocks(w) && !isOversaturatedToday(w) && !hitsServiceMax(w))
    if (eligible.length === 0) eligible = activeWorkers.filter((w) => passesHardBlocks(w) && !hitsServiceMax(w))
    if (eligible.length === 0) eligible = activeWorkers.filter((w) => passesHardBlocks(w) && !isOversaturatedToday(w))
    if (eligible.length === 0) eligible = activeWorkers.filter(passesHardBlocks)

    if (eligible.length === 0) continue

    const slotKey = `${slot.serviceType}:${slot.slot}`

    // Find workers assigned to this service on the most recent PRIOR date (not the current date).
    // These workers should be avoided this date to prevent the same person doing the same service
    // two dates in a row (even in different slots).
    const serviceDateMap = assignmentsByServiceDate.get(slot.serviceType)
    let prevDateWorkers = new Set<number>()
    let prevSlotWorker: number | undefined
    if (serviceDateMap) {
      const priorDates = [...serviceDateMap.keys()].filter((d) => d < slot.date).sort()
      if (priorDates.length > 0) {
        const lastDate = priorDates[priorDates.length - 1]
        prevDateWorkers = serviceDateMap.get(lastDate)!
        // The worker in this exact slot on the prior date — stronger penalty
        const prevSlotSameDate = slots.find(
          (s) => s.date === lastDate && s.serviceType === slot.serviceType && s.slot === slot.slot,
        )
        if (prevSlotSameDate?.workerId) prevSlotWorker = prevSlotSameDate.workerId
      }
    }

    // Workers already assigned to this (service, date) — used for first-name pairing check
    const siblingSlotWorkers = slots
      .filter((s) => s !== slot && s.date === slot.date && s.serviceType === slot.serviceType && s.workerId !== null)
      .map((s) => activeWorkers.find((w) => w.id === s.workerId))
      .filter((w): w is WorkerWithEligibility => !!w)
    const getFirstName = (name: string) => name.trim().split(/\s+/)[0]?.toLowerCase() || ''
    const siblingFirstNames = new Set(siblingSlotWorkers.map((w) => getFirstName(w.name)))

    // Score each eligible worker — lower is better.
    //   exclusivityBonus (-2000)       → always use single-service workers for their service
    //   prevSlotSame × 1000            → hard avoid same worker in same slot back-to-back
    //   prevDateSame × 800             → strong avoid same worker on consecutive dates even in different slots
    //   sameFirstName × 300            → avoid pairing two people with the same first name (e.g. Grace + Grace)
    //   sameDayCount² × 100            → soft for 1 dup, strong for 2+ (prevents someone doing 3 services in one day)
    //   capExceeded × 500              → in fallback tiers, still strongly discourage exceeding caps
    //   slotCount × 20, total × 10     → long-term rotation + even distribution
    //   versatility × 3                → mildly prefer less-versatile workers
    //   random (0-1)                   → variety across regenerations
    const scored = eligible.map((w) => {
      const exclusivityBonus = w.services.length === 1 ? -2000 : 0
      const isPrevSlotSame = prevSlotWorker === w.id ? 1 : 0
      const isPrevDateSame = prevDateWorkers.has(w.id) ? 1 : 0
      const sameDayCount = dayAssignments.get(w.id)?.get(slot.date) || 0
      const sameFirstName = siblingFirstNames.has(getFirstName(w.name)) ? 1 : 0
      const capExceeded = hitsOverallMax(w) || hitsServiceMax(w) ? 1 : 0
      const slotCount = slotPositionAssignments.get(w.id)?.get(slotKey) || 0
      const total = totalAssignments.get(w.id) || 0
      const versatility = w.services.length * 3
      return {
        worker: w,
        score:
          exclusivityBonus +
          isPrevSlotSame * 1000 +
          isPrevDateSame * 800 +
          sameFirstName * 300 +
          sameDayCount * sameDayCount * 100 +
          capExceeded * 500 +
          slotCount * 20 +
          total * 10 +
          versatility +
          Math.random(),
      }
    })

    scored.sort((a, b) => a.score - b.score)

    const chosen = scored[0].worker
    slot.workerId = chosen.id

    totalAssignments.set(chosen.id, (totalAssignments.get(chosen.id) || 0) + 1)
    const svcMap = serviceAssignments.get(chosen.id)!
    svcMap.set(slot.serviceType, (svcMap.get(slot.serviceType) || 0) + 1)
    const dayMap = dayAssignments.get(chosen.id)!
    dayMap.set(slot.date, (dayMap.get(slot.date) || 0) + 1)
    const slotMap = slotPositionAssignments.get(chosen.id)!
    slotMap.set(slotKey, (slotMap.get(slotKey) || 0) + 1)

    let dateMap = assignmentsByServiceDate.get(slot.serviceType)
    if (!dateMap) {
      dateMap = new Map()
      assignmentsByServiceDate.set(slot.serviceType, dateMap)
    }
    let dateSet = dateMap.get(slot.date)
    if (!dateSet) {
      dateSet = new Set()
      dateMap.set(slot.date, dateSet)
    }
    dateSet.add(chosen.id)
  }

  return slots
}

export function generateSchedule(
  month: number,
  year: number,
  workers: WorkerWithEligibility[],
  serviceConfig: ServiceConfig[],
): ScheduleSlot[] {
  const pairs = computeDatePairs(month, year)
  const slots = buildSlots(pairs, serviceConfig)
  return assignWorkers(slots, workers)
}
