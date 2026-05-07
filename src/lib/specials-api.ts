const BASE_URL = '/api/specials'

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
  return res.json()
}

export type ServiceType = 'sunday_am' | 'sunday_pm' | 'wednesday_pm' | 'other'
export type SpecialType = 'solo' | 'duet' | 'trio' | 'group' | 'instrumental' | 'other'
export type SpecialStatus = 'will_perform' | 'needs_review' | 'performed'

export const SERVICE_TYPE_LABELS: Record<ServiceType, string> = {
  sunday_am: 'Sunday AM',
  sunday_pm: 'Sunday PM',
  wednesday_pm: 'Wednesday PM',
  other: 'Other',
}

export const SPECIAL_TYPE_LABELS: Record<SpecialType, string> = {
  solo: 'Solo',
  duet: 'Duet',
  trio: 'Trio',
  group: 'Group',
  instrumental: 'Instrumental',
  other: 'Other',
}

export const SPECIAL_STATUS_LABELS: Record<SpecialStatus, string> = {
  will_perform: 'Will Perform',
  needs_review: 'Needs Review',
  performed: 'Performed',
}

export interface SpecialPerformer {
  personId: number
  ordering: number
  firstName: string | null
  lastName: string | null
}

export interface Hymn {
  id: number
  book: 'burgundy' | 'silver'
  number: number
  title: string
  firstLine: string | null
  refrainLine: string | null
}

export interface Special {
  id: number
  date: string
  serviceType: ServiceType
  serviceLabel: string | null
  songTitle: string
  hymnId: number | null
  songArranger: string | null
  songWriter: string | null
  type: SpecialType
  status: SpecialStatus
  occasion: string | null
  guestPerformers: string // JSON-encoded string[]
  youtubeUrl: string | null
  sheetMusicPath: string | null
  notes: string | null
  createdAt: string
  updatedAt: string
  performers: SpecialPerformer[]
}

export interface SpecialDetail extends Special {
  hymn: Hymn | null
}

export interface CreateSpecialBody {
  date: string
  serviceType: ServiceType
  serviceLabel?: string | null
  songTitle: string
  hymnId?: number | null
  songArranger?: string | null
  songWriter?: string | null
  type: SpecialType
  occasion?: string | null
  performerIds?: number[]
  guestPerformers?: string[]
  youtubeUrl?: string | null
  notes?: string | null
}

export type UpdateSpecialBody = Partial<CreateSpecialBody> & {status?: SpecialStatus}

export interface YoutubeExtraction {
  videoId: string
  videoTitle: string | null
  videoDescription: string | null
  videoUploadDate: string | null
  date?: string
  songTitle?: string
  type?: SpecialType
  performerSuggestions: {name: string; candidatePersonIds: number[]}[]
  hymnSuggestion?: {hymnId: number; book: string; number: number; title: string; matchedOn: string}
}

export interface RepeatWarnings {
  songRepeat?: {specialId: number; date: string; songTitle: string}
  performerRepeats: {personId: number; specialId: number; date: string}[]
}

export interface SpecialsListFilter {
  status?: SpecialStatus[]
  serviceType?: ServiceType[]
  type?: SpecialType[]
  q?: string
}

export const specialsApi = {
  list(filter: SpecialsListFilter = {}): Promise<Special[]> {
    const params = new URLSearchParams()
    if (filter.status?.length) params.set('status', filter.status.join(','))
    if (filter.serviceType?.length) params.set('serviceType', filter.serviceType.join(','))
    if (filter.type?.length) params.set('type', filter.type.join(','))
    if (filter.q) params.set('q', filter.q)
    const qs = params.toString()
    return request<Special[]>(qs ? `/?${qs}` : '/')
  },

  get(id: number): Promise<SpecialDetail> {
    return request<SpecialDetail>(`/${id}`)
  },

  create(body: CreateSpecialBody): Promise<Special> {
    return request<Special>('/', {method: 'POST', body: JSON.stringify(body)})
  },

  update(id: number, body: UpdateSpecialBody): Promise<Special> {
    return request<Special>(`/${id}`, {method: 'PATCH', body: JSON.stringify(body)})
  },

  markReviewed(id: number): Promise<Special> {
    return request<Special>(`/${id}/mark-reviewed`, {method: 'POST'})
  },

  remove(id: number): Promise<{success: true}> {
    return request<{success: true}>(`/${id}`, {method: 'DELETE'})
  },

  uploadSheetMusic(id: number, fileName: string, fileData: string): Promise<{sheetMusicPath: string}> {
    return request<{sheetMusicPath: string}>(`/${id}/sheet-music`, {
      method: 'POST',
      body: JSON.stringify({fileName, fileData}),
    })
  },

  removeSheetMusic(id: number): Promise<{success: true}> {
    return request<{success: true}>(`/${id}/sheet-music`, {method: 'DELETE'})
  },

  fromYoutube(url: string): Promise<YoutubeExtraction> {
    return request<YoutubeExtraction>('/from-youtube', {
      method: 'POST',
      body: JSON.stringify({url}),
    })
  },

  repeatWarnings(input: {
    songTitle?: string
    hymnId?: number | null
    performerIds?: number[]
    excludeSpecialId?: number
  }): Promise<RepeatWarnings> {
    const params = new URLSearchParams()
    if (input.songTitle) params.set('songTitle', input.songTitle)
    if (input.hymnId != null) params.set('hymnId', String(input.hymnId))
    if (input.performerIds?.length) params.set('performerIds', input.performerIds.join(','))
    if (input.excludeSpecialId != null) params.set('excludeSpecialId', String(input.excludeSpecialId))
    const qs = params.toString()
    return request<RepeatWarnings>(qs ? `/repeat-warnings/check?${qs}` : '/repeat-warnings/check')
  },

  byPerson(personId: number): Promise<Special[]> {
    return request<Special[]>(`/by-person/${personId}`)
  },

  byHymn(hymnId: number): Promise<Special[]> {
    return request<Special[]>(`/by-hymn/${hymnId}`)
  },
}

export function parseGuestPerformers(json: string | null | undefined): string[] {
  if (!json) return []
  try {
    const parsed = JSON.parse(json) as unknown
    if (Array.isArray(parsed)) return parsed.filter((s): s is string => typeof s === 'string')
  } catch {
    /* fall through */
  }
  return []
}

export function performerDisplayName(p: SpecialPerformer): string {
  return [p.firstName, p.lastName].filter(Boolean).join(' ') || `#${p.personId}`
}
