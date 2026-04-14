const BASE_URL = '/api'

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${url}`, {
    credentials: 'include',
    headers: {'Content-Type': 'application/json'},
    ...options,
  })
  if (res.status === 401 && !url.startsWith('/auth/')) {
    window.location.href = '/login'
    throw new Error('Unauthorized')
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `Request failed: ${res.status}`)
  }
  return res.json()
}

// ── Types ────────────────────────────────────────────────────────────

export type ServiceType = 'sunday_school' | 'morning' | 'evening' | 'wednesday_evening'

export interface WorkerService {
  id: number
  workerId: number
  serviceType: ServiceType
  maxPerMonth: number | null
}

export interface NurseryWorker {
  id: number
  name: string
  maxPerMonth: number
  allowMultiplePerDay: boolean
  isActive: boolean
  createdAt: string
  updatedAt: string
  services: WorkerService[]
}

export interface ServiceConfig {
  serviceType: ServiceType
  label: string
  workerCount: number
  sortOrder: number
}

export interface NurserySchedule {
  id: number
  month: number
  year: number
  status: 'draft' | 'final'
  createdAt: string
  updatedAt: string
}

export interface NurseryAssignment {
  id: number
  scheduleId: number
  date: string
  serviceType: ServiceType
  slot: number
  workerId: number | null
  workerName: string | null
}

export interface ScheduleWithAssignments extends NurserySchedule {
  assignments: NurseryAssignment[]
}

// ── Workers ──────────────────────────────────────────────────────────

export function fetchNurseryWorkers(): Promise<NurseryWorker[]> {
  return request('/nursery/workers')
}

export function createNurseryWorker(data: {
  name: string
  maxPerMonth?: number
  allowMultiplePerDay?: boolean
  services?: {serviceType: ServiceType; maxPerMonth?: number | null}[]
}): Promise<NurseryWorker> {
  return request('/nursery/workers', {method: 'POST', body: JSON.stringify(data)})
}

export function updateNurseryWorker(
  id: number,
  data: Partial<{name: string; maxPerMonth: number; allowMultiplePerDay: boolean; isActive: boolean}>,
): Promise<NurseryWorker> {
  return request(`/nursery/workers/${id}`, {method: 'PUT', body: JSON.stringify(data)})
}

export function deleteNurseryWorker(id: number): Promise<{success: boolean}> {
  return request(`/nursery/workers/${id}`, {method: 'DELETE'})
}

export function updateWorkerServices(
  id: number,
  services: {serviceType: ServiceType; maxPerMonth: number | null}[],
): Promise<NurseryWorker> {
  return request(`/nursery/workers/${id}/services`, {method: 'PUT', body: JSON.stringify({services})})
}

// ── Service Config ───────────────────────────────────────────────────

export function fetchServiceConfig(): Promise<ServiceConfig[]> {
  return request('/nursery/service-config')
}

export function updateServiceConfig(type: ServiceType, workerCount: number): Promise<ServiceConfig> {
  return request(`/nursery/service-config/${type}`, {method: 'PUT', body: JSON.stringify({workerCount})})
}

// ── Schedules ────────────────────────────────────────────────────────

export function fetchNurserySchedules(): Promise<NurserySchedule[]> {
  return request('/nursery/schedules')
}

export function generateNurserySchedule(month: number, year: number): Promise<ScheduleWithAssignments> {
  return request('/nursery/schedules/generate', {method: 'POST', body: JSON.stringify({month, year})})
}

export function fetchNurserySchedule(id: number): Promise<ScheduleWithAssignments> {
  return request(`/nursery/schedules/${id}`)
}

export function updateScheduleStatus(id: number, status: 'draft' | 'final'): Promise<NurserySchedule> {
  return request(`/nursery/schedules/${id}/status`, {method: 'PUT', body: JSON.stringify({status})})
}

export function deleteNurserySchedule(id: number): Promise<{success: boolean}> {
  return request(`/nursery/schedules/${id}`, {method: 'DELETE'})
}

export function updateAssignment(id: number, workerId: number | null): Promise<NurseryAssignment> {
  return request(`/nursery/schedules/assignments/${id}`, {method: 'PATCH', body: JSON.stringify({workerId})})
}

// ── Settings ─────────────────────────────────────────────────────────

export function fetchNurserySettings(): Promise<Record<string, string>> {
  return request('/nursery/settings')
}

export function updateNurserySetting(key: string, value: string): Promise<{key: string; value: string}> {
  return request(`/nursery/settings/${key}`, {method: 'PUT', body: JSON.stringify({value})})
}

export function uploadNurseryLogo(imageData: string): Promise<{logoPath: string}> {
  return request('/nursery/settings/logo', {method: 'POST', body: JSON.stringify({imageData})})
}

// ── Send Schedule as Image ───────────────────────────────────────────

export interface SendImageResult {
  id: number
  name: string
  success: boolean
  error?: string
}

export function sendScheduleImage(params: {
  imageData: string
  recipientIds: number[]
  caption?: string
}): Promise<{results: SendImageResult[]}> {
  return request('/nursery/send-image', {method: 'POST', body: JSON.stringify(params)})
}
