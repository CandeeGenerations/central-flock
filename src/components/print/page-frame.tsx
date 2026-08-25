import {type ReactNode, forwardRef} from 'react'

// US Letter at 96 DPI. Because the box is a fixed size in CSS pixels and the
// PDF places it edge to edge, every `pt` written inside is a literal point on
// paper — 11pt prints as 11pt no matter how many lesson rows the term has.
// See docs/adr/0021-fixed-page-box-print.md.
export const PAGE_WIDTH_PX = 816
export const PAGE_HEIGHT_PX = 1056

// 0.6in sides, 0.5in top/bottom — measured off the paper originals.
export const PAGE_PADDING_X_PX = 58
export const PAGE_PADDING_Y_PX = 48

export const CONTENT_WIDTH_PX = PAGE_WIDTH_PX - PAGE_PADDING_X_PX * 2
export const CONTENT_HEIGHT_PX = PAGE_HEIGHT_PX - PAGE_PADDING_Y_PX * 2

/**
 * One printed page. Pure render — no handlers, no hover, no cursor styles, so
 * the export path can mount it directly and no edit chrome can reach the PDF
 * (the ADR 0005 rule). Interaction lives in a wrapper.
 *
 * Shared by the Workers' Notes and the Music Schedule; it belongs to neither.
 */
export const PrintPage = forwardRef<HTMLDivElement, {children: ReactNode; className?: string; paddingX?: number}>(
  function PrintPage({children, className, paddingX = PAGE_PADDING_X_PX}, ref) {
    return (
      <div
        ref={ref}
        className={className}
        style={{
          width: PAGE_WIDTH_PX,
          height: PAGE_HEIGHT_PX,
          padding: `${PAGE_PADDING_Y_PX}px ${paddingX}px`,
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
  },
)

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
