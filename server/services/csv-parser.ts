import Papa from 'papaparse'

export interface ParsedPerson {
  firstName: string | null
  lastName: string | null
  phoneNumber: string // E.164 format
  phoneDisplay: string // original format
  status: 'active' | 'inactive'
  groups: string[]
}

export function normalizePhoneNumber(phone: string): string {
  // Strip all non-digit characters
  const digits = phone.replace(/\D/g, '')

  // Handle different lengths
  if (digits.length === 10) {
    return `+1${digits}`
  } else if (digits.length === 11 && digits.startsWith('1')) {
    return `+${digits}`
  } else if (digits.length > 0) {
    return `+${digits}`
  }
  return phone // Return as-is if we can't parse
}

export function parseCSV(csvData: string): ParsedPerson[] {
  const result = Papa.parse(csvData, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header: string) => header.trim(),
  })

  if (result.errors.length > 0) {
    console.warn('CSV parse warnings:', result.errors)
  }

  return (result.data as Record<string, string>[]).map((row) => {
    const phoneRaw = (row['Phone Number'] || '').trim()
    const firstName = (row['First Name'] || '').trim() || null
    const lastName = (row['Last Name'] || '').trim() || null
    const groupsStr = (row['Groups'] || '').trim()
    const statusRaw = (row['Status'] || '').trim().toLowerCase()

    const groups = groupsStr
      ? groupsStr
          .split(',')
          .map((g) => g.trim())
          .filter(Boolean)
      : []

    const status: 'active' | 'inactive' =
      statusRaw === 'inactive' || statusRaw === '-' ? 'inactive' : 'active'

    return {
      firstName,
      lastName,
      phoneNumber: normalizePhoneNumber(phoneRaw),
      phoneDisplay: phoneRaw,
      status,
      groups,
    }
  })
}
