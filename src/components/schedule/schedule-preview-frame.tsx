import {renderInline} from '@/lib/render-inline-markup'
import type {FooterBlock} from '@/lib/schedules-api'
import {type ReactNode, forwardRef} from 'react'

interface SchedulePreviewFrameProps {
  // Full computed title (e.g., "Nursery Schedule - January 2026" or
  // "CBC Special Music Schedule 2026"). Caller concatenates titlePrefix +
  // scopeLabel from settings.
  title: string
  logoPath?: string | null
  footerBlocks?: FooterBlock[]
  children: ReactNode
  // Optional centered line under the logo/title — used by the per-recipient
  // PDF page to display whose copy this is.
  subtitle?: string
  // When true (during JPG/PDF capture), suppress edit-affordance chrome
  // in the body. Body components inspect this if they care.
  exporting?: boolean
}

// Shared print/preview frame for every Schedule type. Renders the logo (or
// title fallback) at the top, the per-type body in the middle, and the
// configured footer text blocks at the bottom. This is the html-to-image
// capture target.
export const SchedulePreviewFrame = forwardRef<HTMLDivElement, SchedulePreviewFrameProps>(function SchedulePreviewFrame(
  {title, logoPath, footerBlocks, children, subtitle},
  ref,
) {
  return (
    <div
      ref={ref}
      className="mx-auto px-2 py-3"
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
        ) : null}
        <h2 className="text-xl font-bold" style={{color: '#000', marginBottom: subtitle ? 2 : 0}}>
          {title}
        </h2>
        {subtitle ? (
          <div
            style={{
              color: '#000',
              fontFamily: '"DM Serif Display", serif',
              fontStyle: 'italic',
              fontSize: 28,
              lineHeight: 1.1,
              marginTop: 4,
            }}
          >
            {subtitle}
          </div>
        ) : null}
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
                    fontFamily: '"DM Serif Display", serif',
                    fontStyle: 'italic',
                    fontSize: 16,
                    lineHeight: 1.35,
                    marginBottom: 8,
                    fontWeight: b.bold ? 700 : 400,
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {renderInline(b.text)}
                </div>
              )
            return (
              <div
                key={i}
                style={{
                  fontSize: 14,
                  lineHeight: 1.4,
                  marginBottom: 8,
                  fontWeight: b.bold ? 700 : 400,
                  display: 'grid',
                  gridTemplateColumns: '1.25em 1fr',
                  columnGap: 4,
                  paddingLeft: 12,
                }}
              >
                <span aria-hidden style={{textAlign: 'center'}}>
                  ▪
                </span>
                <span style={{whiteSpace: 'pre-wrap'}}>{renderInline(b.text)}</span>
              </div>
            )
          })}
        </div>
      ) : null}
    </div>
  )
})
