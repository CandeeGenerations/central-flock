const BASE_URL = '/api'

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${url}`, {
    headers: {'Content-Type': 'application/json'},
    ...options,
  })
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

// People
export interface Person {
  id: number
  firstName: string | null
  lastName: string | null
  phoneNumber: string
  phoneDisplay: string | null
  status: 'active' | 'inactive' | 'do_not_contact'
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

export function createPerson(data: Partial<Person>) {
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
  const res = await fetch(`${BASE_URL}/people/export`)
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

export function addGroupMembers(groupId: number, personIds: number[]) {
  return request(`/groups/${groupId}/members`, {
    method: 'POST',
    body: JSON.stringify({personIds}),
  })
}

export async function exportGroupCSV(groupId: number) {
  const res = await fetch(`${BASE_URL}/groups/${groupId}/export`)
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

// Contacts
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
