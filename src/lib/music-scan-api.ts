import type {MusicScan, MusicScanListItem, ScanServicePatch, ScanSummary} from './music-scan-types'

const BASE_URL = '/api/schedules/music/scans'

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
    const err = new Error(body.error || `Request failed: ${res.status}`) as Error & {weekId?: number}
    err.weekId = body.weekId
    throw err
  }
  if (res.status === 204) return undefined as T
  return res.json()
}

export const musicScanKeys = {
  all: ['music-scans'] as const,
  list: ['music-scans', 'list'] as const,
  detail: (id: number) => ['music-scans', 'detail', id] as const,
}

export const fetchMusicScans = () => request<MusicScanListItem[]>('/')

export const fetchMusicScan = (id: number) => request<MusicScan>(`/${id}`)

/** Photos as JPEG data URLs, already downscaled. Runs the AI read — takes ~20s. */
export const createMusicScan = (photos: string[]) =>
  request<{id: number; weekStart: string | null; summary: ScanSummary}>('/', {
    method: 'POST',
    body: JSON.stringify({photos}),
  })

export const updateMusicScan = (id: number, services: ScanServicePatch[]) =>
  request<MusicScan>(`/${id}`, {method: 'PATCH', body: JSON.stringify({services})})

export const applyMusicScan = (id: number) => request<{weekId: number}>(`/${id}/apply`, {method: 'POST'})

export const discardMusicScan = (id: number) => request<void>(`/${id}`, {method: 'DELETE'})

/**
 * Downscale a photo to fit `maxEdge` on its long side and re-encode as JPEG. Phone
 * photos are 12MP; the scan reads a 1600px page just as well and uploads in a
 * fraction of the time.
 */
export async function photoToDataUrl(file: File, maxEdge = 1600): Promise<string> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  return canvas.toDataURL('image/jpeg', 0.85)
}
