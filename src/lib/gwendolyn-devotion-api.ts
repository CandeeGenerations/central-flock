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

export type DevotionalBlock = {type: 'point'; text: string} | {type: 'scripture'; text: string; reference: string}

export type GwendolynStatus = 'received' | 'producing' | 'waiting_for_approval' | 'ready_to_upload' | 'done'

export interface GwendolynDevotional {
  id: number
  date: string
  title: string
  blocks: DevotionalBlock[]
  hashtags: string
  rawInput?: string | null
  status: GwendolynStatus
  createdAt: string
  updatedAt: string
}

export interface GwendolynListResponse {
  data: GwendolynDevotional[]
  total: number
  page: number
  limit: number
}

export interface ParseResult {
  title: string
  date: string
  blocks: DevotionalBlock[]
  hashtags: string
  rawInput: string
  warning?: string
}

export function fetchGwendolynDevotionals(params?: {
  search?: string
  status?: string
  page?: number
  limit?: number
  sort?: string
  sortDir?: string
}): Promise<GwendolynListResponse> {
  return request<GwendolynListResponse>(`/gwendolyn-devotions${buildQueryString(params)}`)
}

export function fetchGwendolynDevotional(id: number): Promise<GwendolynDevotional> {
  return request<GwendolynDevotional>(`/gwendolyn-devotions/${id}`)
}

export function parseGwendolynDevotional(rawText: string): Promise<ParseResult> {
  return request<ParseResult>('/gwendolyn-devotions/parse', {
    method: 'POST',
    body: JSON.stringify({rawText}),
  })
}

export function createGwendolynDevotional(
  data: Omit<GwendolynDevotional, 'id' | 'createdAt' | 'updatedAt'>,
): Promise<GwendolynDevotional> {
  return request<GwendolynDevotional>('/gwendolyn-devotions', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export function updateGwendolynDevotional(
  id: number,
  data: Partial<GwendolynDevotional>,
): Promise<GwendolynDevotional> {
  return request<GwendolynDevotional>(`/gwendolyn-devotions/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export function updateGwendolynStatus(id: number, status: GwendolynStatus): Promise<GwendolynDevotional> {
  return request<GwendolynDevotional>(`/gwendolyn-devotions/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({status}),
  })
}

export function regenerateGwendolynHashtags(id: number): Promise<{hashtags: string}> {
  return request<{hashtags: string}>(`/gwendolyn-devotions/${id}/regenerate-hashtags`, {method: 'POST'})
}

export function deleteGwendolynDevotional(id: number): Promise<void> {
  return request<void>(`/gwendolyn-devotions/${id}`, {method: 'DELETE'})
}

export function scheduleGwendolynMessage(
  id: number,
  data: {scheduledAt: string; content?: string},
): Promise<{messageId: number; url: string; scheduledAt: string}> {
  return request(`/gwendolyn-devotions/${id}/schedule-message`, {method: 'POST', body: JSON.stringify(data)})
}

// Copy builders

// Per-block copy (single verse): quote then blank line then reference
export function buildBlockText(block: DevotionalBlock): string {
  if (block.type === 'point') return block.text
  const ref = block.reference?.trim()
  return ref ? `"${block.text}"\n\n${ref}` : `"${block.text}"`
}

// Inline variant used inside full-post copy: quote + reference on same line
function buildBlockTextInline(block: DevotionalBlock): string {
  if (block.type === 'point') return block.text
  const ref = block.reference?.trim()
  return ref ? `"${block.text}" ${ref}` : `"${block.text}"`
}

export function buildCopyHashtags(d: GwendolynDevotional): string {
  const fixed = ['#Faith', '#God', '#Prayer']
  const raw = d.hashtags.trim()
  const aiTags = raw ? raw.split(/\s+/).filter((t) => !fixed.some((f) => f.toLowerCase() === t.toLowerCase())) : []
  return [...fixed, ...aiTags].join(' ')
}

export function buildCopyTitle(d: GwendolynDevotional): string {
  return d.title.trim()
}

export function buildCopyContent(d: GwendolynDevotional): string {
  const blockTexts = d.blocks.map((b) => buildBlockTextInline(b)).join('\n\n')
  return `${blockTexts}\n\n— Passing the truth along\n\n${buildCopyHashtags(d)}`
}
