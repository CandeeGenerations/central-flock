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

// Types
export interface Devotion {
  id: number
  date: string
  number: number
  devotionType: 'original' | 'favorite' | 'guest' | 'revisit'
  subcode: string | null
  guestSpeaker: string | null
  guestNumber: number | null
  referencedDevotions: string | null
  bibleReference: string | null
  songName: string | null
  title: string | null
  talkingPoints: string | null
  youtubeDescription: string | null
  facebookDescription: string | null
  podcastDescription: string | null
  produced: boolean
  rendered: boolean
  youtube: boolean
  facebookInstagram: boolean
  podcast: boolean
  notes: string | null
  flagged: boolean
  createdAt: string
  updatedAt: string
}

export interface DevotionsResponse {
  data: Devotion[]
  total: number
  page: number
  limit: number
}

export interface DevotionStats {
  total: number
  byType: {type: string; count: number}[]
  bySpeaker: {speaker: string; count: number}[]
  completionRates: {
    produced: number
    rendered: number
    youtube: number
    facebookInstagram: number
    podcast: number
    windowStart: string
    windowTotal: number
  }
  byYear: {year: string; count: number}[]
  latestNumber: number
  recentIncomplete: Devotion[]
}

export interface ScriptureStats {
  reference: string
  count: number
}

export interface SpeakerStats {
  speakers: {speaker: string; count: number}[]
  byYear: {speaker: string; year: string; count: number}[]
}

export interface ImportResult {
  inserted: number
  skipped: number
  errors: string[]
  total: number
  warnings: string[]
}

export interface GuideImportResult {
  updated: number
  notFound: number
  total: number
}

// API functions
export function fetchDevotions(params?: {
  search?: string
  dateFrom?: string
  dateTo?: string
  devotionType?: string
  guestSpeaker?: string
  status?: string
  pipelineMissing?: string
  flagged?: string
  months?: string
  page?: number
  limit?: number
  sort?: string
  sortDir?: string
}) {
  return request<DevotionsResponse>(`/devotions${buildQueryString(params)}`)
}

export function fetchDevotion(id: number) {
  return request<Devotion>(`/devotions/${id}`)
}

export function createDevotion(data: Partial<Devotion>) {
  return request<Devotion>('/devotions', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export function updateDevotion(id: number, data: Partial<Devotion>) {
  return request<Devotion>(`/devotions/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export function deleteDevotion(id: number) {
  return request<{success: boolean}>(`/devotions/${id}`, {method: 'DELETE'})
}

export function toggleDevotionField(id: number, field: string) {
  return request<Devotion>(`/devotions/${id}/toggle/${field}`, {method: 'PATCH'})
}

export function fetchDevotionStats() {
  return request<DevotionStats>('/devotions/stats')
}

export function fetchScriptureStats(params?: {search?: string; limit?: number}) {
  return request<ScriptureStats[]>(`/devotions/stats/scriptures${buildQueryString(params)}`)
}

export function fetchSpeakerStats() {
  return request<SpeakerStats>('/devotions/stats/speakers')
}

export function fetchNextDevotionNumber() {
  return request<{next: number}>('/devotions/next-number')
}

export function importDevotionsXlsx(data: string, filename: string) {
  return request<ImportResult>('/devotions/import', {
    method: 'POST',
    body: JSON.stringify({data, filename}),
  })
}

export function importPublishingGuide(
  entries: Array<{
    number: number
    title?: string
    youtubeDescription?: string
    facebookDescription?: string
    podcastDescription?: string
  }>,
) {
  return request<GuideImportResult>('/devotions/import-guide', {
    method: 'POST',
    body: JSON.stringify({entries}),
  })
}

function titleCase(str: string): string {
  return str.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.slice(1).toLowerCase())
}

// Song upload template generation
const SONG_SERIES: Record<string, {name: string; hashtag: string}> = {
  original: {name: 'Songs I Love to Sing', hashtag: 'songsilovetosing'},
  favorite: {name: 'My Take on Your Favorite Songs', hashtag: 'mytakeonyourfavoritesongs'},
}

export function generateSongTitle(devotion: Devotion): string | null {
  if (!devotion.songName) return null
  const series = SONG_SERIES[devotion.devotionType]
  if (!series) return null
  return `${titleCase(devotion.songName)} - ${series.name} - CBC`
}

export function generateSongDescription(devotion: Devotion): string | null {
  if (!devotion.songName) return null
  const series = SONG_SERIES[devotion.devotionType]
  if (!series) return null
  const year = devotion.date.split('-')[0]
  return [
    series.name,
    titleCase(devotion.songName),
    'Dr. Brad Weniger, Sr. | Pastor',
    `#cbc #cbcwoodbridge #${series.hashtag}`,
    'CBC - Central Baptist Church (Woodbridge, VA)',
    `Copyright \u00A9 ${year}`,
  ].join('\n\n')
}

export function youtubeSearchUrl(number: number): string {
  const query = `From the Shepherd to the Sheep #${String(number).padStart(3, '0')} CBC`
  return `https://www.youtube.com/@cbcwoodbridgeva/search?query=${encodeURIComponent(query)}`
}

// Platform description generation

function formatDevotionDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return date.toLocaleDateString('en-US', {month: 'long', day: 'numeric', year: 'numeric'})
}

function isTyler(devotion: Devotion): boolean {
  return devotion.devotionType === 'guest' && devotion.guestSpeaker === 'Tyler'
}

function getPastorName(devotion: Devotion): string {
  return isTyler(devotion) ? 'Pastor Candee' : 'Pastor Weniger'
}

export function generateYoutubeDescription(devotion: Devotion): string {
  const year = devotion.date.split('-')[0]
  const tagline = isTyler(devotion)
    ? `Join ${getPastorName(devotion)} for this morning's devotional!`
    : `Join ${getPastorName(devotion)} for daily devotions each morning!`

  return [
    'From the Shepherd to the Sheep',
    `#${String(devotion.number).padStart(3, '0')} - ${formatDevotionDate(devotion.date)}`,
    tagline,
    '#cbc #cbcwoodbridge #dailydevotional',
    'CBC - Central Baptist Church (Woodbridge, VA)',
    `Copyright \u00A9 ${year}`,
  ].join('\n\n')
}

export function generateFacebookDescription(devotion: Devotion): string {
  const year = devotion.date.split('-')[0]
  const tagline = isTyler(devotion)
    ? `Join ${getPastorName(devotion)} for this morning's devotional!`
    : `Join ${getPastorName(devotion)} for daily devotions each morning!`

  return [
    'From the Shepherd to the Sheep',
    `#${String(devotion.number).padStart(3, '0')} - ${formatDevotionDate(devotion.date)}`,
    tagline,
    '#cbc #cbcwoodbridge #dailydevotional',
    'CBC - Central Baptist Church (Woodbridge, VA)',
    `Copyright \u00A9 ${year}`,
  ].join('\n\n')
}

export function generatePodcastDescription(devotion: Devotion): string {
  const year = devotion.date.split('-')[0]
  return [
    'From the Shepherd to the Sheep',
    `#${String(devotion.number).padStart(3, '0')} - ${formatDevotionDate(devotion.date)}`,
    `Join ${getPastorName(devotion)} for this morning's devotional!`,
    '#cbc #cbcwoodbridge #dailydevotional',
    'CBC - Central Baptist Church (Woodbridge, VA)',
    `Copyright \u00A9 ${year}`,
  ].join(' | ')
}

export function generatePodcastTitle(devotion: Devotion): string {
  return `From the Shepherd to the Sheep - #${String(devotion.number).padStart(3, '0')} - CBC`
}

// AI Passage Generation

export interface GeneratedPassage {
  title: string
  bibleReference: string
  talkingPoints: string
}

export interface PoolPassage extends GeneratedPassage {
  id: number
  used: boolean
  devotionId: number | null
  createdAt: string
  usedAt: string | null
  scriptureUsageCount: number
}

export function generatePassage() {
  return request<GeneratedPassage>('/devotions/generate-passage', {method: 'POST'})
}

export function generatePoolPassages(count: number) {
  return request<{generated: number; passages: GeneratedPassage[]}>('/devotions/pool/generate', {
    method: 'POST',
    body: JSON.stringify({count}),
  })
}

export function fetchPool(params?: {used?: string; limit?: number}) {
  return request<PoolPassage[]>(`/devotions/pool${buildQueryString(params)}`)
}

export function deletePoolPassage(id: number) {
  return request<{success: boolean}>(`/devotions/pool/${id}`, {method: 'DELETE'})
}

export function pullPassagesForScan(count: number) {
  return request<{passages: Array<GeneratedPassage & {id: number}>; generated: number; fromPool: number}>(
    '/devotions/pool/pull-for-scan',
    {method: 'POST', body: JSON.stringify({count})},
  )
}
