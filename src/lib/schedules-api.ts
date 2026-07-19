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

export type ScheduleType = 'nursery' | 'special_music' | 'fair_booth'

export interface FooterBlock {
  kind: 'quote' | 'note' | 'spacer'
  text: string
  bold?: boolean
}

export interface SchedulesSettings {
  logoPath: string | null
  nursery: {
    titlePrefix: string
    footerBlocks: FooterBlock[]
  }
  specialMusic: {
    titlePrefix: string
    footerBlocks: FooterBlock[]
    singerGroupIds: number[]
  }
  fairBooth: {
    titlePrefix: string
    rosterGroupIds: number[]
    minSignupsForBold: number
    gridPageFooterBlocks: FooterBlock[]
    rosterPageFooterBlocks: FooterBlock[]
  }
}

export const fetchSchedulesSettings = () => request<SchedulesSettings>('/schedules/settings')

export const updateSchedulesSettings = (
  body: Partial<{
    nursery: Partial<SchedulesSettings['nursery']>
    specialMusic: Partial<SchedulesSettings['specialMusic']>
    fairBooth: Partial<SchedulesSettings['fairBooth']>
  }>,
) => request<SchedulesSettings>('/schedules/settings', {method: 'PUT', body: JSON.stringify(body)})

export const uploadSchedulesLogo = (imageData: string) =>
  request<{logoPath: string}>('/schedules/settings/logo', {
    method: 'POST',
    body: JSON.stringify({imageData}),
  })

export interface SendScheduleImageInput {
  imageData: string
  recipientIds: number[]
  caption?: string
}

export interface SendResult {
  results: {id: number; name: string; success: boolean; error?: string}[]
}

export const sendScheduleImage = (input: SendScheduleImageInput) =>
  request<SendResult>('/schedules/send-image', {method: 'POST', body: JSON.stringify(input)})

// ── Households ────────────────────────────────────────────────────────

export interface Household {
  id: number
  name: string
  members: {personId: number; firstName: string | null; lastName: string | null}[]
}

export const fetchHouseholds = () => request<Household[]>('/schedules/households')

export const createHousehold = (memberIds: number[], name?: string) =>
  request<Household>('/schedules/households', {method: 'POST', body: JSON.stringify({memberIds, name})})

export const updateHousehold = (id: number, body: {memberIds?: number[]; name?: string}) =>
  request<Household>(`/schedules/households/${id}`, {method: 'PUT', body: JSON.stringify(body)})

export const deleteHousehold = (id: number) =>
  request<{success: true}>(`/schedules/households/${id}`, {method: 'DELETE'})

// ── Envelope CRUD ──────────────────────────────────────────────────────

export interface Schedule {
  id: number
  scheduleType: ScheduleType
  scopeKind: 'monthly' | 'date_range'
  month: number | null
  year: number | null
  scopeStart: string | null
  scopeEnd: string | null
  scopeLabel: string
  status: 'draft' | 'final'
  createdAt: string
  updatedAt: string
}

export const fetchSchedules = (type?: ScheduleType) => request<Schedule[]>(`/schedules${type ? `?type=${type}` : ''}`)

export const fetchSchedule = (id: number) => request<Schedule>(`/schedules/${id}`)

export const createSpecialMusicSchedule = (input: {scopeStart: string; scopeEnd: string; scopeLabel?: string}) =>
  request<Schedule>('/schedules', {
    method: 'POST',
    body: JSON.stringify({scheduleType: 'special_music', ...input}),
  })

export const updateSchedule = (id: number, body: {scopeLabel?: string; status?: 'draft' | 'final'}) =>
  request<Schedule>(`/schedules/${id}`, {method: 'PATCH', body: JSON.stringify(body)})

export const deleteSchedule = (id: number) => request<{success: true}>(`/schedules/${id}`, {method: 'DELETE'})

export const duplicateSchedule = (id: number, body: {scopeStart: string; scopeEnd: string; scopeLabel?: string}) =>
  request<Schedule & {cellsCopied: number; cellsSkipped: number}>(`/schedules/${id}/duplicate`, {
    method: 'POST',
    body: JSON.stringify(body),
  })

// ── Special-Music Schedule cells (date-range view over special_music) ──

export interface SpecialMusicCellPerformer {
  personId: number
  ordering: number
  firstName: string | null
  lastName: string | null
  // Effective render flag — cell override wins over person default.
  displayFirstNameOnly: boolean
  // Underlying values so the editor can show "auto / show / hide" tri-state.
  cellOverride: boolean | null
  personDefault: boolean
  displayName: string | null
  lastSangDate: string | null
}

export interface SpecialMusicCell {
  id: number
  date: string
  serviceType: 'sunday_am' | 'sunday_pm' | 'wednesday_pm' | 'other'
  serviceLabel: string | null
  songTitle: string | null
  type: 'solo' | 'duet' | 'trio' | 'group' | 'instrumental' | 'other'
  status: 'will_perform' | 'needs_review' | 'performed'
  guestPerformers: string[]
  performers: SpecialMusicCellPerformer[]
}

export const fetchSpecialMusicCells = (scheduleId: number) =>
  request<{schedule: Schedule; cells: SpecialMusicCell[]}>(`/schedules/${scheduleId}/cells`)

export const schedulesKeys = {
  settings: ['schedules', 'settings'] as const,
  households: ['schedules', 'households'] as const,
  list: (type?: ScheduleType) => ['schedules', 'list', type ?? 'all'] as const,
  schedule: (id: number) => ['schedules', 'detail', id] as const,
  cells: (id: number) => ['schedules', 'cells', id] as const,
  fairBoothList: ['schedules', 'fair-booth', 'list'] as const,
  fairBooth: (id: number) => ['schedules', 'fair-booth', id] as const,
}

// ── Fair Booth ─────────────────────────────────────────────────────────

export type FairBoothFairRole = 'worker' | 'asst_unit' | 'unit_leader' | 'asst_fair_mgr' | 'fair_mgr'
export type FairBoothShiftRole = 'worker' | 'asst_unit' | 'unit_leader'

export interface FairBoothScheduleListRow extends Schedule {
  signupCount: number
}

export interface FairBoothRosterAttr {
  id: number
  scheduleId: number
  personId: number
  fairRole: FairBoothFairRole
  initialsOverride: string | null
  nameOverride: string | null
  manualInclude: boolean
}

export interface FairBoothSignup {
  id: number
  scheduleId: number
  personId: number
  dayDate: string
  startMinute: number
  endMinute: number
  shiftRole: FairBoothShiftRole
  sortOrder: number
  displayRowOverride: number | null
}

export interface FairBoothScheduleDetail {
  schedule: Schedule
  people: {id: number; firstName: string | null; lastName: string | null; isHispanic: boolean}[]
  rosterPersonIds: number[]
  rosterAttrs: FairBoothRosterAttr[]
  signups: FairBoothSignup[]
}

export const fetchFairBoothSchedules = () => request<FairBoothScheduleListRow[]>('/schedules/fair-booth/')

export const fetchFairBoothSchedule = (id: number) => request<FairBoothScheduleDetail>(`/schedules/fair-booth/${id}`)

export const createFairBoothSchedule = (input: {scopeStart: string; scopeLabel?: string}) =>
  request<Schedule>('/schedules/fair-booth/', {method: 'POST', body: JSON.stringify(input)})

export const updateFairBoothSchedule = (id: number, body: {scopeStart?: string; scopeLabel?: string}) =>
  request<Schedule>(`/schedules/fair-booth/${id}`, {method: 'PATCH', body: JSON.stringify(body)})

export const deleteFairBoothSchedule = (id: number) =>
  request<{success: true}>(`/schedules/fair-booth/${id}`, {method: 'DELETE'})

export const upsertFairBoothRosterAttrs = (
  scheduleId: number,
  personId: number,
  body: {
    fairRole?: FairBoothFairRole
    initialsOverride?: string | null
    nameOverride?: string | null
    manualInclude?: boolean
  },
) =>
  request<FairBoothRosterAttr>(`/schedules/fair-booth/${scheduleId}/roster-attrs/${personId}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  })

export const deleteFairBoothRosterAttrs = (scheduleId: number, personId: number) =>
  request<{success: true}>(`/schedules/fair-booth/${scheduleId}/roster-attrs/${personId}`, {method: 'DELETE'})

export const createFairBoothSignup = (
  scheduleId: number,
  body: {
    personId: number
    dayDate: string
    startMinute: number
    endMinute: number
    shiftRole: FairBoothShiftRole
    sortOrder?: number
    displayRowOverride?: number | null
  },
) =>
  request<FairBoothSignup>(`/schedules/fair-booth/${scheduleId}/signups`, {
    method: 'POST',
    body: JSON.stringify(body),
  })

export const updateFairBoothSignup = (
  scheduleId: number,
  signupId: number,
  body: Partial<{
    personId: number
    dayDate: string
    startMinute: number
    endMinute: number
    shiftRole: FairBoothShiftRole
    sortOrder: number
    displayRowOverride: number | null
  }>,
) =>
  request<FairBoothSignup>(`/schedules/fair-booth/${scheduleId}/signups/${signupId}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  })

export const deleteFairBoothSignup = (scheduleId: number, signupId: number) =>
  request<{success: true}>(`/schedules/fair-booth/${scheduleId}/signups/${signupId}`, {method: 'DELETE'})

export const moveFairBoothSignup = (scheduleId: number, signupId: number, direction: 'up' | 'down') =>
  request<{success: true}>(`/schedules/fair-booth/${scheduleId}/signups/${signupId}/move`, {
    method: 'POST',
    body: JSON.stringify({direction}),
  })

export const rowFairBoothSignup = (scheduleId: number, signupId: number, direction: 'up' | 'down' | 'reset') =>
  request<{displayRowOverride: number | null}>(`/schedules/fair-booth/${scheduleId}/signups/${signupId}/row`, {
    method: 'POST',
    body: JSON.stringify({direction}),
  })
