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

export type ScheduleType = 'nursery' | 'special_music'

export interface FooterBlock {
  kind: 'quote' | 'note' | 'spacer'
  text: string
  bold?: boolean
}

export interface SchedulesSettings {
  logoPath: string | null
  nursery: {
    titlePrefix: string
    footerBlocks: FooterBlock[]
  }
  specialMusic: {
    titlePrefix: string
    footerBlocks: FooterBlock[]
    singerGroupIds: number[]
  }
}

export const fetchSchedulesSettings = () => request<SchedulesSettings>('/schedules/settings')

export const updateSchedulesSettings = (
  body: Partial<{
    nursery: Partial<SchedulesSettings['nursery']>
    specialMusic: Partial<SchedulesSettings['specialMusic']>
  }>,
) => request<SchedulesSettings>('/schedules/settings', {method: 'PUT', body: JSON.stringify(body)})

export const uploadSchedulesLogo = (imageData: string) =>
  request<{logoPath: string}>('/schedules/settings/logo', {
    method: 'POST',
    body: JSON.stringify({imageData}),
  })

export interface SendScheduleImageInput {
  imageData: string
  recipientIds: number[]
  caption?: string
}

export interface SendResult {
  results: {id: number; name: string; success: boolean; error?: string}[]
}

export const sendScheduleImage = (input: SendScheduleImageInput) =>
  request<SendResult>('/schedules/send-image', {method: 'POST', body: JSON.stringify(input)})

export const schedulesKeys = {
  settings: ['schedules', 'settings'] as const,
}
