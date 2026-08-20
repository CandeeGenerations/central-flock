import {type ReactNode, useEffect, useRef, useState} from 'react'

import {PAGE_HEIGHT_PX, PAGE_WIDTH_PX} from './page-frame'

export type ZoomMode = 'fit' | 1 | 1.5

/**
 * Shows the real 816x1056 page node scaled with a transform rather than
 * reflowed, so what is on screen is exactly what prints and any hit zones
 * layered on top stay aligned at every zoom. See ADR 0021.
 */
export function ScaledPage({children, zoom}: {children: ReactNode; zoom: ZoomMode}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [fitScale, setFitScale] = useState(1)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const observer = new ResizeObserver(() => {
      setFitScale(Math.min(1, el.clientWidth / PAGE_WIDTH_PX))
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const scale = zoom === 'fit' ? fitScale : zoom

  return (
    <div ref={containerRef} className="overflow-auto">
      <div style={{width: PAGE_WIDTH_PX * scale, height: PAGE_HEIGHT_PX * scale}}>
        <div style={{transform: `scale(${scale})`, transformOrigin: 'top left', width: PAGE_WIDTH_PX}}>{children}</div>
      </div>
    </div>
  )
}
