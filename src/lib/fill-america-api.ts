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
  /** The campaign's own target, in tracts. Not the sum of roster goals. */
  goal: number | null
  weekCount: number
  householdCount: number
  /** Derived, never stored. See ADR 0032. */
  uniqueParticipants: number
  tracts: number
  doorHangers: number
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
  campaign: {id: number; title: string; startDate: string; endDate: string; season: Season; goal: number | null}
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
  goal?: number | null
}) => request<CampaignSummary>('/campaigns', {method: 'POST', body: JSON.stringify(data)})

export const updateCampaign = (
  id: number,
  data: Partial<{startDate: string; endDate: string; season: Season; title: string; goal: number | null}>,
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
