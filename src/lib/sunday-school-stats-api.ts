const BASE_URL = '/api/sunday-school-stats'

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
  return res.json()
}

/** Girls, Boys, or their sum. Never "attendance" — that word means the usher's count. */
export type SsMetric = 'girls' | 'boys' | 'total'

export const SS_METRIC_LABELS: Record<SsMetric, string> = {girls: 'Girls', boys: 'Boys', total: 'Total'}

export interface SundaySchoolDepartment {
  id: number
  name: string
  active: boolean
  sortOrder: number
  countCount: number
}

/** One cell of the grid. girls/boys null means blank, which is not zero. */
export interface DepartmentCount {
  weekOf: string
  departmentId: number
  girls: number | null
  boys: number | null
}

export interface GridResponse {
  year: number
  quarter: number
  /** Every Sunday in the quarter, derived — 12, 13 or 14 of them. */
  weeks: string[]
  departments: Pick<SundaySchoolDepartment, 'id' | 'name' | 'active' | 'sortOrder'>[]
  counts: DepartmentCount[]
}

export interface SsSeriesResponse {
  metric: SsMetric
  departmentId: string
  points: {date: string; value: number}[]
}

export interface SsMetricAgg {
  total: number
  count: number
  avg: number
}

export interface SsSummaryResponse {
  quarterStart: string
  yearStart: string
  year: number
  quarter: number
  metrics: Record<SsMetric, {quarter: SsMetricAgg; year: SsMetricAgg}>
}

// --- Departments ---
export const fetchDepartments = (includeInactive = false) =>
  request<SundaySchoolDepartment[]>(`/departments${includeInactive ? '?includeInactive=1' : ''}`)

export const createDepartment = (name: string) =>
  request<SundaySchoolDepartment>('/departments', {method: 'POST', body: JSON.stringify({name})})

export const updateDepartment = (id: number, data: Partial<{name: string; active: boolean; sortOrder: number}>) =>
  request<SundaySchoolDepartment>(`/departments/${id}`, {method: 'PATCH', body: JSON.stringify(data)})

export const deleteDepartment = (id: number) => request<{ok: true}>(`/departments/${id}`, {method: 'DELETE'})

export const reorderDepartments = (ids: number[]) =>
  request<{ok: true}>('/departments/reorder', {method: 'POST', body: JSON.stringify({ids})})

// --- Grid ---
export const fetchGrid = (year: number, quarter: number) =>
  request<GridResponse>(`/grid?year=${year}&quarter=${quarter}`)

export const saveCount = (data: {weekOf: string; departmentId: number; girls: number | null; boys: number | null}) =>
  request<DepartmentCount>('/counts', {method: 'PUT', body: JSON.stringify(data)})

// --- Charts ---
export const fetchSsSeries = (params: {metric: SsMetric; departmentId: string; from?: string; to?: string}) => {
  const q = new URLSearchParams({metric: params.metric, departmentId: params.departmentId})
  if (params.from) q.set('from', params.from)
  if (params.to) q.set('to', params.to)
  return request<SsSeriesResponse>(`/series?${q.toString()}`)
}

export const fetchSsSummary = (departmentId: string) =>
  request<SsSummaryResponse>(`/summary?departmentId=${encodeURIComponent(departmentId)}`)
