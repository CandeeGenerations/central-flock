const BASE_URL = '/api';

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${url}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  return res.json();
}

// People
export interface Person {
  id: number;
  firstName: string | null;
  lastName: string | null;
  phoneNumber: string;
  phoneDisplay: string | null;
  status: 'active' | 'inactive';
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  groups?: { id: number; name: string }[];
}

export interface PeopleResponse {
  data: Person[];
  total: number;
  page: number;
  limit: number;
}

export function fetchPeople(params?: { search?: string; status?: string; groupId?: string; page?: number; limit?: number }) {
  const searchParams = new URLSearchParams();
  if (params?.search) searchParams.set('search', params.search);
  if (params?.status) searchParams.set('status', params.status);
  if (params?.groupId) searchParams.set('groupId', params.groupId);
  if (params?.page) searchParams.set('page', String(params.page));
  if (params?.limit) searchParams.set('limit', String(params.limit));
  const qs = searchParams.toString();
  return request<PeopleResponse>(`/people${qs ? `?${qs}` : ''}`);
}

export function fetchPerson(id: number) {
  return request<Person>(`/people/${id}`);
}

export function createPerson(data: Partial<Person>) {
  return request<Person>('/people', { method: 'POST', body: JSON.stringify(data) });
}

export function updatePerson(id: number, data: Partial<Person>) {
  return request<Person>(`/people/${id}`, { method: 'PUT', body: JSON.stringify(data) });
}

export function deletePerson(id: number) {
  return request(`/people/${id}`, { method: 'DELETE' });
}

export function togglePersonStatus(id: number) {
  return request<Person>(`/people/${id}/status`, { method: 'PATCH' });
}

// Groups
export interface Group {
  id: number;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  memberCount?: number;
}

export interface GroupWithMembers extends Group {
  members: Person[];
}

export function fetchGroups() {
  return request<Group[]>('/groups');
}

export function fetchGroup(id: number) {
  return request<GroupWithMembers>(`/groups/${id}`);
}

export function createGroup(data: { name: string; description?: string }) {
  return request<Group>('/groups', { method: 'POST', body: JSON.stringify(data) });
}

export function updateGroup(id: number, data: { name?: string; description?: string }) {
  return request<Group>(`/groups/${id}`, { method: 'PUT', body: JSON.stringify(data) });
}

export function deleteGroup(id: number) {
  return request(`/groups/${id}`, { method: 'DELETE' });
}

export function addGroupMembers(groupId: number, personIds: number[]) {
  return request(`/groups/${groupId}/members`, { method: 'POST', body: JSON.stringify({ personIds }) });
}

export function removeGroupMembers(groupId: number, personIds: number[]) {
  return request(`/groups/${groupId}/members`, { method: 'DELETE', body: JSON.stringify({ personIds }) });
}

export function fetchNonMembers(groupId: number, search?: string) {
  const qs = search ? `?search=${encodeURIComponent(search)}` : '';
  return request<Person[]>(`/groups/${groupId}/non-members${qs}`);
}

// Messages
export interface Message {
  id: number;
  content: string;
  renderedPreview: string | null;
  groupId: number | null;
  groupName?: string | null;
  serviceType: 'iMessage' | 'SMS';
  totalRecipients: number;
  sentCount: number;
  failedCount: number;
  skippedCount: number;
  status: 'pending' | 'sending' | 'completed' | 'cancelled';
  batchSize: number;
  batchDelayMs: number;
  createdAt: string;
  completedAt: string | null;
}

export interface MessageRecipient {
  id: number;
  personId: number;
  firstName: string | null;
  lastName: string | null;
  phoneDisplay: string | null;
  renderedContent: string | null;
  status: 'pending' | 'sent' | 'failed' | 'skipped';
  errorMessage: string | null;
  sentAt: string | null;
}

export interface MessageWithRecipients extends Message {
  recipients: MessageRecipient[];
}

export function sendMessage(data: {
  content: string;
  recipientIds: number[];
  excludeIds?: number[];
  groupId?: number;
  serviceType?: 'iMessage' | 'SMS';
  batchSize?: number;
  batchDelayMs?: number;
}) {
  return request<{ messageId: number; jobId: string }>('/messages/send', { method: 'POST', body: JSON.stringify(data) });
}

export function fetchMessages() {
  return request<Message[]>('/messages');
}

export function fetchMessage(id: number) {
  return request<MessageWithRecipients>(`/messages/${id}`);
}

export function fetchMessageStatus(id: number) {
  return request<{
    status: string;
    sentCount: number;
    failedCount: number;
    skippedCount: number;
    totalRecipients: number;
    isProcessing: boolean;
  }>(`/messages/${id}/status`);
}

export function cancelMessage(id: number) {
  return request(`/messages/${id}/cancel`, { method: 'POST' });
}

// Import
export interface ImportPreview {
  people: Array<{
    firstName: string | null;
    lastName: string | null;
    phoneNumber: string;
    phoneDisplay: string;
    status: 'active' | 'inactive';
    groups: string[];
    isDuplicate: boolean;
  }>;
  totalPeople: number;
  duplicates: number;
  uniqueGroups: string[];
  groupCount: number;
}

export function previewImport(csvData: string) {
  return request<ImportPreview>('/import/preview', { method: 'POST', body: JSON.stringify({ csvData }) });
}

export function executeImport(people: ImportPreview['people'], skipDuplicates = true) {
  return request<{
    peopleCreated: number;
    peopleUpdated: number;
    peopleSkipped: number;
    groupsCreated: number;
    membershipsCreated: number;
  }>('/import/execute', { method: 'POST', body: JSON.stringify({ people, skipDuplicates }) });
}

// Contacts
export function createMacContact(personId: number) {
  return request('/contacts/create', { method: 'POST', body: JSON.stringify({ personId }) });
}

export function createBulkMacContacts(personIds: number[]) {
  return request('/contacts/create-bulk', { method: 'POST', body: JSON.stringify({ personIds }) });
}
