/**
 * Parse a UTC datetime string from SQLite (which omits the Z suffix)
 * into a proper Date object so toLocaleString() uses the local timezone.
 */
export function parseUTC(dateStr: string): Date {
  // If it already ends with Z or has timezone info, parse as-is
  if (dateStr.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(dateStr)) {
    return new Date(dateStr)
  }
  return new Date(dateStr + 'Z')
}

export function formatDate(dateStr: string): string {
  return parseUTC(dateStr).toLocaleDateString()
}

export function formatDateTime(dateStr: string): string {
  const d = parseUTC(dateStr)
  return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})}`
}
