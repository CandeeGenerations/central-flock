const DAY_MS = 86_400_000
const DEFAULT_HALF_LIFE_DAYS = 30

// Parse a SQLite `datetime('now')` string ("YYYY-MM-DD HH:MM:SS", UTC) to epoch ms.
export function parseSqliteUtc(s: string): number {
  return Date.parse(s.replace(' ', 'T') + 'Z')
}

// One visit's contribution to a frecency score: decays by half every halfLife days.
export function visitWeight(visitedAtMs: number, nowMs: number, halfLifeDays = DEFAULT_HALF_LIFE_DAYS): number {
  const ageDays = Math.max(0, (nowMs - visitedAtMs) / DAY_MS)
  return Math.pow(0.5, ageDays / halfLifeDays)
}
