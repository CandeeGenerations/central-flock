const BASE_URL = '/api/rsvp'

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

export type RsvpStatus = 'yes' | 'no' | 'maybe' | 'no_response'

export interface RsvpCounts {
  yes: number
  no: number
  maybe: number
  no_response: number
  total: number
  expectedAttendees: number
}

export interface RsvpListSummary {
  id: number
  name: string
  calendarEventId: number | null
  standaloneTitle: string | null
  standaloneDate: string | null
  standaloneTime: string | null
  standaloneEndTime: string | null
  createdAt: string
  updatedAt: string
  calendarEventTitle: string | null
  calendarEventStartDate: string | null
  calendarEventEndDate: string | null
  calendarEventLocation: string | null
  effectiveDate: string | null
  counts: RsvpCounts
}

export interface RsvpEntry {
  id: number
  rsvpListId: number
  personId: number
  status: RsvpStatus
  headcount: number | null
  note: string | null
  respondedAt: string | null
  publicToken: string | null
  createdAt: string
  updatedAt: string
  firstName: string | null
  lastName: string | null
  phoneNumber: string | null
  phoneDisplay: string | null
}

export interface RsvpListDetail extends Omit<RsvpListSummary, 'counts'> {
  entries: RsvpEntry[]
  counts: RsvpCounts
  rsvpPublicUrlBase: string
}

export interface RsvpCalendarEvent {
  id: number
  eventUid: string
  title: string
  startDate: string
  endDate: string
  allDay: boolean
  location: string | null
  calendarName: string
}

export interface CreateRsvpListBody {
  name: string
  calendarEventId?: number | null
  standaloneTitle?: string | null
  standaloneDate?: string | null
  standaloneTime?: string | null
  standaloneEndTime?: string | null
  seedGroupIds?: number[]
  seedPersonIds?: number[]
}

export interface UpdateRsvpListBody {
  name?: string
  calendarEventId?: number | null
  standaloneTitle?: string | null
  standaloneDate?: string | null
  standaloneTime?: string | null
  standaloneEndTime?: string | null
}

export interface UpdateRsvpEntryBody {
  status?: RsvpStatus
  headcount?: number | null
  note?: string | null
}

export function fetchRsvpLists(includeArchived: boolean): Promise<RsvpListSummary[]> {
  return request(`/lists?archived=${includeArchived ? 'true' : 'false'}`)
}

export function fetchRsvpList(id: number): Promise<RsvpListDetail> {
  return request(`/lists/${id}`)
}

export function createRsvpList(body: CreateRsvpListBody): Promise<RsvpListSummary> {
  return request('/lists', {method: 'POST', body: JSON.stringify(body)})
}

export function updateRsvpList(id: number, body: UpdateRsvpListBody): Promise<RsvpListSummary> {
  return request(`/lists/${id}`, {method: 'PATCH', body: JSON.stringify(body)})
}

export function deleteRsvpList(id: number): Promise<{success: true}> {
  return request(`/lists/${id}`, {method: 'DELETE'})
}

export function addRsvpEntries(listId: number, personIds: number[]): Promise<{added: number; alreadyOnList: number}> {
  return request(`/lists/${listId}/entries`, {
    method: 'POST',
    body: JSON.stringify({personIds}),
  })
}

export function updateRsvpEntry(id: number, body: UpdateRsvpEntryBody): Promise<RsvpEntry> {
  return request(`/entries/${id}`, {method: 'PATCH', body: JSON.stringify(body)})
}

export function bulkUpdateRsvpEntries(
  ids: number[],
  body: {status?: RsvpStatus; removeFromList?: boolean},
): Promise<{updated?: number; removed?: number}> {
  return request(`/entries/bulk`, {method: 'POST', body: JSON.stringify({ids, ...body})})
}

export function deleteRsvpEntry(id: number): Promise<{success: true}> {
  return request(`/entries/${id}`, {method: 'DELETE'})
}

export function fetchRsvpCalendarEvents(days = 120): Promise<RsvpCalendarEvent[]> {
  return request(`/calendar-events?days=${days}`)
}

export interface NonEntryPerson {
  id: number
  firstName: string | null
  lastName: string | null
  phoneNumber: string | null
  phoneDisplay: string | null
}

export interface NonEntriesResponse {
  data: NonEntryPerson[]
  total: number
  page: number
  limit: number
}

export function fetchRsvpNonEntries(
  listId: number,
  params: {search?: string; page?: number; limit?: number} = {},
): Promise<NonEntriesResponse> {
  const qs = new URLSearchParams()
  if (params.search) qs.set('search', params.search)
  if (params.page) qs.set('page', String(params.page))
  if (params.limit) qs.set('limit', String(params.limit))
  const query = qs.toString()
  return request(`/lists/${listId}/non-entries${query ? `?${query}` : ''}`)
}

export const STATUS_LABELS: Record<RsvpStatus, string> = {
  yes: 'Yes',
  no: 'No',
  maybe: 'Maybe',
  no_response: 'No Response',
}

export interface RsvpListContext {
  id: number
  name: string
  eventTitle: string
  eventDate: string | null
  eventTime: string | null
  eventEndTime: string | null
  firstEntryPublicToken: string | null
  rsvpPublicUrlBase: string
  missingEntryCount: number
}

export function fetchRsvpListContext(listId: number): Promise<RsvpListContext> {
  return request(`/lists/${listId}/context`)
}

export interface MissingEntriesCheckResponse {
  missingPersonIds: number[]
}

export function checkMissingRsvpEntries(listId: number, personIds: number[]): Promise<MissingEntriesCheckResponse> {
  return request(`/lists/${listId}/missing-entries`, {method: 'POST', body: JSON.stringify({personIds})})
}
