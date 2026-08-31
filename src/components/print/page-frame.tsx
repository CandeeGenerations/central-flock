import {type ReactNode, forwardRef} from 'react'

export type PageOrientation = 'portrait' | 'landscape'

// US Letter at 96 DPI. Because the box is a fixed size in CSS pixels and the
// PDF places it edge to edge, every `pt` written inside is a literal point on
// paper — 11pt prints as 11pt no matter how many lesson rows the term has.
// Landscape is the same box with the two swapped; the 1:1 mapping holds for
// both. See docs/adr/0021-fixed-page-box-print.md.
export const PAGE_WIDTH_PX = 816
export const PAGE_HEIGHT_PX = 1056

export function pageWidthPx(orientation: PageOrientation = 'portrait'): number {
  return orientation === 'landscape' ? PAGE_HEIGHT_PX : PAGE_WIDTH_PX
}

export function pageHeightPx(orientation: PageOrientation = 'portrait'): number {
  return orientation === 'landscape' ? PAGE_WIDTH_PX : PAGE_HEIGHT_PX
}

// 0.6in sides, 0.5in top/bottom — measured off the paper originals.
export const PAGE_PADDING_X_PX = 58
export const PAGE_PADDING_Y_PX = 48

export const CONTENT_WIDTH_PX = PAGE_WIDTH_PX - PAGE_PADDING_X_PX * 2
export const CONTENT_HEIGHT_PX = PAGE_HEIGHT_PX - PAGE_PADDING_Y_PX * 2

export function contentWidthPx(orientation: PageOrientation = 'portrait'): number {
  return pageWidthPx(orientation) - PAGE_PADDING_X_PX * 2
}

export function contentHeightPx(orientation: PageOrientation = 'portrait'): number {
  return pageHeightPx(orientation) - PAGE_PADDING_Y_PX * 2
}

/**
 * One printed page. Pure render — no handlers, no hover, no cursor styles, so
 * the export path can mount it directly and no edit chrome can reach the PDF
 * (the ADR 0005 rule). Interaction lives in a wrapper.
 *
 * Shared by the Workers' Notes, the Music Schedule, and the Nursery / Special
 * Music Schedules; it belongs to none of them. `paddingX`/`paddingY` are
 * per-sheet: margins come from how a sheet is read, not from one house style.
 */
export const PrintPage = forwardRef<
  HTMLDivElement,
  {
    children: ReactNode
    className?: string
    paddingX?: number
    paddingY?: number
    orientation?: PageOrientation
  }
>(function PrintPage(
  {children, className, paddingX = PAGE_PADDING_X_PX, paddingY = PAGE_PADDING_Y_PX, orientation = 'portrait'},
  ref,
) {
  return (
    <div
      ref={ref}
      className={className}
      style={{
        width: pageWidthPx(orientation),
        height: pageHeightPx(orientation),
        padding: `${paddingY}px ${paddingX}px`,
        boxSizing: 'border-box',
        backgroundColor: '#ffffff',
        color: '#000000',
        fontFamily: 'Arial, Helvetica, sans-serif',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {children}
    </div>
  )
})

/** The boxed headings — a hairline rule around a centred bold line. */
export function TitleBox({children, fontSize = 14}: {children: ReactNode; fontSize?: number}) {
  return (
    <div
      style={{
        border: '1px solid #000',
        padding: '7px 10px',
        textAlign: 'center',
        fontWeight: 700,
        fontSize: `${fontSize}pt`,
        lineHeight: 1.2,
      }}
    >
      {children}
    </div>
  )
}
