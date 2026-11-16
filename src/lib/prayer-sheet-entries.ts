// Pure helpers for the Prayer Sheet editor's entry list.

interface SundayLike {
  sundayDate: string // YYYY-MM-DD
  entries: {id: number; text: string}[]
}

// Comparable form of an entry: case, spacing, dash style and trailing punctuation ignored, so
// "Linda H – lung cancer surgery" matches "linda h - Lung cancer surgery.".
export function normalizeEntryText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/\s*[-–—]\s*/g, ' - ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.,;:!]+$/, '')
}

// The name part of an entry — everything before the first dash ("Linda H – lung cancer surgery"
// → "linda h"), normalized. No dash: the whole entry is the name.
export function entryName(text: string): string {
  const normalized = normalizeEntryText(text)
  const dash = normalized.indexOf(' - ')
  return (dash === -1 ? normalized : normalized.slice(0, dash)).trim()
}

export interface RepeatFlag {
  // 'text': the whole entry is already on an earlier Sunday; 'name': only the name is.
  kind: 'text' | 'name'
  dates: string[] // earlier Sundays (YYYY-MM-DD), oldest first
}

// Entry id → how it repeats something on an earlier Sunday. Only *earlier* Sundays count, so the
// first time a request appears it isn't flagged. A whole-text match wins over a name match.
export function repeatedFromEarlierSundays(sundays: SundayLike[]): Map<number, RepeatFlag> {
  const ordered = [...sundays].sort((a, b) => a.sundayDate.localeCompare(b.sundayDate))
  const seenText = new Map<string, string[]>() // normalized text → Sundays it appeared on
  const seenName = new Map<string, string[]>() // name → Sundays it appeared on
  const out = new Map<number, RepeatFlag>()
  const record = (seen: Map<string, string[]>, keys: Set<string>, date: string) => {
    for (const key of keys) seen.set(key, [...(seen.get(key) ?? []), date])
  }
  for (const sunday of ordered) {
    const texts = new Set<string>()
    const names = new Set<string>()
    for (const entry of sunday.entries) {
      const text = normalizeEntryText(entry.text)
      if (!text) continue
      const name = entryName(entry.text)
      const sameText = seenText.get(text) ?? []
      const sameName = name.length >= 2 ? (seenName.get(name) ?? []) : []
      if (sameText.length > 0) out.set(entry.id, {kind: 'text', dates: sameText})
      else if (sameName.length > 0) out.set(entry.id, {kind: 'name', dates: sameName})
      texts.add(text)
      if (name.length >= 2) names.add(name)
    }
    record(seenText, texts, sunday.sundayDate)
    record(seenName, names, sunday.sundayDate)
  }
  return out
}

// Entries in A–Z order by their text (blank entries last), for the "Sort A–Z" action.
export function alphabeticalIds(entries: {id: number; text: string}[]): number[] {
  return [...entries]
    .sort((a, b) => {
      const ta = a.text.trim()
      const tb = b.text.trim()
      if (!ta !== !tb) return ta ? -1 : 1
      return ta.localeCompare(tb, 'en', {sensitivity: 'base', numeric: true})
    })
    .map((e) => e.id)
}
