// Display helpers shared by the Events Story screens. Times are wall-clock America/New_York.

export function formatMinute(minute: number): string {
  const h = Math.floor(minute / 60)
  const m = minute % 60
  const suffix = h < 12 ? 'am' : 'pm'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return m === 0 ? `${h12} ${suffix}` : `${h12}:${String(m).padStart(2, '0')} ${suffix}`
}

export function formatDate(iso: string, opts: Intl.DateTimeFormatOptions = {}): string {
  const [y, mo, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, mo - 1, d)).toLocaleDateString('en-US', {
    timeZone: 'UTC',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    ...opts,
  })
}

export function formatPostTime(date: string, minute: number): string {
  return `${formatDate(date)} at ${formatMinute(minute)}`
}

// "HH:MM" for <input type="time"> ↔ minutes since midnight.
export function minuteToTimeInput(minute: number): string {
  return `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`
}

export function timeInputToMinute(value: string): number | null {
  const m = value.match(/^(\d{2}):(\d{2})$/)
  return m ? Number(m[1]) * 60 + Number(m[2]) : null
}

export function addDaysIso(iso: string, days: number): string {
  const [y, mo, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, mo - 1, d + days)).toISOString().slice(0, 10)
}

// Monday of the week holding `iso`.
export function mondayOfIso(iso: string): string {
  const [y, mo, d] = iso.split('-').map(Number)
  const weekday = new Date(Date.UTC(y, mo - 1, d)).getUTCDay()
  return addDaysIso(iso, -((weekday + 6) % 7))
}

// "Nov 30 – Dec 6"
export function formatWeek(monday: string): string {
  const short = {weekday: undefined, month: 'short', day: 'numeric'} as const
  return `${formatDate(monday, short)} – ${formatDate(addDaysIso(monday, 6), short)}`
}
