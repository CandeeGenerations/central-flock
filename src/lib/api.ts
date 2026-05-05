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

function buildQueryString(params?: Record<string, string | number | undefined>): string {
  if (!params) return ''
  const searchParams = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') searchParams.set(key, String(value))
  }
  const qs = searchParams.toString()
  return qs ? `?${qs}` : ''
}

// Auth
export interface AuthStatus {
  authRequired: boolean
  authenticated: boolean
}

export function login(password: string) {
  return request<{success: boolean}>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({password}),
  })
}

export function logout() {
  return request<{success: boolean}>('/auth/logout', {method: 'POST'})
}

export async function checkAuthStatus(): Promise<AuthStatus> {
  const res = await fetch(`${BASE_URL}/auth/status`, {credentials: 'include'})
  return res.json()
}

// People
export interface Person {
  id: number
  firstName: string | null
  lastName: string | null
  phoneNumber: string | null
  phoneDisplay: string | null
  status: 'active' | 'inactive' | 'do_not_contact'
  birthMonth: number | null
  birthDay: number | null
  birthYear: number | null
  anniversaryMonth: number | null
  anniversaryDay: number | null
  anniversaryYear: number | null
  notes: string | null
  createdAt: string
  updatedAt: string
  groups?: {id: number; name: string}[]
}

export interface PeopleResponse {
  data: Person[]
  total: number
  page: number
  limit: number
}

export interface DuplicateResults {
  nameDuplicates: {name: string; people: Person[]}[]
  phoneDuplicates: {people: Person[]}[]
}

export function fetchDuplicates() {
  return request<DuplicateResults>('/people/duplicates')
}

export function fetchPeople(params?: {
  search?: string
  status?: string
  groupId?: string
  page?: number
  limit?: number
  sort?: string
  sortDir?: string
}) {
  return request<PeopleResponse>(`/people${buildQueryString(params)}`)
}

export function fetchPerson(id: number) {
  return request<Person>(`/people/${id}`)
}

export function createPerson(data: Partial<Person> & {groupIds?: number[]}) {
  return request<Person>('/people', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export function updatePerson(id: number, data: Partial<Person>) {
  return request<Person>(`/people/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export function deletePerson(id: number) {
  return request(`/people/${id}`, {method: 'DELETE'})
}

export function togglePersonStatus(id: number) {
  return request<Person>(`/people/${id}/status`, {method: 'PATCH'})
}

export async function exportPeopleCSV() {
  const res = await fetch(`${BASE_URL}/people/export`, {credentials: 'include'})
  if (!res.ok) throw new Error('Export failed')
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'people-export.csv'
  a.click()
  URL.revokeObjectURL(url)
}

// Groups
export interface Group {
  id: number
  name: string
  description: string | null
  createdAt: string
  updatedAt: string
  memberCount?: number
}

export interface GroupWithMembers extends Group {
  members: Person[]
}

export function fetchGroups() {
  return request<Group[]>('/groups')
}

export function fetchGroup(id: number) {
  return request<GroupWithMembers>(`/groups/${id}`)
}

export function createGroup(data: {name: string; description?: string}) {
  return request<Group>('/groups', {method: 'POST', body: JSON.stringify(data)})
}

export function updateGroup(id: number, data: {name?: string; description?: string}) {
  return request<Group>(`/groups/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export function deleteGroup(id: number) {
  return request(`/groups/${id}`, {method: 'DELETE'})
}

export function duplicateGroup(id: number) {
  return request<Group>(`/groups/${id}/duplicate`, {method: 'POST'})
}

export function addGroupMembers(groupId: number, personIds: number[]) {
  return request(`/groups/${groupId}/members`, {
    method: 'POST',
    body: JSON.stringify({personIds}),
  })
}

export async function exportGroupCSV(groupId: number) {
  const res = await fetch(`${BASE_URL}/groups/${groupId}/export`, {credentials: 'include'})
  if (!res.ok) throw new Error('Export failed')
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = res.headers.get('Content-Disposition')?.match(/filename="(.+)"/)?.[1] || 'group-export.csv'
  a.click()
  URL.revokeObjectURL(url)
}

export function removeGroupMembers(groupId: number, personIds: number[]) {
  return request(`/groups/${groupId}/members`, {
    method: 'DELETE',
    body: JSON.stringify({personIds}),
  })
}

export interface NonMembersResponse {
  data: Person[]
  total: number
  page: number
  limit: number
}

export function fetchNonMembers(groupId: number, params?: {search?: string; page?: number; limit?: number}) {
  return request<NonMembersResponse>(`/groups/${groupId}/non-members${buildQueryString(params)}`)
}

// Messages
export interface Message {
  id: number
  content: string
  renderedPreview: string | null
  groupId: number | null
  groupName?: string | null
  totalRecipients: number
  sentCount: number
  failedCount: number
  skippedCount: number
  status: 'pending' | 'scheduled' | 'past_due' | 'sending' | 'completed' | 'cancelled'
  batchSize: number
  batchDelayMs: number
  scheduledAt: string | null
  templateState: string | null
  createdAt: string
  completedAt: string | null
  source: 'manual' | 'birthday_scheduler'
  extraNames?: string[]
  recipientNames?: string[]
}

export interface MessageRecipient {
  id: number
  personId: number
  firstName: string | null
  lastName: string | null
  phoneDisplay: string | null
  renderedContent: string | null
  status: 'pending' | 'sent' | 'failed' | 'skipped'
  errorMessage: string | null
  sentAt: string | null
}

export interface MessageWithRecipients extends Message {
  recipients: MessageRecipient[]
}

export function sendMessage(data: {
  content: string
  recipientIds: number[]
  excludeIds?: number[]
  groupId?: number
  batchSize?: number
  batchDelayMs?: number
  customVarValues?: Record<string, string>
  scheduledAt?: string
  templateState?: string
}) {
  return request<{messageId: number; jobId?: string; scheduled?: boolean}>('/messages/send', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export function deleteMessages(ids: number[]) {
  return request<{success: boolean; deleted: number}>('/messages/delete', {
    method: 'POST',
    body: JSON.stringify({ids}),
  })
}

export function fetchMessages(params?: {search?: string}) {
  return request<Message[]>(`/messages${buildQueryString(params)}`)
}

export function fetchMessage(id: number) {
  return request<MessageWithRecipients>(`/messages/${id}`)
}

export function fetchMessageStatus(id: number) {
  return request<{
    status: string
    sentCount: number
    failedCount: number
    skippedCount: number
    totalRecipients: number
    isProcessing: boolean
  }>(`/messages/${id}/status`)
}

export function cancelMessage(id: number) {
  return request<{success: boolean; draftId?: number}>(`/messages/${id}/cancel`, {method: 'POST'})
}

export function sendNowMessage(id: number) {
  return request<{success: boolean; jobId: string}>(`/messages/${id}/send-now`, {method: 'POST'})
}

export function resumeMessage(id: number) {
  return request<{success: boolean; jobId: string}>(`/messages/${id}/resume`, {method: 'POST'})
}

export function duplicateMessage(id: number) {
  return request<Draft>(`/messages/${id}/duplicate`, {method: 'POST'})
}

export function updateMessage(
  id: number,
  data: {
    content: string
    recipientIds: number[]
    excludeIds?: number[]
    groupId?: number
    batchSize?: number
    batchDelayMs?: number
    customVarValues?: Record<string, string>
    scheduledAt?: string
    templateState?: string
  },
) {
  return request<{messageId: number; scheduled?: boolean}>(`/messages/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

// Drafts
export interface Draft {
  id: number
  name: string | null
  content: string
  recipientMode: 'group' | 'individual'
  groupId: number | null
  groupName?: string | null
  selectedIndividualIds: string | null
  excludeIds: string | null
  batchSize: number
  batchDelayMs: number
  scheduledAt: string | null
  templateState: string | null
  recipientCount?: number
  renderedPreview?: string | null
  extraNames?: string[]
  createdAt: string
  updatedAt: string
}

export function fetchDrafts(params?: {search?: string}) {
  return request<Draft[]>(`/drafts${buildQueryString(params)}`)
}

export function fetchDraft(id: number) {
  return request<Draft>(`/drafts/${id}`)
}

export function createDraft(data: Partial<Omit<Draft, 'id' | 'createdAt' | 'updatedAt'>>) {
  return request<Draft>('/drafts', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export function updateDraft(id: number, data: Partial<Omit<Draft, 'id' | 'createdAt' | 'updatedAt'>>) {
  return request<Draft>(`/drafts/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export function duplicateDraft(id: number) {
  return request<Draft>(`/drafts/${id}/duplicate`, {method: 'POST'})
}

export function deleteDrafts(ids: number[]) {
  return request<{success: boolean; deleted: number}>('/drafts/delete', {
    method: 'POST',
    body: JSON.stringify({ids}),
  })
}

// Templates
export interface TemplateVariable {
  name: string
  type: 'text' | 'date'
}

export interface Template {
  id: number
  name: string
  content: string
  customVariables: string | null
  createdAt: string
  updatedAt: string
}

export function fetchTemplates(params?: {search?: string}) {
  return request<Template[]>(`/templates${buildQueryString(params)}`)
}

export function fetchTemplate(id: number) {
  return request<Template>(`/templates/${id}`)
}

export function createTemplate(data: {name: string; content?: string; customVariables?: string | null}) {
  return request<Template>('/templates', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export function updateTemplate(id: number, data: {name?: string; content?: string; customVariables?: string | null}) {
  return request<Template>(`/templates/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export function duplicateTemplate(id: number) {
  return request<Template>(`/templates/${id}/duplicate`, {method: 'POST'})
}

export function deleteTemplates(ids: number[]) {
  return request<{success: boolean; deleted: number}>('/templates/delete', {
    method: 'POST',
    body: JSON.stringify({ids}),
  })
}

// Global Variables
export interface GlobalVariable {
  id: number
  name: string
  value: string
  createdAt: string
  updatedAt: string
}

export function fetchGlobalVariables(params?: {search?: string}) {
  return request<GlobalVariable[]>(`/global-variables${buildQueryString(params)}`)
}

export function fetchGlobalVariable(id: number) {
  return request<GlobalVariable>(`/global-variables/${id}`)
}

export function createGlobalVariable(data: {name: string; value: string}) {
  return request<GlobalVariable>('/global-variables', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export function updateGlobalVariable(id: number, data: {name?: string; value?: string}) {
  return request<GlobalVariable>(`/global-variables/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export function deleteGlobalVariables(ids: number[]) {
  return request<{success: boolean; deleted: number}>('/global-variables/delete', {
    method: 'POST',
    body: JSON.stringify({ids}),
  })
}

// Import
export interface ImportPreview {
  people: Array<{
    firstName: string | null
    lastName: string | null
    phoneNumber: string
    phoneDisplay: string
    status: 'active' | 'inactive' | 'do_not_contact'
    groups: string[]
    isDuplicate: boolean
  }>
  totalPeople: number
  duplicates: number
  uniqueGroups: string[]
  groupCount: number
}

export function previewImport(csvData: string) {
  return request<ImportPreview>('/import/preview', {
    method: 'POST',
    body: JSON.stringify({csvData}),
  })
}

export function executeImport(people: ImportPreview['people'], skipDuplicates = true) {
  return request<{
    peopleCreated: number
    peopleUpdated: number
    peopleSkipped: number
    groupsCreated: number
    membershipsCreated: number
  }>('/import/execute', {
    method: 'POST',
    body: JSON.stringify({people, skipDuplicates}),
  })
}

// Contacts - Import from macOS
export interface MacContactPhone {
  label: string
  value: string
  normalized: string
}

export interface MacContactMatch {
  id: string
  firstName: string
  lastName: string
  phones: MacContactPhone[]
  matchStatus: 'new' | 'exists' | 'differs'
  existingPersonId?: number
  differences?: {field: string; contact: string; existing: string}[]
}

export interface MacContactsResponse {
  contacts: MacContactMatch[]
  total: number
}

export function fetchMacContacts() {
  return request<MacContactsResponse>('/contacts')
}

export function importMacContacts(
  contacts: {firstName: string; lastName: string; phoneNumber: string; phoneDisplay: string}[],
  skipDuplicates = true,
) {
  return request<{created: number; updated: number; skipped: number}>('/contacts/import', {
    method: 'POST',
    body: JSON.stringify({contacts, skipDuplicates}),
  })
}

export function dismissContacts(contacts: {contactId: string; firstName?: string; lastName?: string}[]) {
  return request<{dismissed: number}>('/contacts/dismiss', {
    method: 'POST',
    body: JSON.stringify({contacts}),
  })
}

export interface DismissedContact {
  id: number
  contactId: string
  firstName: string | null
  lastName: string | null
  dismissedAt: string
}

export function fetchDismissedContacts() {
  return request<{contacts: DismissedContact[]; total: number}>('/contacts/dismissed')
}

export function undismissContact(contactId: string) {
  return request<{success: boolean}>(`/contacts/dismiss/${contactId}`, {method: 'DELETE'})
}

// Contacts - Create in macOS
export function createMacContact(personId: number) {
  return request('/contacts/create', {
    method: 'POST',
    body: JSON.stringify({personId}),
  })
}

export function createBulkMacContacts(personIds: number[]) {
  return request('/contacts/create-bulk', {
    method: 'POST',
    body: JSON.stringify({personIds}),
  })
}

// Settings
export type Settings = Record<string, string>

export function fetchSettings() {
  return request<Settings>('/settings')
}

export function updateSetting(key: string, value: string) {
  return request<{key: string; value: string}>(`/settings/${key}`, {
    method: 'PUT',
    body: JSON.stringify({value}),
  })
}

// Stats
export interface StatsResponse {
  people: {total: number; active: number; inactive: number; doNotContact: number}
  groups: {
    total: number
  }
  messages: {
    total: number
    totalRecipients: number
    totalSent: number
    totalFailed: number
    totalSkipped: number
    recentMessages: {
      id: number
      content: string
      renderedPreview: string | null
      status: string
      totalRecipients: number
      sentCount: number
      failedCount: number
      groupName: string | null
      createdAt: string
      completedAt: string | null
    }[]
    scheduledMessages: {
      id: number
      content: string
      renderedPreview: string | null
      status: string
      totalRecipients: number
      groupName: string | null
      scheduledAt: string | null
    }[]
  }
  drafts: {total: number}
  templates: {total: number}
}

export interface StatsOverTimeResponse {
  data: {label: string; sent: number; failed: number; skipped: number}[]
}

export function fetchStats() {
  return request<StatsResponse>('/stats')
}

export function fetchStatsOverTime(params?: {from?: string; to?: string}) {
  return request<StatsOverTimeResponse>(`/stats/over-time${buildQueryString(params)}`)
}

// Home
export interface HomeUpcomingBirthday {
  personId: number
  name: string
  daysUntil: number
  month: number
  day: number
  turningAge: number | null
}

export interface HomeUpcomingAnniversary {
  personId: number
  name: string
  daysUntil: number
  month: number
  day: number
  years: number | null
}

export interface HomePinnedItem {
  id: number
  type: 'person' | 'group' | 'template'
  itemId: number
  name: string
  subtitle: string
}

export interface HomeUpcomingChurchEvent {
  id: string
  title: string
  startDate: string
  endDate: string
  allDay: boolean
  location: string | null
  calendarName: string
  recurring: boolean
}

export interface HomeResponse {
  upcomingBirthdays: HomeUpcomingBirthday[]
  upcomingAnniversaries: HomeUpcomingAnniversary[]
  upcomingChurchEvents: HomeUpcomingChurchEvent[]
  calendarColors: Record<string, string>
  stats: {
    people: number
    groups: number
    templates: number
    messagesSentThisMonth: number
    devotionsTotal: number
    devotionsLatestNumber: number
    devotionsCompletionRate: number
    quotesTotal: number
    upcomingChurchEventsTotal: number
  }
  pinnedItems: HomePinnedItem[]
}

export function fetchHome() {
  return request<HomeResponse>('/home')
}

export function pinHomeItem(type: string, itemId: number) {
  return request<{id: number}>('/home/pin', {
    method: 'POST',
    body: JSON.stringify({type, itemId}),
  })
}

export function unpinHomeItem(id: number) {
  return request<{success: boolean}>(`/home/pin/${id}`, {method: 'DELETE'})
}

// Calendar
export interface CalendarInfo {
  name: string
  color: string
}

export interface CalendarEvent {
  id: string
  title: string
  startDate: string
  endDate: string
  allDay: boolean
  location: string | null
  calendarName: string
  recurring: boolean
}

export interface CalendarEventsResponse {
  events: CalendarEvent[]
  calendarNames: string[]
  missing: string[]
  calendarColors: Record<string, string>
  lastSyncedAt: string | null
  lastSyncError: string | null
}

export interface CalendarSyncResponse {
  ok: boolean
  events: number
  missing: string[]
  error?: string
  lastSyncedAt: string | null
}

export function fetchAvailableCalendars() {
  return request<{calendars: CalendarInfo[]}>('/calendar/calendars')
}

export function fetchCalendarEvents(days: number) {
  return request<CalendarEventsResponse>(`/calendar/events${buildQueryString({days})}`)
}

export function triggerCalendarSync() {
  return request<CalendarSyncResponse>('/calendar/sync', {method: 'POST'})
}

// Calendar Print
export type CalendarPrintEventStyle = 'bold' | 'no_kaya' | 'regular'

export interface CalendarPrintPage {
  id: number
  year: number
  month: number
  theme: string | null
  themeColor: string | null
  verseText: string | null
  verseReference: string | null
  normalScheduleText: string | null
  createdAt: string
  updatedAt: string
}

export interface CalendarPrintEvent {
  id: number
  pageId: number
  date: string
  title: string
  style: CalendarPrintEventStyle
  sortOrder: number
  createdAt: string
}

export interface CalendarPrintPageResponse {
  page: CalendarPrintPage
  events: CalendarPrintEvent[]
  defaultSchedule: string
}

export function fetchCalendarPrintPage(year: number, month: number) {
  return request<CalendarPrintPageResponse>(`/calendar-print/${year}/${month}`)
}

export function updateCalendarPrintPage(
  year: number,
  month: number,
  data: {
    theme?: string | null
    themeColor?: string | null
    verseText?: string | null
    verseReference?: string | null
    normalScheduleText?: string | null
  },
) {
  return request<CalendarPrintPage>(`/calendar-print/${year}/${month}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export function createCalendarPrintEvent(
  year: number,
  month: number,
  data: {date: string; title: string; style: CalendarPrintEventStyle; sortOrder?: number},
) {
  return request<CalendarPrintEvent>(`/calendar-print/${year}/${month}/events`, {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export function updateCalendarPrintEvent(
  id: number,
  data: {date?: string; title?: string; style?: CalendarPrintEventStyle; sortOrder?: number},
) {
  return request<CalendarPrintEvent>(`/calendar-print/events/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export function deleteCalendarPrintEvent(id: number) {
  return request<{success: boolean}>(`/calendar-print/events/${id}`, {method: 'DELETE'})
}

export function fetchCalendarPrintDefaultSchedule() {
  return request<{value: string}>('/calendar-print/default-schedule')
}

export function updateCalendarPrintDefaultSchedule(value: string) {
  return request<{value: string}>('/calendar-print/default-schedule', {
    method: 'PUT',
    body: JSON.stringify({value}),
  })
}
