import type {LessonKind, ResolvedLessonRow} from './workers-notes-core'

const BASE_URL = '/api/schedules/workers-notes'

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
  if (res.status === 204) return undefined as T
  return res.json()
}

export type BlockKind = 'note' | 'spacer' | 'next_term_forms' | 'growth_plan' | 'month_themes'

export interface WorkersNotesBlock {
  id?: number
  kind: BlockKind
  text: string
  bold: boolean
}

export interface WorkersNotesMonth {
  id?: number
  month: number
  hymnId: number | null
  songTitleOverride: string | null
  motto: string
  verse: string
  hymnBook: 'burgundy' | 'silver' | null
  hymnNumber: number | null
  hymnTitle: string | null
}

export interface YearlyTheme {
  id: number
  year: number
  songTitle: string
  songCredit: string
  chorusLyrics: string
  tagLyrics: string
  verseText: string
  verseRef: string
  growthPlan: string
}

export interface BettyLukensStory {
  number: number
  title: string
  page: number | null
  lastPoints: string | null
}

export interface WorkersNotesEditionSummary {
  id: number
  scheduleId: number
  year: number
  term: number
  startingLessonNumber: number
  scopeLabel: string
  status: 'draft' | 'final'
  scopeStart: string | null
  scopeEnd: string | null
  createdAt: string
  updatedAt: string
}

export interface WorkersNotesEdition extends WorkersNotesEditionSummary {
  theme: YearlyTheme | null
  blocks: WorkersNotesBlock[]
  months: WorkersNotesMonth[]
  lessonRows: ResolvedLessonRow[]
}

export interface LessonRowPayload {
  kind: LessonKind
  date: string | null
  specialLesson: string
  text: string
}

export const workersNotesKeys = {
  all: ['workers-notes'] as const,
  list: ['workers-notes', 'list'] as const,
  detail: (id: number) => ['workers-notes', 'detail', id] as const,
  themes: ['workers-notes', 'themes'] as const,
  theme: (year: number) => ['workers-notes', 'themes', year] as const,
  stories: ['workers-notes', 'stories'] as const,
  hymns: (q: string) => ['workers-notes', 'hymns', q] as const,
}

export const fetchWorkersNotesEditions = () => request<WorkersNotesEditionSummary[]>('/')

export const fetchWorkersNotesEdition = (id: number) => request<WorkersNotesEdition>(`/${id}`)

export const createWorkersNotesEdition = (body: {year: number; term: number; startingLessonNumber?: number}) =>
  request<WorkersNotesEditionSummary>('/', {method: 'POST', body: JSON.stringify(body)})

export const updateWorkersNotesEdition = (
  id: number,
  body: {status?: 'draft' | 'final'; startingLessonNumber?: number},
) => request<{ok: true}>(`/${id}`, {method: 'PATCH', body: JSON.stringify(body)})

export const deleteWorkersNotesEdition = (id: number) => request<void>(`/${id}`, {method: 'DELETE'})

export const saveWorkersNotesBlocks = (id: number, blocks: WorkersNotesBlock[]) =>
  request<{ok: true}>(`/${id}/blocks`, {method: 'PUT', body: JSON.stringify({blocks})})

export const saveWorkersNotesMonths = (
  id: number,
  months: {month: number; hymnId: number | null; songTitleOverride: string | null; motto: string; verse: string}[],
) => request<{ok: true}>(`/${id}/months`, {method: 'PUT', body: JSON.stringify({months})})

export const saveWorkersNotesLessons = (id: number, rows: LessonRowPayload[]) =>
  request<{lessonRows: ResolvedLessonRow[]}>(`/${id}/lessons`, {method: 'PUT', body: JSON.stringify({rows})})

export interface HymnOption {
  id: number
  book: 'burgundy' | 'silver'
  number: number
  title: string
}

export const searchHymns = (q: string) => request<HymnOption[]>(`/hymns?q=${encodeURIComponent(q)}`)

export const fetchYearlyThemes = () => request<YearlyTheme[]>('/themes')

export const fetchYearlyTheme = (year: number) => request<YearlyTheme>(`/themes/${year}`)

export const saveYearlyTheme = (year: number, body: Omit<YearlyTheme, 'id' | 'year'>) =>
  request<YearlyTheme>(`/themes/${year}`, {method: 'PUT', body: JSON.stringify(body)})

export const deleteYearlyTheme = (year: number) => request<void>(`/themes/${year}`, {method: 'DELETE'})

export const fetchBettyLukensStories = () => request<BettyLukensStory[]>('/stories')

export const saveBettyLukensStory = (
  number: number,
  body: {title?: string; page?: number | null; lastPoints?: string | null},
) => request<BettyLukensStory>(`/stories/${number}`, {method: 'PUT', body: JSON.stringify(body)})

export const deleteBettyLukensStory = (number: number) => request<void>(`/stories/${number}`, {method: 'DELETE'})
