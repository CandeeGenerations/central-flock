import type {HymnBook, OrderLine} from './music-schedule-core'

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
  /** Index into the service's lines (for the active order mode), when the flag is about one line. */
  lineIndex?: number
  /** For song_conflict: the alternatives found on the pages. */
  options?: {book: HymnBook; number: number; hymnId: number | null; title: string | null; page: ScanPageKind}[]
}

/** How a proposed line relates to the copied-forward (usual) order. */
export type ScanLineStatus = 'unchanged' | 'filled' | 'added'

export type ProposedLine = Omit<OrderLine, 'id' | 'sortOrder' | 'highlight' | 'boothHighlight'> & {
  status: ScanLineStatus
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
  /** Which order Create week writes. Defaults to 'scanned' when they differ. */
  orderMode: 'scanned' | 'usual'
  /** The scanned order; matched lines keep the usual line's settings. */
  scannedLines: ProposedLine[]
  /** The copied-forward order with the scanned songs filled into matching slots. */
  usualLines: ProposedLine[]
  /** Usual lines with no counterpart on the sheet — dropped when orderMode is 'scanned'. */
  removedLines: string[]
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
  orderMode?: 'scanned' | 'usual'
  standalone?: boolean
  occasion?: string
  title?: string
  text?: string
  /** Replaces the active order's lines (after a person fixes a song). */
  lines?: ProposedLine[]
}
