// Command-palette results for dated schedules (music weeks, nursery months, special music
// ranges, Workers' Notes terms) show only periods that haven't ended: the current week/month/
// quarter/term and later ones. Past periods are still reachable from their pages and Recents.

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

// Today's local date as YYYY-MM-DD.
export function localToday(now = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

// Last day of a month (1-based) as YYYY-MM-DD.
export function monthEnd(year: number, month: number): string {
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return `${year}-${pad(month)}-${pad(last)}`
}

export function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d + days))
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`
}

// Same day `n` months earlier (clamped to month end): monthsAgo('2026-03-31', 1) → '2026-02-28'.
export function monthsAgo(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const target = new Date(Date.UTC(y, m - 1 - n, 1))
  const ty = target.getUTCFullYear()
  const tm = target.getUTCMonth() + 1
  const last = Number(monthEnd(ty, tm).slice(8))
  return `${ty}-${pad(tm)}-${pad(Math.min(d, last))}`
}

// True while a period ending on `endIso` (inclusive) is current or still ahead. Unknown end → keep.
export function notEnded(endIso: string | null | undefined, today = localToday()): boolean {
  return !endIso || endIso >= today
}
