import Papa from 'papaparse'

export interface ParsedPerson {
  firstName: string | null
  lastName: string | null
  phoneNumber: string // E.164 format
  phoneDisplay: string // original format
  status: 'active' | 'inactive' | 'do_not_contact'
  groups: string[]
}

export function e164ToDisplay(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  const local = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits
  if (local.length === 10) return `(${local.slice(0, 3)}) ${local.slice(3, 6)}-${local.slice(6)}`
  return phone
}

// Mirrors src/lib/utils.ts:phoneToE164 — keep both in sync
export function normalizePhoneNumber(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  if (digits.length > 0) return `+${digits}`
  return ''
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

    const status: 'active' | 'inactive' | 'do_not_contact' =
      statusRaw === 'inactive' || statusRaw === '-'
        ? 'inactive'
        : statusRaw === 'do_not_contact' || statusRaw === 'dnc' || statusRaw === 'do not contact'
          ? 'do_not_contact'
          : 'active'

    const e164 = normalizePhoneNumber(phoneRaw)
    return {
      firstName,
      lastName,
      phoneNumber: e164,
      phoneDisplay: e164ToDisplay(e164),
      status,
      groups,
    }
  })
}
