const BASE_URL = '/api/attendance'

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

export type Metric = 'attendance' | 'streaming' | 'total'

export interface ServiceTime {
  id: number
  name: string
  dayOfWeek: number
  time: string
  active: boolean
  sortOrder: number
  recordCount: number
}

export interface ServiceRecordRow {
  id: number
  serviceTimeId: number
  serviceTimeName: string
  serviceDate: string
  attendance: number | null
  streaming: number | null
  enteredBy: string | null
  enteredAt: string | null
}

export interface Recorder {
  id: number
  name: string
  token: string
  active: boolean
  editCount: number
}

export interface RecordEdit {
  id: number
  recorderName: string
  attendance: number | null
  streaming: number | null
  createdAt: string
}

export interface SeriesPoint {
  date: string
  value: number
}

export interface SeriesResponse {
  metric: Metric
  serviceTimeId: string
  points: SeriesPoint[]
}

export interface MetricAgg {
  total: number
  count: number
  avg: number
}
export interface SummaryResponse {
  monthStart: string
  yearStart: string
  metrics: Record<Metric, {month: MetricAgg; year: MetricAgg}>
}

export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

// --- Service Times ---
export const fetchServiceTimes = (includeInactive = false) =>
  request<ServiceTime[]>(`/service-times${includeInactive ? '?includeInactive=1' : ''}`)

export const createServiceTime = (data: {name: string; dayOfWeek: number; time: string}) =>
  request<ServiceTime>('/service-times', {method: 'POST', body: JSON.stringify(data)})

export const updateServiceTime = (
  id: number,
  data: Partial<{name: string; dayOfWeek: number; time: string; active: boolean; sortOrder: number}>,
) => request<ServiceTime>(`/service-times/${id}`, {method: 'PATCH', body: JSON.stringify(data)})

export const deleteServiceTime = (id: number) => request<{ok: true}>(`/service-times/${id}`, {method: 'DELETE'})

export const reorderServiceTimes = (ids: number[]) =>
  request<{ok: true}>('/service-times/reorder', {method: 'POST', body: JSON.stringify({ids})})

// --- Records ---
export const fetchRecords = (params: {serviceTimeId?: number | null; from?: string; to?: string; limit?: number}) => {
  const q = new URLSearchParams()
  if (params.serviceTimeId) q.set('serviceTimeId', String(params.serviceTimeId))
  if (params.from) q.set('from', params.from)
  if (params.to) q.set('to', params.to)
  if (params.limit) q.set('limit', String(params.limit))
  return request<ServiceRecordRow[]>(`/records?${q.toString()}`)
}

export const updateRecord = (id: number, data: {attendance?: number | null; streaming?: number | null}) =>
  request<ServiceRecordRow>(`/records/${id}`, {method: 'PATCH', body: JSON.stringify(data)})

// --- Charts ---
export const fetchSeries = (params: {metric: Metric; serviceTimeId: string; from?: string; to?: string}) => {
  const q = new URLSearchParams({metric: params.metric, serviceTimeId: params.serviceTimeId})
  if (params.from) q.set('from', params.from)
  if (params.to) q.set('to', params.to)
  return request<SeriesResponse>(`/series?${q.toString()}`)
}

export const fetchSummary = (serviceTimeId: string) =>
  request<SummaryResponse>(`/summary?serviceTimeId=${encodeURIComponent(serviceTimeId)}`)

export const fetchRecordHistory = (recordId: number) => request<RecordEdit[]>(`/records/${recordId}/history`)

// --- Recorders ---
export const fetchAttendanceConfig = () => request<{publicUrlBase: string}>('/config')

export const fetchRecorders = () => request<Recorder[]>('/recorders')

export const createRecorder = (name: string) =>
  request<Recorder>('/recorders', {method: 'POST', body: JSON.stringify({name})})

export const updateRecorder = (id: number, data: Partial<{name: string; active: boolean}>) =>
  request<Recorder>(`/recorders/${id}`, {method: 'PATCH', body: JSON.stringify(data)})

export const regenerateRecorderToken = (id: number) =>
  request<Recorder>(`/recorders/${id}/regenerate`, {method: 'POST'})

export const deleteRecorder = (id: number) => request<{ok: true}>(`/recorders/${id}`, {method: 'DELETE'})
