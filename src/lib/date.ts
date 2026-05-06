import {format} from 'date-fns'

/**
 * Parse a UTC datetime string from SQLite (which omits the Z suffix)
 * into a proper Date object so formatting uses the local timezone.
 */
export function parseUTC(dateStr: string): Date {
  if (dateStr.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(dateStr)) {
    return new Date(dateStr)
  }
  return new Date(dateStr + 'Z')
}

export function formatDate(dateStr: string): string {
  // Date-only strings (YYYY-MM-DD) should be parsed as local, not UTC
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return format(new Date(dateStr + 'T12:00:00'), 'MMM d, yyyy')
  }
  return format(parseUTC(dateStr), 'MMM d, yyyy')
}

export function formatDateTime(dateStr: string): string {
  return format(parseUTC(dateStr), 'EEE M/d/yyyy h:mm a')
}

/** Extract local-time HH:MM (24h) from a UTC ISO datetime string, e.g. for <input type="time"> */
export function localTimeFromUTC(dateStr: string): string {
  const d = parseUTC(dateStr)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** Extract local-date YYYY-MM-DD from a UTC ISO datetime string */
export function localDateFromUTC(dateStr: string): string {
  const d = parseUTC(dateStr)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
