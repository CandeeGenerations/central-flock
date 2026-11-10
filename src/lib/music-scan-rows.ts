import type {ProposedLine, ProposedRow} from './music-scan-types'

/** Rows that offer Accept/Reject. Unchanged and song-filled rows always go in. */
export const isRowChoice = (r: ProposedRow) => r.change === 'changed' || r.change === 'added' || r.change === 'removed'

/** The line a row contributes to the week, or null when it is left out. */
export function rowLine(r: ProposedRow): ProposedLine | null {
  switch (r.change) {
    case 'added':
      return r.accepted ? r.sheet : null
    case 'removed':
      return r.accepted ? null : r.usual
    case 'changed':
      return r.accepted ? r.sheet : r.usual
    default:
      return r.sheet ?? r.usual
  }
}

/** The order Create week writes for a service. */
export const rowsToLines = (rows: ProposedRow[]): ProposedLine[] =>
  rows.map(rowLine).filter((l): l is ProposedLine => l !== null)

const WORD = /[a-z0-9.']+/g

/** Share of words two prose lines have in common, against the longer one. */
function overlap(a: string, b: string): number {
  const words = (t: string) => new Set(t.toLowerCase().replace(/[*_]/g, '').match(WORD) ?? [])
  const wa = words(a)
  const wb = words(b)
  if (!wa.size || !wb.size) return 0
  let shared = 0
  for (const w of wa) if (wb.has(w)) shared++
  return shared / Math.max(wa.size, wb.size)
}

/** Lines in the same spot sharing at least half their words are one line reworded. */
const REWORDED = 0.5

/**
 * Merge the usual and scanned orders along their aligned pairs ([usualIndex, scannedIndex]) into rows.
 * Changes start rejected, since the usual order is the default and the pastor's sheets word things
 * their own way. The exception is a song only on the sheet, which starts accepted.
 */
export function mergeRows(
  usualLines: ProposedLine[],
  scannedLines: ProposedLine[],
  pairs: [number, number][],
  /** The usual line to keep when a matched row is rejected; defaults to usualLines[i]. */
  rejectedUsual: (usualIndex: number) => ProposedLine = (i) => usualLines[i],
): {rows: ProposedRow[]; rowOfScanned: Map<number, number>} {
  const rows: ProposedRow[] = []
  const rowOfScanned = new Map<number, number>()
  let ui = 0
  let si = 0
  for (const [pu, ps] of [...pairs, [usualLines.length, scannedLines.length] as [number, number]]) {
    // The unmatched stretch before this pair: pair rewordings, then lay the rest out in order.
    const gapUsual = usualLines.slice(ui, pu).map((line) => ({line, partner: -1}))
    const gapSheet = scannedLines.slice(si, ps).map((line, k) => ({line, index: si + k, taken: false}))
    for (const u of gapUsual) {
      if (u.line.kind !== 'prose') continue
      let best = -1
      let bestScore = REWORDED
      gapSheet.forEach((g, k) => {
        if (g.taken || g.line.kind !== 'prose') return
        const score = overlap(u.line.text, g.line.text)
        if (score >= bestScore) {
          best = k
          bestScore = score
        }
      })
      if (best >= 0) {
        u.partner = best
        gapSheet[best].taken = true
      }
    }
    for (const u of gapUsual) {
      if (u.partner < 0) {
        rows.push({change: 'removed', accepted: false, usual: u.line, sheet: null})
        continue
      }
      const g = gapSheet[u.partner]
      rowOfScanned.set(g.index, rows.length)
      // The reworded line keeps the usual line's role and settings; only the wording is the sheet's.
      rows.push({change: 'changed', accepted: false, usual: u.line, sheet: {...u.line, text: g.line.text}})
    }
    for (const g of gapSheet) {
      if (g.taken) continue
      rowOfScanned.set(g.index, rows.length)
      // A song only on the sheet is a real addition, not a rewording, so it starts accepted.
      rows.push({change: 'added', accepted: g.line.kind === 'song', usual: null, sheet: g.line})
    }
    ui = pu
    si = ps
    if (pu === usualLines.length) break
    const sheet = scannedLines[ps]
    const usual = sheet.kind === 'song' ? usualLines[pu] : rejectedUsual(pu)
    const changed = sheet.kind === 'song' ? sheet.role !== usual.role : sheet.text !== usual.text
    rowOfScanned.set(ps, rows.length)
    rows.push({
      change: changed ? 'changed' : sheet.kind === 'song' ? 'filled' : 'unchanged',
      accepted: !changed,
      usual,
      sheet,
    })
    ui++
    si++
  }
  return {rows, rowOfScanned}
}
