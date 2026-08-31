import {PAGE_HEIGHT_PX, PAGE_WIDTH_PX} from './page-frame'

// The Nursery Schedule and the Special Music Schedule, declared in points
// against the fixed 816x1056 page box, so every size here is a literal point on
// paper. See the "Applied to" section of
// docs/adr/0021-fixed-page-box-print.md.
//
// One scale, shared by both sheets: they use the same frame and hang on the
// same wall. Every tunable lives here so re-proofing is a one-file change.

// 0.4in on all four sides — what `useScheduleExport` already placed these
// images at (10mm margins). The Workers' Notes' 0.6in/0.5in would NARROW the
// live area from 195.9mm to 185.4mm and cost a full point of body type.
export const SCHEDULE_PAGE_PADDING_PX = 38

export const SCHEDULE_CONTENT_WIDTH_PX = PAGE_WIDTH_PX - SCHEDULE_PAGE_PADDING_PX * 2 // 740
export const SCHEDULE_CONTENT_HEIGHT_PX = PAGE_HEIGHT_PX - SCHEDULE_PAGE_PADDING_PX * 2 // 980

export const SCHEDULE_TYPE = {
  title: 16,
  /** The Recipient Copy's name line, in DM Serif Display italic. */
  recipientSubtitle: 20,
  tableHeader: 10,
  // 11pt, not 12: the point buys back ~33px across a 21-row nursery month,
  // which is what pays for the cell padding below. The binding case is a
  // five-Sunday month (20 body rows + header), not the typical four.
  body: 11,
  footerQuote: 12,
  // Held down deliberately. The Footer Block notes run ~110 characters per
  // authored line: 3 wrapped lines at 10.5pt, 5 at 12pt, and the extra ~40px
  // comes straight out of the table. They are standing instructions nobody
  // reads twice; the names and dates are what the sheet is for.
  footerNote: 10,
} as const

/** 0.75in. Down from 80px, which buys 8px back for the table. */
export const SCHEDULE_LOGO_MAX_PX = 72

/** Reserved on every page so a Master Copy and a Recipient Copy are the same
 *  shape — the preview must be the sheet that prints, including the pack's. */
export const SCHEDULE_SUBTITLE_BAND_PX = 28

/** Title block to table, and table to Footer Blocks. Tightened from 24: on a
 *  Master Copy the reserved subtitle band already sits empty above the table,
 *  and the two gaps stacked read as a hole. */
export const SCHEDULE_HEADER_GAP_PX = 14
export const SCHEDULE_FOOTER_GAP_PX = 16

// 5px vertical, not 4. A 20-row nursery month clears the box by ~31px at this
// value; 7px would overflow it. See the note on `body` above.
export const SCHEDULE_CELL_PAD = '5px 8px'
export const SCHEDULE_RULE = '1.5px solid #000'
/** The hairline between services inside one date group. */
export const SCHEDULE_INNER_RULE = '1px solid #d1d5db'
export const SCHEDULE_HEADER_FILL = '#f3f4f6'

/** amber-200; readable against black text in print. Deliberately NOT the Music
 *  Schedule's `HIGHLIGHT` — these sheets have always used their own. */
export const SCHEDULE_HIGHLIGHT = '#fde68a'

// Label columns are fixed because their content is bounded; value columns split
// whatever is left, so adding a Service Time or a third nursery worker slot
// degrades into tighter columns rather than a sheet that breaks silently.
/** Holds "Sep 30" at any size in this scale. */
export const SCHEDULE_DATE_COL_PX = 90
/** Holds "Wednesday Evening" — ~141px at 12pt — with room to spare. */
export const NURSERY_SERVICE_COL_PX = 190

/** A floor, not the old hardcoded 52px row pin — that number competed with the
 *  type scale. Keeps a sparse quarter reading as a table, not a list.
 *
 *  Per-sheet on purpose, and this is the escape valve: a quarter is ~13 rows
 *  where a nursery month is up to 21, so this sheet can spend its slack on row
 *  height without pushing the nursery's worst case off the page. 40px holds
 *  even when the Footer Block quote runs its full five lines. */
export const SPECIAL_MUSIC_MIN_ROW_PX = 40
