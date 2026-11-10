import {type ReactNode, useEffect, useRef, useState} from 'react'

import {type PageOrientation, pageHeightPx, pageWidthPx} from './page-frame'

export type ZoomMode = 'fit' | 1 | 1.5

/**
 * Shows the real page node scaled with a transform rather than reflowed, so
 * what is on screen is exactly what prints and any hit zones layered on top
 * stay aligned at every zoom. See ADR 0021.
 */
export function ScaledPage({
  children,
  zoom,
  orientation = 'portrait',
}: {
  children: ReactNode
  zoom: ZoomMode
  orientation?: PageOrientation
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [fitScale, setFitScale] = useState(1)
  const width = pageWidthPx(orientation)
  const height = pageHeightPx(orientation)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const observer = new ResizeObserver(() => {
      setFitScale(Math.min(1, el.clientWidth / width))
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [width])

  const scale = zoom === 'fit' ? fitScale : zoom

  return (
    // contain-inline-size: the box takes its width from the layout, never from the page inside,
    // so "fit" measures the real screen width instead of the 816px page it holds.
    <div ref={containerRef} className="flex w-full min-w-0 justify-center overflow-auto [contain:inline-size]">
      <div style={{width: width * scale, height: height * scale, flexShrink: 0}}>
        <div style={{transform: `scale(${scale})`, transformOrigin: 'top left', width}}>{children}</div>
      </div>
    </div>
  )
}
