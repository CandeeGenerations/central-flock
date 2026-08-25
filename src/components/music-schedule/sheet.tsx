import {CONTENT_HEIGHT_PX, PAGE_PADDING_X_PX, PAGE_WIDTH_PX, PrintPage} from '@/components/print/page-frame'
import {ScaledPage, type ZoomMode} from '@/components/print/scaled-page'
import {type ReactNode, useLayoutEffect, useMemo, useRef, useState} from 'react'

import {TYPE} from './type-scale'
import {usePagination} from './use-pagination'

export interface SheetBlock {
  key: string
  node: ReactNode
  /** An explicit page-break Order Line follows this block. */
  breakAfter?: boolean
}

/**
 * One printed sheet: a title, a run of service blocks packed onto as many pages
 * as they need (ADR 0023), and an optional footer on the last page.
 *
 * The measure layer renders the same nodes at the real page width offscreen,
 * so the packer measures the document that actually prints — the same reason
 * ADR 0021 requires the preview to be the print node scaled.
 */
export function Sheet({
  title,
  subtitle,
  blocks,
  footer,
  onPages,
  onOverflow,
  overlay,
  zoom,
  paddingX = PAGE_PADDING_X_PX,
}: {
  title: string
  subtitle: string
  blocks: SheetBlock[]
  footer?: ReactNode
  /** The page nodes, in order, once laid out — this is what the export captures. */
  onPages?: (nodes: HTMLDivElement[]) => void
  onOverflow?: (overflow: {key: string; px: number}[]) => void
  /** Edit chrome layered over one page, inside its relative box. The export
   *  clones the live node, so this must only be rendered in edit mode — the
   *  ADR 0005 rule that no edit chrome reaches the PDF. */
  overlay?: (index: number, ref: React.RefObject<HTMLDivElement | null>) => ReactNode
  zoom: ZoomMode
  /** Side margin for this sheet's pages. The Sound Booth Sheet runs wider. */
  paddingX?: number
}) {
  const measureRef = useRef<HTMLDivElement>(null)
  const headerRef = useRef<HTMLDivElement>(null)
  const footerRef = useRef<HTMLDivElement>(null)
  const [headerH, setHeaderH] = useState(0)
  const [footerH, setFooterH] = useState(0)

  useLayoutEffect(() => {
    setHeaderH(headerRef.current?.offsetHeight ?? 0)
    setFooterH(footerRef.current?.offsetHeight ?? 0)
  }, [title, subtitle, footer, blocks, paddingX])

  // Width changes reflow every block, so it belongs in the remeasure key —
  // memoised, because a fresh array here re-fires the measure effect on every
  // render of this component and the resulting setState loops.
  const remeasureKey = useMemo(() => [blocks, paddingX], [blocks, paddingX])

  const forced = new Set(blocks.filter((b) => b.breakAfter).map((b) => b.key))
  const {pages, overflow, heights} = usePagination(
    blocks.map((b) => b.key),
    measureRef,
    {first: CONTENT_HEIGHT_PX - headerH, rest: CONTENT_HEIGHT_PX},
    forced,
    remeasureKey,
  )

  const overflowKey = overflow.map((o) => `${o.key}:${o.px}`).join(',')
  useLayoutEffect(() => {
    onOverflow?.(overflow)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overflowKey])

  // The footer needs room on the last page, else it gets a page of its own.
  const lastUsed = pages[pages.length - 1] ?? []
  const usedOnLast = lastUsed.reduce((sum, k) => sum + (heights[k] ?? 0), 0)
  const needsFooterPage = !!footer && footerH > 0 && lastUsed.length > 0 && usedOnLast + footerH > CONTENT_HEIGHT_PX
  const rendered = needsFooterPage ? [...pages, []] : pages

  // One stable ref object per page, so the overlay can point at a page node
  // without anything reading a ref during render.
  const pageObjects = useMemo(
    () => Array.from({length: rendered.length}, () => ({current: null as HTMLDivElement | null})),
    [rendered.length],
  )

  useLayoutEffect(() => {
    onPages?.(pageObjects.map((r) => r.current).filter((n): n is HTMLDivElement => !!n))
  })

  const byKey = new Map(blocks.map((b) => [b.key, b.node]))

  return (
    <>
      {/* Measure layer: same nodes, same width, offscreen. Never exported. */}
      <div
        ref={measureRef}
        aria-hidden
        style={{
          position: 'fixed',
          left: -99999,
          top: 0,
          width: PAGE_WIDTH_PX - paddingX * 2,
          visibility: 'hidden',
        }}
      >
        <div ref={headerRef}>
          <SheetHeader title={title} subtitle={subtitle} />
        </div>
        {blocks.map((b) => (
          <div key={b.key} data-page-block={b.key}>
            {b.node}
          </div>
        ))}
        {footer ? <div ref={footerRef}>{footer}</div> : null}
      </div>

      {rendered.map((keys, i) => {
        const pageObject = pageObjects[i]
        return (
          <div key={i} className="rounded border bg-white shadow-sm">
            <ScaledPage zoom={zoom}>
              {/* The overlay is a SIBLING of the page node, so the export clone
                  can never pick up edit chrome — the ADR 0005 rule. */}
              <div style={{position: 'relative'}}>
                <PrintPage
                  paddingX={paddingX}
                  ref={(el) => {
                    pageObject.current = el
                  }}
                >
                  {i === 0 ? <SheetHeader title={title} subtitle={subtitle} /> : null}
                  {keys.map((k) => (
                    <div key={k}>{byKey.get(k)}</div>
                  ))}
                  {footer && i === rendered.length - 1 ? footer : null}
                </PrintPage>
                {overlay?.(i, pageObject)}
              </div>
            </ScaledPage>
          </div>
        )
      })}
    </>
  )
}

function SheetHeader({title, subtitle}: {title: string; subtitle: string}) {
  return (
    <div style={{textAlign: 'center', marginBottom: 14}}>
      <div style={{fontSize: `${TYPE.pageTitle}pt`, fontWeight: 700, letterSpacing: 1}}>{title}</div>
      <div style={{fontSize: `${TYPE.pageSubtitle}pt`, fontWeight: 700}}>{subtitle}</div>
    </div>
  )
}
