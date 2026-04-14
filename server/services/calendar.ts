import {spawn} from 'child_process'
import path from 'path'
import {fileURLToPath} from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SCRIPT_PATH = path.join(__dirname, '..', 'bin', 'calendar-fetch.swift')

export interface CalendarInfo {
  name: string
  color: string
}

export interface CalendarEvent {
  id: string
  title: string
  startDate: string
  endDate: string
  allDay: boolean
  location: string | null
  calendarName: string
  recurring: boolean
}

function runSwift(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn('swift', [SCRIPT_PATH, ...args])
    let stdout = ''
    let stderr = ''
    proc.stdout.on('data', (data) => (stdout += data))
    proc.stderr.on('data', (data) => (stderr += data))
    proc.on('error', reject)
    proc.on('close', (code) => {
      if (code === 0) {
        resolve(stdout)
        return
      }
      // Script prints an error JSON on failure; surface it if present
      try {
        const parsed = JSON.parse(stdout) as {error?: string}
        if (parsed.error) {
          reject(new Error(parsed.error))
          return
        }
      } catch {
        // fall through
      }
      reject(new Error(`swift exited with code ${code}: ${stderr || stdout}`))
    })
  })
}

export async function fetchAvailableCalendars(): Promise<CalendarInfo[]> {
  const raw = await runSwift(['calendars'])
  return JSON.parse(raw) as CalendarInfo[]
}

export async function fetchUpcomingEvents(
  calendarNames: string[],
  daysAhead: number,
): Promise<{events: CalendarEvent[]; missing: string[]}> {
  if (calendarNames.length === 0) return {events: [], missing: []}
  const raw = await runSwift(['events', String(Math.floor(daysAhead)), ...calendarNames])
  const parsed = JSON.parse(raw) as {events: CalendarEvent[]; missing: string[]}
  parsed.events.sort((a, b) => a.startDate.localeCompare(b.startDate))
  return parsed
}
