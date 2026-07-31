// Stored publishing descriptions carry a header line naming the devotion's
// slot: "#2345 - August 27, 2026". The rest of the text is hand-authored per
// video (Timestamps blocks and the like), so it must never be regenerated —
// only the header is derived from the slot.
//
// A Swap moves description text between slots (ADR 0016: everything except
// id/number/date/createdAt travels with the content), which leaves the header
// naming the slot the text came FROM. Rewriting just that line keeps the box
// model intact without touching anything the user typed.

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

// Mirrors formatDevotionDate in src/lib/devotion-api.ts — "August 27, 2026".
export function formatHeaderDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  return `${MONTHS[m - 1]} ${d}, ${y}`
}

export function buildDescriptionHeader(number: number, date: string): string {
  return `#${String(number).padStart(3, '0')} - ${formatHeaderDate(date)}`
}

// Matches a header line anywhere in the text: "#123 - Some Date". Anchored to a
// whole line so the hashtag block (#cbc, #dailydevotional) can't be hit — those
// are never alone on a line starting with # followed by digits and " - ".
const HEADER_LINE = /^#\d+ - .*$/m

// Returns the text with its header line pointing at (number, date). Null input,
// empty text, or text with no recognisable header comes back untouched — a
// description without a header is either unwritten or hand-shaped in a way we
// shouldn't guess at.
export function retargetDescriptionHeader(text: string | null, number: number, date: string): string | null {
  if (!text || !text.trim()) return text
  if (!HEADER_LINE.test(text)) return text
  return text.replace(HEADER_LINE, buildDescriptionHeader(number, date))
}
