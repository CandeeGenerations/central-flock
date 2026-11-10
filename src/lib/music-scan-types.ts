import type {BoothLine, HymnBook, OrderLine} from './music-schedule-core'

// The contract between the Schedule Scan server and its review screen.
// See CONTEXT.md → Schedule Scan.

export type ScanPageKind = 'sunday_sheet' | 'midweek_sheet' | 'form'

export type ScanFlagKind =
  /** A song's number couldn't be read, or isn't in that book. Left blank for a person. */
  | 'song_unresolved'
  /** Two pages give different numbers for the same song slot. */
  | 'song_conflict'
  /** A Text reference that doesn't exist in the Bible Text. */
  | 'text_invalid'
  /** A scanned service that matched no active Service Time. */
  | 'service_unmatched'

export interface ScanFlag {
  kind: ScanFlagKind
  message: string
  /** Index into the service's rows, when the flag is about one line. */
  lineIndex?: number
  /** For song_conflict: the alternatives found on the pages. */
  options?: {book: HymnBook; number: number; hymnId: number | null; title: string | null; page: ScanPageKind}[]
}

/** How a proposed line relates to the copied-forward (usual) order. */
export type ScanLineStatus = 'unchanged' | 'filled' | 'added'

export type ProposedLine = Omit<OrderLine, 'id' | 'sortOrder' | 'highlight' | 'boothHighlight'> & {
  status: ScanLineStatus
}

/**
 * How one row of the review differs from the usual order:
 * - unchanged: the same line on both.
 * - filled: a song slot on both; the sheet's song goes in.
 * - changed: on both, but the sheet changes it (a Motto/Verse value, or a song's role).
 * - added: only on the sheet.
 * - removed: only in the usual order.
 */
export type ScanRowChange = 'unchanged' | 'filled' | 'changed' | 'added' | 'removed'

export interface ProposedRow {
  change: ScanRowChange
  /** For changed, added and removed rows: take the sheet's version. Starts false — the usual order is the default. */
  accepted: boolean
  /** The line as the usual order has it, with the sheet's song in a matched slot. Null when added. */
  usual: ProposedLine | null
  /** The line as the sheet has it. Null when removed. */
  sheet: ProposedLine | null
}

export interface ProposedService {
  serviceTimeId: number
  name: string
  date: string
  /** Every word capitalised, no quote marks. */
  title: string
  /** Full book names joined by ' & '. */
  text: string
  occasion: string
  standalone: boolean
  /** The scanned order differs from the copied-forward one. */
  orderDiffers: boolean
  /** The scanned order; matched lines keep the usual line's settings. */
  scannedLines: ProposedLine[]
  /** The copied-forward order with the scanned songs filled into matching slots. */
  usualLines: ProposedLine[]
  /** Filled in when the scan is read, for the preview: this Service Time's sheet headings, */
  musicHeading?: string
  boothHeading?: string
  /** …and the condensed Sound Booth lines Create week will carry forward (or the existing week's). */
  boothLines?: BoothLine[]
  /** Both orders merged in print order, each change accepted or rejected on its own. Create week writes these. */
  rows: ProposedRow[]
  /** Notes the scan couldn't place — "FILM IT ALL". Never placed automatically. */
  notes: string[]
  flags: ScanFlag[]
}

export interface ScanSummary {
  songs: number
  resolved: number
  /** Flags across every service. */
  toCheck: number
}

export interface ScanProposal {
  /** The Sunday read from the sheets. */
  weekStart: string
  /** Set when that week already exists — the review then applies to it. */
  existingWeekId: number | null
  pages: ScanPageKind[]
  services: ProposedService[]
  summary: ScanSummary
}

export type MusicScanStatus = 'unfinished' | 'applied' | 'discarded'

export interface MusicScanListItem {
  id: number
  status: MusicScanStatus
  weekStart: string | null
  createdAt: string
  photos: string[]
  summary: ScanSummary | null
}

export interface MusicScan {
  id: number
  status: MusicScanStatus
  photos: string[]
  musicScheduleId: number | null
  proposal: ScanProposal
}

/** One service's review choices, sent back with PATCH. Omitted fields are unchanged. */
export interface ScanServicePatch {
  serviceTimeId: number
  standalone?: boolean
  occasion?: string
  title?: string
  text?: string
  /** Replaces the rows (an accept/reject, or a fixed song). */
  rows?: ProposedRow[]
}
