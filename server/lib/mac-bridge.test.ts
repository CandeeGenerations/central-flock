import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import * as applescript from '../services/applescript.js'
import * as calendar from '../services/calendar.js'
import {
  assertAllowedRecipient,
  createContact,
  fetchAvailableCalendars,
  fetchContacts,
  fetchUpcomingEvents,
  sendImage,
  sendText,
  setRetryDelaysForTest,
} from './mac-bridge.js'

vi.mock('../services/applescript.js', () => ({
  sendMessageViaUI: vi.fn(),
  sendImageViaUI: vi.fn(),
  fetchContacts: vi.fn(),
  createContact: vi.fn(),
}))
vi.mock('../services/calendar.js', () => ({
  fetchAvailableCalendars: vi.fn(),
  fetchUpcomingEvents: vi.fn(),
}))
vi.mock('node:fs/promises', () => ({readFile: vi.fn(async () => Buffer.from('jpeg-bytes'))}))

const ENV_KEYS = ['CENTRAL_FLOCK_SANDBOX', 'MAC_BRIDGE', 'CGEN_API_URL', 'CGEN_API_KEY', 'SEND_ALLOWLIST'] as const
const saved: Record<string, string | undefined> = {}
const fetchSpy = vi.fn()

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {status, headers: {'Content-Type': 'application/json'}})
}

beforeEach(() => {
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k]
    delete process.env[k]
  }
  vi.clearAllMocks()
  fetchSpy.mockReset()
  vi.stubGlobal('fetch', fetchSpy)
  setRetryDelaysForTest([0, 0, 0])
})

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k]
    else process.env[k] = saved[k]
  }
  vi.unstubAllGlobals()
})

function useCgenApi() {
  process.env.MAC_BRIDGE = 'cgen-api'
  process.env.CGEN_API_URL = 'https://api.example.test/'
  process.env.CGEN_API_KEY = 'bridge-key'
}

describe('local mode (default) — the Mac mini today', () => {
  it('sends through AppleScript exactly as before', async () => {
    await sendText('+15555550100', 'hello')
    await sendImage('+15555550100', '/tmp/a.jpg', 'cap')
    expect(applescript.sendMessageViaUI).toHaveBeenCalledWith('+15555550100', 'hello')
    expect(applescript.sendImageViaUI).toHaveBeenCalledWith('+15555550100', '/tmp/a.jpg', 'cap')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('reads contacts and calendars locally', async () => {
    await fetchContacts()
    await fetchAvailableCalendars()
    await fetchUpcomingEvents(['Church'], 30)
    expect(applescript.fetchContacts).toHaveBeenCalled()
    expect(calendar.fetchAvailableCalendars).toHaveBeenCalled()
    expect(calendar.fetchUpcomingEvents).toHaveBeenCalledWith(['Church'], 30)
  })

  it('rejects an unknown MAC_BRIDGE value', async () => {
    process.env.MAC_BRIDGE = 'carrier-pigeon'
    await expect(sendText('+15555550100', 'x')).rejects.toThrow(/MAC_BRIDGE/)
  })
})

describe('sandbox mode', () => {
  beforeEach(() => {
    process.env.CENTRAL_FLOCK_SANDBOX = '1'
    useCgenApi()
  })

  it('reports success for sends and contact creation without reaching the Mac', async () => {
    await expect(sendText('+15555550100', 'hello')).resolves.toBeUndefined()
    await expect(sendImage('+15555550100', '/tmp/a.jpg')).resolves.toBeUndefined()
    await expect(createContact('A', 'B', '+15555550100')).resolves.toBeUndefined()
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(applescript.sendMessageViaUI).not.toHaveBeenCalled()
  })

  it('returns empty reads', async () => {
    expect(await fetchContacts()).toEqual([])
    expect(await fetchAvailableCalendars()).toEqual([])
    expect(await fetchUpcomingEvents(['Church'], 30)).toEqual({events: [], missing: []})
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

describe('SEND_ALLOWLIST', () => {
  it('allows only listed numbers, in any format', () => {
    process.env.SEND_ALLOWLIST = '+1 (555) 555-0100, 5555550101'
    expect(() => assertAllowedRecipient('+15555550100')).not.toThrow()
    expect(() => assertAllowedRecipient('555-555-0101')).not.toThrow()
    expect(() => assertAllowedRecipient('+15555550199')).toThrow(/SEND_ALLOWLIST/)
  })

  it('blocks a send before it reaches AppleScript', async () => {
    process.env.SEND_ALLOWLIST = '+15555550100'
    await expect(sendText('+15555550199', 'x')).rejects.toThrow(/SEND_ALLOWLIST/)
    expect(applescript.sendMessageViaUI).not.toHaveBeenCalled()
  })
})

describe('cgen-api mode', () => {
  beforeEach(useCgenApi)

  it('posts a text with the key and an idempotency key', async () => {
    fetchSpy.mockResolvedValueOnce(json(200, {ok: true}))
    await sendText('+15555550100', 'hello')
    const [url, init] = fetchSpy.mock.calls[0]
    expect(url).toBe('https://api.example.test/api/mac/text')
    expect(init.method).toBe('POST')
    expect(init.headers['X-API-Key']).toBe('bridge-key')
    expect(init.headers['Idempotency-Key']).toMatch(/^[0-9a-f-]{36}$/)
    expect(JSON.parse(init.body)).toEqual({phoneNumber: '+15555550100', message: 'hello'})
    expect(applescript.sendMessageViaUI).not.toHaveBeenCalled()
  })

  it('sends image bytes as base64', async () => {
    fetchSpy.mockResolvedValueOnce(json(200, {ok: true}))
    await sendImage('+15555550100', '/tmp/a.jpg', 'cap')
    const body = JSON.parse(fetchSpy.mock.calls[0][1].body)
    expect(body).toEqual({
      phoneNumber: '+15555550100',
      imageBase64: Buffer.from('jpeg-bytes').toString('base64'),
      caption: 'cap',
    })
  })

  it('retries when cgen-api was not reached, reusing the same idempotency key', async () => {
    fetchSpy
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce(json(502, {}))
      .mockResolvedValueOnce(json(200, {ok: true}))
    await sendText('+15555550100', 'hello')
    expect(fetchSpy).toHaveBeenCalledTimes(3)
    const keys = fetchSpy.mock.calls.map(([, init]) => init.headers['Idempotency-Key'])
    expect(new Set(keys).size).toBe(1)
  })

  it('gives up after the retries with a clear error', async () => {
    fetchSpy.mockResolvedValue(json(530, {}))
    await expect(sendText('+15555550100', 'hello')).rejects.toThrow(/Could not reach the Mac/)
    expect(fetchSpy).toHaveBeenCalledTimes(4)
  })

  it('does not retry a timeout or a real error from cgen-api', async () => {
    const timeout = new Error('timed out')
    timeout.name = 'TimeoutError'
    fetchSpy.mockRejectedValueOnce(timeout)
    await expect(sendText('+15555550100', 'x')).rejects.toThrow(/did not answer in time/)
    expect(fetchSpy).toHaveBeenCalledTimes(1)

    fetchSpy.mockReset()
    fetchSpy.mockResolvedValueOnce(json(500, {error: 'Messages did not send'}))
    await expect(sendText('+15555550100', 'x')).rejects.toThrow('Messages did not send')
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('reads contacts and sorts calendar events', async () => {
    fetchSpy.mockResolvedValueOnce(json(200, [{id: '1', firstName: 'A', lastName: 'B', phones: []}]))
    expect(await fetchContacts()).toHaveLength(1)
    expect(fetchSpy.mock.calls[0][0]).toBe('https://api.example.test/api/mac/contacts')

    fetchSpy.mockResolvedValueOnce(
      json(200, {events: [{startDate: '2026-12-02'}, {startDate: '2026-12-01'}], missing: []}),
    )
    const {events} = await fetchUpcomingEvents(['Church'], 30)
    expect(events.map((e) => e.startDate)).toEqual(['2026-12-01', '2026-12-02'])
  })

  it('needs its URL and key', async () => {
    delete process.env.CGEN_API_KEY
    await expect(sendText('+15555550100', 'x')).rejects.toThrow(/CGEN_API_URL and CGEN_API_KEY/)
  })
})
