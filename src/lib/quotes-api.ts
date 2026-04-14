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

// Research
export interface ResearchResult {
  searchId: number
  synthesis: string
  candidateCount: number
  durationMs: number
  results: Array<{
    quoteId: number
    note: string
    relevance: 'high' | 'medium' | 'low'
    quote: Quote
  }>
}

export function runResearch(topic: string): Promise<ResearchResult> {
  return request<ResearchResult>('/quotes/research', {method: 'POST', body: JSON.stringify({topic})})
}

// Search history
export interface QuoteSearch {
  id: number
  topic: string
  createdAt: string
  model: string
  resultCount: number
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
  synthesis: string
  model: string
  createdAt: string | null
  results: Array<{
    quoteId: number
    note: string
    relevance: string
    quote: Quote | null
  }>
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
