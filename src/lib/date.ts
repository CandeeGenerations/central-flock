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
