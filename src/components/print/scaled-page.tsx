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
    <div ref={containerRef} className="flex justify-center overflow-auto">
      <div style={{width: width * scale, height: height * scale, flexShrink: 0}}>
        <div style={{transform: `scale(${scale})`, transformOrigin: 'top left', width}}>{children}</div>
      </div>
    </div>
  )
}
