import type {Season} from './fill-america-core'

const BASE_URL = '/api/fill-america'

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

export interface Household {
  id: number
  name: string
  active: boolean
  sortOrder: number
  campaignCount: number
  totalTracts: number
}

export interface CampaignSummary {
  id: number
  title: string
  startDate: string
  endDate: string
  season: Season
  /** Target for Door Hangers — what the church calls packets. Not the roster sum. */
  doorHangerGoal: number | null
  weekCount: number
  householdCount: number
  /** Derived, never stored. See ADR 0032. */
  uniqueParticipants: number
  tracts: number
  doorHangers: number
  /** Every Roster Entry's goal added up — a tract target, a different unit. */
  rosterGoal: number
}

export interface CampaignWeek {
  id: number
  weekNo: number
  weekDate: string
  /** The only typed number on a week. */
  doorHangers: number | null
  tracts: number
  uniqueParticipants: number
}

export interface RosterEntry {
  id: number
  householdId: number
  householdName: string
  householdActive: boolean
  size: number
  goal: number | null
  sortOrder: number
  /** One per week, in week order. null means nothing was reported. */
  tracts: (number | null)[]
  total: number
}

export interface CampaignDetail {
  campaign: {
    id: number
    title: string
    startDate: string
    endDate: string
    season: Season
    doorHangerGoal: number | null
  }
  weeks: CampaignWeek[]
  roster: RosterEntry[]
  totals: {uniqueParticipants: number; tracts: number; doorHangers: number; rosterGoal: number}
}

// --- Households ---
export const fetchHouseholds = (includeInactive = false) =>
  request<Household[]>(`/households${includeInactive ? '?includeInactive=1' : ''}`)

export const createHousehold = (name: string) =>
  request<Household>('/households', {method: 'POST', body: JSON.stringify({name})})

export const updateHousehold = (id: number, data: Partial<{name: string; active: boolean; sortOrder: number}>) =>
  request<Household>(`/households/${id}`, {method: 'PATCH', body: JSON.stringify(data)})

export const deleteHousehold = (id: number) => request<{ok: true}>(`/households/${id}`, {method: 'DELETE'})

export const reorderHouseholds = (ids: number[]) =>
  request<{ok: true}>('/households/reorder', {method: 'POST', body: JSON.stringify({ids})})

// --- Campaigns ---
export const fetchCampaigns = () => request<CampaignSummary[]>('/campaigns')

export const fetchCampaign = (id: number | string) => request<CampaignDetail>(`/campaigns/${id}`)

export const createCampaign = (data: {
  startDate: string
  endDate: string
  season?: Season
  title?: string
  doorHangerGoal?: number | null
}) => request<CampaignSummary>('/campaigns', {method: 'POST', body: JSON.stringify(data)})

export const updateCampaign = (
  id: number,
  data: Partial<{startDate: string; endDate: string; season: Season; title: string; doorHangerGoal: number | null}>,
) => request<CampaignSummary>(`/campaigns/${id}`, {method: 'PATCH', body: JSON.stringify(data)})

export const deleteCampaign = (id: number) => request<{ok: true}>(`/campaigns/${id}`, {method: 'DELETE'})

// --- Grid writes ---
export const saveDoorHangers = (campaignId: number, weekNo: number, doorHangers: number | null) =>
  request<CampaignWeek>(`/campaigns/${campaignId}/weeks/${weekNo}`, {
    method: 'PUT',
    body: JSON.stringify({doorHangers}),
  })

export const saveRosterEntry = (campaignId: number, householdId: number, data: {size: number; goal: number | null}) =>
  request<RosterEntry>(`/campaigns/${campaignId}/roster/${householdId}`, {method: 'PUT', body: JSON.stringify(data)})

/** Repoint a roster row at another household, keeping its size, goal and tracts. */
export const changeRosterHousehold = (campaignId: number, fromHouseholdId: number, householdId: number) =>
  request<RosterEntry>(`/campaigns/${campaignId}/roster/${fromHouseholdId}/household`, {
    method: 'PUT',
    body: JSON.stringify({householdId}),
  })

export const removeRosterEntry = (campaignId: number, householdId: number) =>
  request<{ok: true}>(`/campaigns/${campaignId}/roster/${householdId}`, {method: 'DELETE'})

export const saveTracts = (campaignId: number, householdId: number, weekNo: number, tracts: number | null) =>
  request<unknown>(`/campaigns/${campaignId}/tracts`, {
    method: 'PUT',
    body: JSON.stringify({householdId, weekNo, tracts}),
  })

// --- Dashboard ---

export type FaMetric = 'tracts' | 'doorHangers' | 'uniqueParticipants'

export const FA_METRIC_LABELS: Record<FaMetric, string> = {
  tracts: 'Tracts',
  doorHangers: 'Door Hangers',
  uniqueParticipants: 'Unique Participants',
}

export interface SeriesPoint {
  campaignId: number
  title: string
  startDate: string
  season: Season
  /** null where the metric is not meaningful for the current filter. */
  value: number | null
}

export interface FaSeries {
  metric: FaMetric
  householdId: string
  season: string
  points: SeriesPoint[]
}

export interface FaAgg {
  /** null where the metric is not meaningful for the current filter. */
  total: number | null
  /** Campaigns that actually recorded something, so a fresh one drags nothing down. */
  campaigns: number
  avg: number
}

export interface FaSummary {
  householdId: string
  year: number
  latest: {campaignId: number; title: string; startDate: string; season: Season} | null
  metrics: Record<FaMetric, {latest: number | null; year: FaAgg; allTime: FaAgg}>
}

export interface HouseholdBoardRow {
  householdId: number
  householdName: string
  householdActive: boolean
  tracts: number
  campaigns: number
  avg: number
}

export interface EffortBoardRow {
  householdId: number
  householdName: string
  campaignId: number
  campaignTitle: string
  startDate: string
  season: Season
  tracts: number
}

interface DashboardFilter {
  householdId?: string
  season?: string
  from?: string
  to?: string
}

function query(parts: object): string {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(parts)) if (v !== undefined && v !== '') q.set(k, String(v))
  const s = q.toString()
  return s ? `?${s}` : ''
}

export const fetchFaSeries = (f: DashboardFilter & {metric: FaMetric}) => request<FaSeries>(`/series${query(f)}`)

export const fetchFaSummary = (householdId: string) => request<FaSummary>(`/summary${query({householdId})}`)

export const fetchHouseholdBoard = (f: DashboardFilter & {limit?: number}) =>
  request<{scope: 'household'; rows: HouseholdBoardRow[]}>(`/leaderboard${query({...f, scope: 'household'})}`)

export const fetchEffortBoard = (f: DashboardFilter & {limit?: number}) =>
  request<{scope: 'effort'; rows: EffortBoardRow[]}>(`/leaderboard${query({...f, scope: 'effort'})}`)
