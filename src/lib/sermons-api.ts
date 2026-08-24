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

export type RankTier = 'high' | 'medium' | 'low'

export interface SermonListItem {
  id: number
  sermonDate: string
  title: string | null
  series: string | null
  bigIdea: string | null
  generatedAt: string | null
  serviceTimeName: string
  speaker: string
  quoteCount: number
  reflectionCount: number
}

export interface SocialQuote {
  id: number
  sermonId: number
  verbatimText: string
  cleanedText: string
  polishedText: string
  startOffset: number | null
  endOffset: number | null
  rankTier: RankTier
  rankOrder: number
  rankNote: string | null
  sensitive: boolean
  sensitiveReason: string | null
  editedText: string | null
  favorite: boolean
  used: boolean
  promotedQuoteId: number | null
}

export interface Reflection {
  id: number
  sermonId: number
  body: string
  rankTier: RankTier
  rankOrder: number
  rankNote: string | null
  sensitive: boolean
  sensitiveReason: string | null
  editedBody: string | null
  favorite: boolean
  used: boolean
}

export interface SermonScripture {
  id: number
  sermonId: number
  reference: string
  book: string
  chapter: number | null
  sortOrder: number
}

export interface SermonDetail {
  id: number
  serviceTimeId: number
  serviceTimeName: string
  sermonDate: string
  speakerPersonId: number
  speaker: string
  title: string | null
  series: string | null
  bigIdea: string | null
  transcript: string
  generatedAt: string | null
  generationModel: string | null
  generationDurationMs: number | null
  createdAt: string | null
  quotes: SocialQuote[]
  reflections: Reflection[]
  scriptures: SermonScripture[]
}

export interface QuoteContext {
  available: boolean
  before: string
  quote: string
  after: string
}

export function listSermons(params?: {q?: string; series?: string; page?: number; pageSize?: number}) {
  return request<{data: SermonListItem[]; total: number; page: number; pageSize: number}>(
    `/sermons${buildQueryString(params)}`,
  )
}

export function listSermonSeries() {
  return request<string[]>('/sermons/series')
}

export function getSermon(id: number) {
  return request<SermonDetail>(`/sermons/${id}`)
}

export function createSermon(data: {
  serviceTimeId: number
  sermonDate: string
  speakerPersonId: number
  title?: string
  series?: string
  transcript: string
}) {
  return request<{id: number; skippedQuotes: number}>('/sermons', {method: 'POST', body: JSON.stringify(data)})
}

export function updateSermon(
  id: number,
  data: {serviceTimeId?: number; sermonDate?: string; speakerPersonId?: number; title?: string; series?: string},
) {
  return request<{success: boolean}>(`/sermons/${id}`, {method: 'PATCH', body: JSON.stringify(data)})
}

export function replaceTranscript(id: number, transcript: string) {
  return request<{success: boolean; skippedQuotes: number}>(`/sermons/${id}/transcript`, {
    method: 'POST',
    body: JSON.stringify({transcript}),
  })
}

export function regenerateSermon(id: number) {
  return request<{success: boolean; skippedQuotes: number}>(`/sermons/${id}/regenerate`, {method: 'POST'})
}

export function deleteSermon(id: number) {
  return request<{success: boolean}>(`/sermons/${id}`, {method: 'DELETE'})
}

export function getQuoteContext(sermonId: number, quoteId: number) {
  return request<QuoteContext>(`/sermons/${sermonId}/quotes/${quoteId}/context`)
}

export function updateSocialQuote(
  sermonId: number,
  quoteId: number,
  data: {editedText?: string | null; used?: boolean; favorite?: boolean},
) {
  return request<{success: boolean}>(`/sermons/${sermonId}/quotes/${quoteId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
}

export function promoteSocialQuote(sermonId: number, quoteId: number) {
  return request<{quoteId: number}>(`/sermons/${sermonId}/quotes/${quoteId}/promote`, {method: 'POST'})
}

export function updateReflection(
  sermonId: number,
  reflectionId: number,
  data: {editedBody?: string | null; used?: boolean; favorite?: boolean},
) {
  return request<{success: boolean}>(`/sermons/${sermonId}/reflections/${reflectionId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
}
