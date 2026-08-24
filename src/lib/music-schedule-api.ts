import type {BoothLine, HymnBook, MusicBoothSlot, OrderLine} from './music-schedule-core'

const BASE_URL = '/api/schedules/music'

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

export interface HymnOption {
  id: number
  book: HymnBook
  number: number
  title: string
}

export interface MusicWeekSummary {
  id: number
  weekStart: string
  label: string
  status: 'draft' | 'final'
  scopeLabel: string
  serviceCount: number
  episodeFirst: number | null
  episodeLast: number | null
  updatedAt: string
}

export interface MusicService {
  id: number
  serviceTimeId: number | null
  name: string
  musicHeading: string
  boothHeading: string
  date: string
  dayOfWeek: number
  time: string | null
  meeting: boolean
  uploaded: boolean
  episodeNumber: number | null
  title: string
  titleNote: string
  titleHighlight: boolean
  scripture: string
  scriptureNote: string
  scriptureHighlight: boolean
  sortOrder: number
  lines: OrderLine[]
  boothLines: (BoothLine & {stale: boolean})[]
}

export interface MusicFooterBlock {
  kind: 'quote' | 'note' | 'spacer'
  text: string
  bold?: boolean
}

export interface MusicWeek {
  id: number
  weekStart: string
  label: string
  status: 'draft' | 'final'
  scopeLabel: string
  updatedAt: string
  services: MusicService[]
  footer: {blocks: MusicFooterBlock[]; imagePath: string | null; placement: 'last' | 'every' | 'never'}
}

/** The wire shape for a line write — omits the joined hymn columns. */
export interface LineInput {
  kind: OrderLine['kind']
  role: OrderLine['role']
  hymnId: number | null
  freeSongTitle: string | null
  suffix: string
  leftText: string
  text: string
  merged: boolean | null
  align: OrderLine['align']
  bold: boolean | null
  italic: boolean
  highlight: boolean
  sticky: boolean
  booth: OrderLine['booth']
  boothLabel: string
  boothNote: string
}

export const musicScheduleKeys = {
  all: ['music-schedules'] as const,
  list: (year?: number) => ['music-schedules', 'list', year ?? 'all'] as const,
  years: ['music-schedules', 'years'] as const,
  detail: (id: number) => ['music-schedules', 'detail', id] as const,
  hymns: (q: string) => ['music-schedules', 'hymns', q] as const,
}

export const fetchMusicWeeks = (year?: number) => request<MusicWeekSummary[]>(year ? `/?year=${year}` : '/')

export const fetchMusicWeekYears = () => request<number[]>('/years')

export const fetchMusicWeek = (id: number) => request<MusicWeek>(`/${id}`)

export const createMusicWeek = (weekStart: string) =>
  request<{id: number; weekStart: string}>('/', {method: 'POST', body: JSON.stringify({weekStart})})

export const updateMusicWeek = (id: number, body: {status: 'draft' | 'final'}) =>
  request<{id: number; status: string}>(`/${id}`, {method: 'PATCH', body: JSON.stringify(body)})

export const deleteMusicWeek = (id: number) => request<void>(`/${id}`, {method: 'DELETE'})

export const addMusicService = (id: number, body: {name: string; date: string; time?: string}) =>
  request<MusicService>(`/${id}/services`, {method: 'POST', body: JSON.stringify(body)})

export const updateMusicService = (id: number, serviceId: number, body: Partial<MusicService>) =>
  request<MusicService>(`/${id}/services/${serviceId}`, {method: 'PATCH', body: JSON.stringify(body)})

export const deleteMusicService = (id: number, serviceId: number) =>
  request<void>(`/${id}/services/${serviceId}`, {method: 'DELETE'})

export const saveMusicLines = (id: number, serviceId: number, lines: LineInput[]) =>
  request<{lines: OrderLine[]}>(`/${id}/services/${serviceId}/lines`, {
    method: 'PUT',
    body: JSON.stringify({lines}),
  })

export const saveBoothLines = (
  id: number,
  serviceId: number,
  boothLines: {slot: MusicBoothSlot; text: string; highlight: boolean}[],
) =>
  request<{boothLines: (BoothLine & {stale: boolean})[]}>(`/${id}/services/${serviceId}/booth-lines`, {
    method: 'PUT',
    body: JSON.stringify({boothLines}),
  })

export const rewriteBoothLine = (id: number, serviceId: number, slot: MusicBoothSlot) =>
  request<{boothLines: (BoothLine & {stale: boolean})[]}>(`/${id}/services/${serviceId}/booth-lines/${slot}/rewrite`, {
    method: 'POST',
  })

export const saveServiceAsDefault = (id: number, serviceId: number) =>
  request<{serviceTimeId: number; lines: number}>(`/${id}/services/${serviceId}/save-as-default`, {method: 'POST'})

export const searchMusicHymns = (q: string) => request<HymnOption[]>(`/hymns?q=${encodeURIComponent(q)}`)

export const fetchNextEpisode = (year: number) => request<{year: number; next: number}>(`/episodes/next?year=${year}`)
