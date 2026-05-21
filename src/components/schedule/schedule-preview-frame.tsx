import type {FooterBlock} from '@/lib/schedules-api'
import {Fragment, type ReactNode, forwardRef} from 'react'

// Renders the text with _underscores_ converted into <u>underlines</u>.
// Pairs of underscores; lone underscores render literally. No nesting.
function renderWithUnderlines(text: string): ReactNode {
  const parts: ReactNode[] = []
  const regex = /_([^_]+)_/g
  let last = 0
  let m: RegExpExecArray | null
  let key = 0
  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) parts.push(<Fragment key={key++}>{text.slice(last, m.index)}</Fragment>)
    parts.push(<u key={key++}>{m[1]}</u>)
    last = m.index + m[0].length
  }
  if (last < text.length) parts.push(<Fragment key={key}>{text.slice(last)}</Fragment>)
  return parts.length > 0 ? parts : text
}

interface SchedulePreviewFrameProps {
  // Full computed title (e.g., "Nursery Schedule - January 2026" or
  // "CBC Special Music Schedule 2026"). Caller concatenates titlePrefix +
  // scopeLabel from settings.
  title: string
  logoPath?: string | null
  footerBlocks?: FooterBlock[]
  children: ReactNode
  // When true (during JPG/PDF capture), suppress edit-affordance chrome
  // in the body. Body components inspect this if they care.
  exporting?: boolean
}

// Shared print/preview frame for every Schedule type. Renders the logo (or
// title fallback) at the top, the per-type body in the middle, and the
// configured footer text blocks at the bottom. This is the html-to-image
// capture target.
export const SchedulePreviewFrame = forwardRef<HTMLDivElement, SchedulePreviewFrameProps>(function SchedulePreviewFrame(
  {title, logoPath, footerBlocks, children},
  ref,
) {
  return (
    <div
      ref={ref}
      className="mx-auto px-4 py-6"
      style={{
        fontFamily: 'Arial, sans-serif',
        backgroundColor: '#ffffff',
        color: '#000000',
        width: '800px',
        maxWidth: '100%',
        boxSizing: 'border-box',
      }}
    >
      {/* Header */}
      <div className="mb-6 text-center">
        {logoPath ? (
          <img src={logoPath} alt="" className="mx-auto mb-2 max-h-20 object-contain" crossOrigin="anonymous" />
        ) : (
          <h2 className="mb-2 text-xl font-bold" style={{color: '#000'}}>
            {title}
          </h2>
        )}
      </div>

      {children}

      {/* Footer blocks */}
      {footerBlocks && footerBlocks.length > 0 ? (
        <div className="mt-6" style={{color: '#000'}}>
          {footerBlocks.map((b, i) => {
            if (b.kind === 'spacer') return <div key={i} style={{height: 8}} />
            if (b.kind === 'quote')
              return (
                <div
                  key={i}
                  className="text-center"
                  style={{
                    fontStyle: 'italic',
                    fontSize: 12,
                    lineHeight: 1.4,
                    marginBottom: 8,
                    fontWeight: b.bold ? 700 : 400,
                  }}
                >
                  {renderWithUnderlines(b.text)}
                </div>
              )
            return (
              <div key={i} style={{fontSize: 12, lineHeight: 1.4, marginBottom: 4, fontWeight: b.bold ? 700 : 400}}>
                &bull; {renderWithUnderlines(b.text)}
              </div>
            )
          })}
        </div>
      ) : null}
    </div>
  )
})
