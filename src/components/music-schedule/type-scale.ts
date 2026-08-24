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
export const MUSIC_LEFT_COL_MIN_PX = 96
export const MUSIC_COL_GAP_PX = 12

// The Sound Booth Sheet's label column. One shared width across every block on
// the sheet; the value column takes the rest of the page.
export const BOOTH_LABEL_COL_PX = 290
export const BOOTH_COL_GAP_PX = 22

// Every cell carries the same padding so a highlight band has air around its
// text instead of running flush against it. The Music Sheet sets its rows
// tighter than the Sound Booth's — it is a dense run of service, read at a
// glance, where the booth sheet is four short blocks.
export const CELL_PAD = '2px 8px'
export const CELL_PAD_DENSE = '0 8px'
export const ROW_GAP_PX = 4

export const HIGHLIGHT = '#ffd966'
