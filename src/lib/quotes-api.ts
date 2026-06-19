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

export interface Quote {
  id: number
  externalId: string
  title: string
  author: string
  capturedBy: string
  capturedAt: string
  dateDisplay: string
  summary: string
  quoteText: string
  tags: string[]
  source: 'n8n' | 'import' | 'manual'
  createdAt: string | null
  updatedAt: string | null
}

export interface QuoteListParams {
  page?: number
  pageSize?: number
  q?: string
  author?: string
  dateFrom?: string
  dateTo?: string
  sort?: string
  dir?: 'asc' | 'desc'
}

export interface QuoteListResponse {
  quotes: Quote[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export interface QuoteCreateInput {
  title: string
  author?: string
  capturedBy?: string
  dateDisplay?: string
  summary: string
  quoteText: string
  tags?: string[]
}

export interface QuoteUpdateInput {
  title?: string
  author?: string
  capturedBy?: string
  dateDisplay?: string
  summary?: string
  quoteText?: string
  tags?: string[]
}

export function listQuotes(params?: QuoteListParams): Promise<QuoteListResponse> {
  return request<QuoteListResponse>(`/quotes${buildQueryString(params as Record<string, string | number | undefined>)}`)
}

export function getQuote(id: number): Promise<Quote> {
  return request<Quote>(`/quotes/${id}`)
}

export function listAuthors(): Promise<string[]> {
  return request<string[]>('/quotes/authors')
}

export function createQuote(input: QuoteCreateInput): Promise<{id: number}> {
  return request<{id: number}>('/quotes', {method: 'POST', body: JSON.stringify(input)})
}

export function updateQuote(id: number, input: QuoteUpdateInput): Promise<{ok: boolean}> {
  return request<{ok: boolean}>(`/quotes/${id}`, {method: 'PATCH', body: JSON.stringify(input)})
}

export function deleteQuote(id: number): Promise<{ok: boolean}> {
  return request<{ok: boolean}>(`/quotes/${id}`, {method: 'DELETE'})
}

export function aiTagQuote(quoteText: string): Promise<{summary: string; tags: string[]}> {
  return request<{summary: string; tags: string[]}>('/quotes/ai-tags', {
    method: 'POST',
    body: JSON.stringify({quoteText}),
  })
}

// Music (song lyric) results — self-contained (ADR 0010)
export interface MusicResult {
  book: 'burgundy' | 'silver'
  number: number
  title: string
  author: string | null
  relevantLyrics: string
  note: string
  relevance: 'high' | 'medium' | 'low'
  source: 'web' | 'corpus'
  verified: boolean
  sourceUrl?: string
}

// Research
export interface ResearchResult {
  searchId: number
  synthesis: string | null
  candidateCount: number
  durationMs: number
  results: Array<{
    quoteId: number
    note: string
    relevance: 'high' | 'medium' | 'low'
    quote: Quote
  }>
}

export function runResearch(
  topic: string,
  opts?: {includeQuotes?: boolean; includeMusic?: boolean},
): Promise<ResearchResult> {
  return request<ResearchResult>('/quotes/research', {
    method: 'POST',
    body: JSON.stringify({topic, ...opts}),
  })
}

export function runMusicSearch(searchId: number): Promise<{musicResults: MusicResult[]}> {
  return request<{musicResults: MusicResult[]}>(`/quotes/searches/${searchId}/music`, {method: 'POST'})
}

export function runQuotesForSearch(
  searchId: number,
): Promise<{synthesis: string; results: ResearchResult['results']; candidateCount: number; durationMs: number}> {
  return request(`/quotes/searches/${searchId}/quotes`, {method: 'POST'})
}

// Search history
export interface QuoteSearch {
  id: number
  topic: string
  createdAt: string
  model: string | null
  resultCount: number
  hasQuotes: boolean
  hasMusic: boolean
}

export interface QuoteSearchListResponse {
  searches: QuoteSearch[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export interface QuoteSearchDetail {
  id: number
  topic: string
  synthesis: string | null
  model: string | null
  createdAt: string | null
  results: Array<{
    quoteId: number
    note: string
    relevance: string
    quote: Quote | null
  }>
  musicResults: MusicResult[] | null
}

export function listSearches(params?: {
  page?: number
  pageSize?: number
  q?: string
}): Promise<QuoteSearchListResponse> {
  return request<QuoteSearchListResponse>(
    `/quotes/searches${buildQueryString(params as Record<string, string | number | undefined>)}`,
  )
}

export function getSearch(id: number): Promise<QuoteSearchDetail> {
  return request<QuoteSearchDetail>(`/quotes/searches/${id}`)
}

export function deleteSearch(id: number): Promise<{ok: boolean}> {
  return request<{ok: boolean}>(`/quotes/searches/${id}`, {method: 'DELETE'})
}
