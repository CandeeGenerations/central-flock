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
  return format(parseUTC(dateStr), 'M/d/yyyy')
}

export function formatDateTime(dateStr: string): string {
  return format(parseUTC(dateStr), 'M/d/yyyy h:mm a')
}
