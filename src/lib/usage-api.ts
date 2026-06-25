export interface RecentEntity {
  path: string
  entityType: string
  typeLabel: string
  label: string
  score: number
}

// Fire-and-forget: log a navigation. Never throws into the UI.
export function recordVisit(path: string): void {
  void fetch('/api/usage/visit', {
    method: 'POST',
    credentials: 'include',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({path}),
  }).catch(() => {})
}

export async function fetchSectionScores(): Promise<Record<string, number>> {
  const res = await fetch('/api/usage/sections', {credentials: 'include'})
  if (!res.ok) return {}
  return res.json()
}

export async function fetchRecents(): Promise<RecentEntity[]> {
  const res = await fetch('/api/usage/recents', {credentials: 'include'})
  if (!res.ok) return []
  return res.json()
}
