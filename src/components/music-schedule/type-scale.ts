// Declared in points against the fixed 816x1056 page box, so every size here is
// a literal point on paper. See docs/adr/0021-fixed-page-box-print.md.
export const TYPE = {
  pageTitle: 22,
  pageSubtitle: 14,
  serviceHeading: 13.5,
  body: 13,
  footerQuote: 13,
  footerRef: 12,
} as const

// The Music Sheet's left column is a floor, not a fixed stop: a one-off left
// cell like "NO CHOIR Cong." widens it rather than wrapping onto two lines.
export const MUSIC_LEFT_COL_MIN_PX = 84
export const MUSIC_COL_GAP_PX = 12

// The Sound Booth Sheet's label column. One shared width across every block on
// the sheet; the value column takes the rest of the page. Close to its floor:
// the longest service heading, "WEDNESDAY EVENING:", measures ~218px here with
// its cell padding, and below that the heading wraps onto two lines.
export const BOOTH_LABEL_COL_PX = 230
export const BOOTH_COL_GAP_PX = 22

// Every cell carries the same padding so a highlight band has air around its
// text instead of running flush against it. The Music Sheet sets its rows
// tighter than the Sound Booth's — it is a dense run of service, read at a
// glance, where the booth sheet is four short blocks.
export const CELL_PAD = '2px 8px'
export const CELL_PAD_DENSE = '0 8px'
export const ROW_GAP_PX = 4

// Air between one service block and the next. Padding, not margin: a bottom
// margin collapses out of the block wrapper, so the measure layer would size
// every block short and pack one too many onto a page.
export const SERVICE_GAP_PX = 26

// The Music Sheet's block is a fixed width centred on the page rather than a
// full-bleed table — the paper original sits in from both margins. Fixed so
// every service on every page shares one pair of column stops and one centring.
// This is close to the floor: the longest line in a normal week ("Theme: B #546
// Lead Me to Some Soul Today (x2 w/tag)") measures ~470px inside the block, so
// much below this and it wraps. Buy room from MUSIC_LEFT_COL_MIN_PX or TYPE.body
// before narrowing this further.
export const MUSIC_BLOCK_WIDTH_PX = 500

// The Sound Booth Sheet prints on wider margins than the Musicians sheet: four
// short blocks with rules between them, read across a dark booth.
export const BOOTH_PAGE_PADDING_X_PX = 92

export const HIGHLIGHT = '#ffd966'
