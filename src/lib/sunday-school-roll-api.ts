const BASE_URL = '/api/schedules/sunday-school-rolls'

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${url}`, {
    credentials: 'include',
    headers: {'Content-Type': 'application/json'},
    ...options,
  })
  if (res.status === 401) {
    window.location.href = '/login'
    throw new Error('Unauthorized')
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `Request failed: ${res.status}`)
  }
  if (res.status === 204) return undefined as T
  return res.json()
}

export interface RollSheet {
  id: number
  rollId: number
  label: string
  // The whole roster as newline-separated text: line index IS row index, so a
  // blank line prints as a deliberate blank row. See ADR 0030.
  scholars: string
  sortOrder: number
}

export interface SundaySchoolRollSummary {
  id: number
  scheduleId: number
  year: number
  quarter: number
  scopeLabel: string
  status: 'draft' | 'final'
  sheetCount: number
  scholarCount: number
  createdAt: string
  updatedAt: string
}

export interface SundaySchoolRoll extends Omit<SundaySchoolRollSummary, 'sheetCount' | 'scholarCount'> {
  sheets: RollSheet[]
}

export const sundaySchoolRollKeys = {
  all: ['sunday-school-rolls'] as const,
  list: ['sunday-school-rolls', 'list'] as const,
  detail: (id: number) => ['sunday-school-rolls', 'detail', id] as const,
}

export const fetchSundaySchoolRolls = () => request<SundaySchoolRollSummary[]>('/')

export const fetchSundaySchoolRoll = (id: number) => request<SundaySchoolRoll>(`/${id}`)

export const createSundaySchoolRoll = (body: {year: number; quarter: number}) =>
  request<SundaySchoolRollSummary>('/', {method: 'POST', body: JSON.stringify(body)})

export const updateSundaySchoolRoll = (id: number, body: {status?: 'draft' | 'final'}) =>
  request<{ok: true}>(`/${id}`, {method: 'PATCH', body: JSON.stringify(body)})

export const deleteSundaySchoolRoll = (id: number) => request<void>(`/${id}`, {method: 'DELETE'})

export const saveRollSheets = (id: number, sheets: {label: string; scholars: string}[]) =>
  request<RollSheet[]>(`/${id}/sheets`, {method: 'PUT', body: JSON.stringify({sheets})})
