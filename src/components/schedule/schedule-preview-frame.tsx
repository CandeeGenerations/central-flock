import {PAGE_WIDTH_PX, PrintPage} from '@/components/print/page-frame'
import {ScaledPage, type ZoomMode} from '@/components/print/scaled-page'
import {
  SCHEDULE_CONTENT_HEIGHT_PX,
  SCHEDULE_FOOTER_GAP_PX,
  SCHEDULE_HEADER_GAP_PX,
  SCHEDULE_LOGO_MAX_PX,
  SCHEDULE_PAGE_PADDING_PX,
  SCHEDULE_SUBTITLE_BAND_PX,
  SCHEDULE_TYPE,
} from '@/components/print/schedule-scale'
import {renderInline} from '@/lib/render-inline-markup'
import type {FooterBlock} from '@/lib/schedules-api'
import {AlertTriangle} from 'lucide-react'
import {type ReactNode, useCallback, useLayoutEffect, useRef, useState} from 'react'
import {Link} from 'react-router-dom'

interface SchedulePreviewFrameProps {
  // Full computed title (e.g., "Nursery Schedule - January 2026" or
  // "CBC Special Music Schedule 2026"). Caller concatenates titlePrefix +
  // scopeLabel from settings.
  title: string
  logoPath?: string | null
  footerBlocks?: FooterBlock[]
  /**
   * The sheet body, as a function of export state. Called twice: once with the
   * caller's own `exporting` for the visible page, and once with `true` for the
   * hidden measure mirror — so the overflow warning measures the document that
   * prints rather than the one with edit chrome in it (a `SearchableSelect` is
   * 28px where the printed cell holds a 16px line).
   */
  children: (exporting: boolean) => ReactNode
  /** The Recipient Copy's name line. The band is reserved even when empty. */
  subtitle?: string
  // When true (during JPG/PDF capture), suppress edit-affordance chrome
  // in the body. Body components inspect this if they care.
  exporting?: boolean
  zoom: ZoomMode
  /** The live page node — what the export captures. */
  pageRef?: React.RefObject<HTMLDivElement | null>
  /** Where the overflow warning sends someone to shorten the Footer Blocks. */
  settingsPath: string
}

interface Regions {
  header: number
  body: number
  footer: number
}

const MM_PER_PX = 25.4 / 96

/**
 * Shared print/preview frame for the Nursery Schedule and the Special Music
 * Schedule. One fixed 816x1056 page box at 0.4in margins, shown through
 * `ScaledPage` so what is on screen is what prints — see
 * docs/adr/0021-fixed-page-box-print.md.
 *
 * Content that exceeds the box is never rescaled: the warning above the page
 * names the region at fault and the export clips visibly.
 */
export function SchedulePreviewFrame({
  title,
  logoPath,
  footerBlocks,
  children,
  subtitle,
  exporting,
  zoom,
  pageRef,
  settingsPath,
}: SchedulePreviewFrameProps) {
  const measureRef = useRef<HTMLDivElement>(null)
  const [regions, setRegions] = useState<Regions>({header: 0, body: 0, footer: 0})

  const measure = useCallback(() => {
    const root = measureRef.current
    if (!root) return
    const read = (name: string) => root.querySelector<HTMLElement>(`[data-region='${name}']`)?.offsetHeight ?? 0
    const next = {header: read('header'), body: read('body'), footer: read('footer')}
    setRegions((prev) =>
      prev.header === next.header && prev.body === next.body && prev.footer === next.footer ? prev : next,
    )
  }, [])

  // Deliberately no dep array: any content change re-renders, and `measure`
  // bails out when the three heights are unchanged, so this cannot loop. The
  // mirror wrapper is a fixed 816x1056 box, so a ResizeObserver on it would
  // never fire — re-reading each render is the reliable trigger.
  useLayoutEffect(measure)

  useLayoutEffect(() => {
    // Fonts and the logo land after first paint and shift every height, so
    // remeasure when each settles rather than trusting pass one.
    document.fonts?.ready.then(measure).catch(() => {})
    const root = measureRef.current
    if (!root) return
    const pending = Array.from(root.querySelectorAll('img')).filter((img) => !img.complete)
    pending.forEach((img) => {
      img.addEventListener('load', measure)
      img.addEventListener('error', measure)
    })
    return () => {
      pending.forEach((img) => {
        img.removeEventListener('load', measure)
        img.removeEventListener('error', measure)
      })
    }
  }, [measure, logoPath])

  const total = regions.header + regions.body + regions.footer
  const overflowPx = total - SCHEDULE_CONTENT_HEIGHT_PX
  const overflowMm = Math.round(overflowPx * MM_PER_PX)
  // Row count cannot realistically trip this — the type scale was sized against
  // the hard ceiling — so the Footer Blocks are the usual culprit. Name whichever
  // region is actually largest rather than assuming.
  const culprit = regions.footer >= regions.body ? 'footer' : regions.body >= regions.header ? 'body' : 'header'

  const page = (forExport: boolean) => (
    <>
      <div data-region="header" style={{marginBottom: SCHEDULE_HEADER_GAP_PX, textAlign: 'center'}}>
        {logoPath ? (
          <img
            src={logoPath}
            alt=""
            crossOrigin="anonymous"
            style={{maxHeight: SCHEDULE_LOGO_MAX_PX, margin: '0 auto 8px', objectFit: 'contain'}}
          />
        ) : null}
        <div style={{fontSize: `${SCHEDULE_TYPE.title}pt`, fontWeight: 700, lineHeight: 1.2}}>{title}</div>
        {/* Reserved on every page so a Master Copy and a Recipient Copy share
            one geometry and one height budget. */}
        <div
          style={{
            minHeight: SCHEDULE_SUBTITLE_BAND_PX,
            marginTop: 4,
            fontFamily: '"DM Serif Display", serif',
            fontStyle: 'italic',
            fontSize: `${SCHEDULE_TYPE.recipientSubtitle}pt`,
            lineHeight: 1.1,
          }}
        >
          {subtitle || ' '}
        </div>
      </div>

      <div data-region="body">{children(forExport)}</div>

      {footerBlocks && footerBlocks.length > 0 ? (
        <div data-region="footer" style={{marginTop: SCHEDULE_FOOTER_GAP_PX}}>
          {footerBlocks.map((b, i) => {
            if (b.kind === 'spacer') return <div key={i} style={{height: 8}} />
            if (b.kind === 'quote')
              return (
                <div
                  key={i}
                  style={{
                    textAlign: 'center',
                    fontFamily: '"DM Serif Display", serif',
                    fontStyle: 'italic',
                    fontSize: `${SCHEDULE_TYPE.footerQuote}pt`,
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
                  fontSize: `${SCHEDULE_TYPE.footerNote}pt`,
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
      ) : (
        <div data-region="footer" />
      )}
    </>
  )

  return (
    <div className="space-y-3">
      {overflowPx > 0 ? (
        <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <div>
            This sheet overflows the printable area by <strong>{overflowMm}mm</strong> and will print clipped.{' '}
            {culprit === 'footer' ? (
              <>
                The footer blocks take {Math.round(regions.footer * MM_PER_PX)}mm — shortening them is the usual fix.{' '}
                <Link to={settingsPath} className="underline underline-offset-2">
                  Edit footer blocks
                </Link>
                .
              </>
            ) : culprit === 'body' ? (
              <>The schedule table itself takes {Math.round(regions.body * MM_PER_PX)}mm.</>
            ) : (
              <>The title and logo take {Math.round(regions.header * MM_PER_PX)}mm.</>
            )}
          </div>
        </div>
      ) : null}

      <ScaledPage zoom={zoom}>
        <PrintPage ref={pageRef} paddingX={SCHEDULE_PAGE_PADDING_PX} paddingY={SCHEDULE_PAGE_PADDING_PX}>
          {page(exporting ?? false)}
        </PrintPage>
      </ScaledPage>

      {/* Measure mirror: the same sheet in export state, offscreen at the real
          page width, so the warning above describes what prints. Pattern
          follows the Music Sheet's measure layer. */}
      <div
        ref={measureRef}
        aria-hidden
        style={{position: 'fixed', left: -99999, top: 0, width: PAGE_WIDTH_PX, pointerEvents: 'none'}}
      >
        <PrintPage paddingX={SCHEDULE_PAGE_PADDING_PX} paddingY={SCHEDULE_PAGE_PADDING_PX}>
          {page(true)}
        </PrintPage>
      </div>
    </div>
  )
}
