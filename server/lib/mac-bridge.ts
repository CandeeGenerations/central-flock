import {randomUUID} from 'node:crypto'
import {readFile} from 'node:fs/promises'

import * as applescript from '../services/applescript.js'
import type {MacContact} from '../services/applescript.js'
import * as calendar from '../services/calendar.js'
import type {CalendarEvent, CalendarInfo} from '../services/calendar.js'
import {isSandbox} from './sandbox.js'

// Everything Central Flock does that only a Mac can do: send texts and images through Messages,
// read and create Contacts, read calendars. See ADR 0043.
//
// MAC_BRIDGE picks how:
//   local    (default) — run AppleScript / Swift on this machine, as the Mac mini always has.
//   cgen-api — call cgen-api on the Mac mini (CGEN_API_URL + CGEN_API_KEY), for when Central
//              Flock runs somewhere else. Retries only when cgen-api could not be reached at all,
//              with an idempotency key so a retried send can never go out twice.
//
// In sandbox mode nothing reaches the Mac: sends and contact creation log and report success, and
// reads return empty lists, so flows still work against a copy of the data.
//
// SEND_ALLOWLIST (comma-separated phone numbers) restricts sends to those numbers even when sandbox
// mode is off — used once to prove a real send before cut-over.

export type {CalendarEvent, CalendarInfo, MacContact}

type Mode = 'local' | 'cgen-api'

function mode(): Mode {
  const raw = process.env.MAC_BRIDGE ?? 'local'
  if (raw === 'local' || raw === 'cgen-api') return raw
  throw new Error(`MAC_BRIDGE must be "local" or "cgen-api", got "${raw}"`)
}

const digits = (phone: string) => phone.replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '')

export function assertAllowedRecipient(phoneNumber: string): void {
  const raw = process.env.SEND_ALLOWLIST?.trim()
  if (!raw) return
  const allowed = new Set(raw.split(',').map(digits).filter(Boolean))
  if (!allowed.has(digits(phoneNumber))) {
    throw new Error(`Not sent: ${phoneNumber} is not on SEND_ALLOWLIST`)
  }
}

// --- cgen-api client --------------------------------------------------------------------------

const TIMEOUT_MS = 120_000
// 502 (origin down) and 530 (tunnel error) from Cloudflare mean the request never reached
// cgen-api. 504/524 are timeouts after it may already have acted, so they are not retried.
const UNREACHED_STATUSES = new Set([502, 503, 530])
let retryDelaysMs = [5_000, 30_000, 90_000]

export function setRetryDelaysForTest(delays: number[]): void {
  retryDelaysMs = delays
}

class BridgeUnreachableError extends Error {}

async function callCgenApi<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  const base = process.env.CGEN_API_URL
  const key = process.env.CGEN_API_KEY
  if (!base || !key) throw new Error('MAC_BRIDGE=cgen-api needs CGEN_API_URL and CGEN_API_KEY')
  const idempotencyKey = randomUUID()

  for (let attempt = 0; ; attempt++) {
    try {
      return await callOnce<T>(`${base.replace(/\/$/, '')}/api/mac${path}`, method, key, idempotencyKey, body)
    } catch (error) {
      if (!(error instanceof BridgeUnreachableError) || attempt >= retryDelaysMs.length) {
        throw error instanceof BridgeUnreachableError
          ? new Error(`Could not reach the Mac (cgen-api): ${error.message}`, {cause: error})
          : error
      }
      await new Promise((resolve) => setTimeout(resolve, retryDelaysMs[attempt]))
    }
  }
}

async function callOnce<T>(url: string, method: string, key: string, idempotencyKey: string, body?: unknown) {
  let res: Response
  try {
    res = await fetch(url, {
      method,
      headers: {
        'X-API-Key': key,
        'Idempotency-Key': idempotencyKey,
        ...(body === undefined ? {} : {'Content-Type': 'application/json'}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch (error) {
    // A timeout means cgen-api may be mid-send: report it, never retry it.
    if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
      throw new Error('The Mac (cgen-api) did not answer in time; check Messages before resending', {cause: error})
    }
    throw new BridgeUnreachableError(error instanceof Error ? error.message : String(error))
  }
  if (UNREACHED_STATUSES.has(res.status)) throw new BridgeUnreachableError(`HTTP ${res.status}`)
  const data = (await res.json().catch(() => null)) as {error?: string} | null
  if (!res.ok) throw new Error(data?.error || `cgen-api answered ${res.status}`)
  return data as T
}

// --- public API -------------------------------------------------------------------------------

export async function sendText(phoneNumber: string, message: string): Promise<void> {
  if (isSandbox()) {
    console.log(`[mac-bridge] sandbox: would text ${phoneNumber} (${message.length} chars)`)
    return
  }
  assertAllowedRecipient(phoneNumber)
  if (mode() === 'local') return applescript.sendMessageViaUI(phoneNumber, message)
  await callCgenApi('POST', '/text', {phoneNumber, message})
}

export async function sendImage(phoneNumber: string, imagePath: string, caption?: string): Promise<void> {
  if (isSandbox()) {
    console.log(`[mac-bridge] sandbox: would send an image to ${phoneNumber}`)
    return
  }
  assertAllowedRecipient(phoneNumber)
  if (mode() === 'local') return applescript.sendImageViaUI(phoneNumber, imagePath, caption)
  const imageBase64 = (await readFile(imagePath)).toString('base64')
  await callCgenApi('POST', '/image', {phoneNumber, imageBase64, caption})
}

export async function fetchContacts(): Promise<MacContact[]> {
  if (isSandbox()) return []
  if (mode() === 'local') return applescript.fetchContacts()
  return callCgenApi<MacContact[]>('GET', '/contacts')
}

export async function createContact(firstName: string, lastName: string, phoneNumber: string): Promise<void> {
  if (isSandbox()) {
    console.log(`[mac-bridge] sandbox: would create contact ${firstName} ${lastName}`)
    return
  }
  if (mode() === 'local') return applescript.createContact(firstName, lastName, phoneNumber)
  await callCgenApi('POST', '/contacts', {firstName, lastName, phoneNumber})
}

export async function fetchAvailableCalendars(): Promise<CalendarInfo[]> {
  if (isSandbox()) return []
  if (mode() === 'local') return calendar.fetchAvailableCalendars()
  return callCgenApi<CalendarInfo[]>('GET', '/calendars')
}

export async function fetchUpcomingEvents(
  calendarNames: string[],
  daysAhead: number,
): Promise<{events: CalendarEvent[]; missing: string[]}> {
  if (calendarNames.length === 0 || isSandbox()) return {events: [], missing: []}
  if (mode() === 'local') return calendar.fetchUpcomingEvents(calendarNames, daysAhead)
  const result = await callCgenApi<{events: CalendarEvent[]; missing: string[]}>('POST', '/calendar-events', {
    calendarNames,
    daysAhead,
  })
  result.events.sort((a, b) => a.startDate.localeCompare(b.startDate))
  return result
}
