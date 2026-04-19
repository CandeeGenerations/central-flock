const BASE_URL = '/api'

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
    throw new Error((body as {error?: string}).error || `Request failed: ${res.status}`)
  }
  return res.json() as Promise<T>
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

export type HymnBook = 'burgundy' | 'silver'
export type HymnalFilter = 'burgundy' | 'silver' | 'both'

export interface HymnPick {
  hymnId: number
  book: HymnBook
  number: number
  title: string
  why: string
  lyricSnippet?: string
}

export interface HymnFlowStep {
  step: number
  slot: 'opening' | 'congregational' | 'special' | 'invitation' | 'other'
  hymnId?: number
  label: string
}

export interface HymnSuggestionSections {
  opening: HymnPick
  congregational: HymnPick[]
  alternate?: HymnPick
  special: HymnPick[]
  invitation: {primary: HymnPick; alternate?: HymnPick}
  flow: HymnFlowStep[]
}

export interface HymnSuggestionInput {
  title: string
  scriptureText: string
  theme: string
  audience: string
  hymnalFilter?: HymnalFilter
}

export interface HymnSuggestionResult {
  searchId: number
  sections: HymnSuggestionSections
  model: string
  candidateCount: number
  durationMs: number
}

export function runHymnSuggestion(input: HymnSuggestionInput): Promise<HymnSuggestionResult> {
  return request<HymnSuggestionResult>('/hymns/suggest', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export interface HymnSearchListItem {
  id: number
  title: string
  theme: string
  hymnalFilter: HymnalFilter
  model: string
  durationMs: number
  candidateCount: number
  createdAt: string
}

export interface HymnSearchListResponse {
  searches: HymnSearchListItem[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export function listHymnSearches(params?: {
  page?: number
  pageSize?: number
  q?: string
}): Promise<HymnSearchListResponse> {
  return request<HymnSearchListResponse>(
    `/hymns/searches${buildQueryString(params as Record<string, string | number | undefined>)}`,
  )
}

export interface HymnSearchDetail {
  id: number
  title: string
  scriptureText: string
  theme: string
  audience: string
  hymnalFilter: HymnalFilter
  sections: HymnSuggestionSections
  model: string
  createdAt: string | null
  candidateCount: number
  durationMs: number
}

export function getHymnSearch(id: number): Promise<HymnSearchDetail> {
  return request<HymnSearchDetail>(`/hymns/searches/${id}`)
}

export function deleteHymnSearch(id: number): Promise<{ok: boolean}> {
  return request<{ok: boolean}>(`/hymns/searches/${id}`, {method: 'DELETE'})
}
