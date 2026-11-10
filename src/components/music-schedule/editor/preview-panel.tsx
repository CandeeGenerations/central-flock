import {ScanPhotoViewer} from '@/components/music-schedule/scan-photo-viewer'
import {BoothServiceBlock, MusicServiceBlock} from '@/components/music-schedule/service-block'
import {PAGE_PADDING_X_PX, PAGE_WIDTH_PX} from '@/components/print/page-frame'
import type {MusicService} from '@/lib/music-schedule-api'
import {renderLine} from '@/lib/music-schedule-core'
import {cn} from '@/lib/utils'
import {type ReactNode, useEffect, useRef, useState} from 'react'

import type {Draft} from './draft'

type View = 'music' | 'booth' | 'photos'

/**
 * What this service prints, live with unsaved edits — the print node itself,
 * scaled (ADR 0021) — or the pastor's photos when the week came from a scan.
 * Clicking a line on the Musicians view selects its row in the order.
 */
export function PreviewPanel({
  service,
  lines,
  photos,
  onSelectLine,
  className,
}: {
  service: MusicService
  lines: Draft[]
  photos: string[]
  onSelectLine: (key: string) => void
  className?: string
}) {
  const [view, setView] = useState<View>('music')
  const shown: View = view === 'photos' && !photos.length ? 'music' : view

  const views: {value: View; label: string}[] = [
    {value: 'music', label: 'Musicians'},
    {value: 'booth', label: 'Sound Booth'},
    ...(photos.length ? [{value: 'photos' as const, label: 'Photos'}] : []),
  ]

  const onMusicClick = (e: React.MouseEvent) => {
    const block = (e.target as HTMLElement).closest('[data-ms-service]')
    const grid = block?.children[1]
    if (!grid) return
    const cell = [...grid.children].find((c) => c.contains(e.target as Node))
    if (!cell) return
    const cellIndex = [...grid.children].indexOf(cell)
    // Merged rows are one grid cell, split rows two — walk them the way they render.
    const printed = lines.filter((l) => l.kind !== 'page_break')
    let seen = 0
    for (let i = 0; i < printed.length; i++) {
      seen += renderLine(printed[i], service, i === 0).merged ? 1 : 2
      if (cellIndex < seen) return onSelectLine(printed[i].key)
    }
  }

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div role="tablist" className="bg-muted inline-flex self-start rounded-md p-0.5 text-sm">
        {views.map((v) => (
          <button
            key={v.value}
            role="tab"
            type="button"
            aria-selected={shown === v.value}
            className={cn(
              'rounded px-3 py-1 pointer-coarse:py-2',
              shown === v.value ? 'bg-background font-medium shadow-sm' : 'text-muted-foreground',
            )}
            onClick={() => setView(v.value)}
          >
            {v.label}
          </button>
        ))}
      </div>
      {shown === 'photos' ? (
        <ScanPhotoViewer photos={photos} className="h-[calc(100vh-10rem)]" />
      ) : (
        <div className="min-h-0 overflow-y-auto">
          {shown === 'music' ? (
            <div className="cursor-pointer" onClick={onMusicClick}>
              <FitWidth>
                <MusicServiceBlock service={{...service, lines}} />
              </FitWidth>
            </div>
          ) : (
            <FitWidth>
              <BoothServiceBlock service={{...service, lines}} showRule={false} />
            </FitWidth>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * Renders one print block at the real page width, scaled down to whatever the
 * container gives it — the preview is the print node, never a re-layout of it
 * (ADR 0021).
 */
function FitWidth({children}: {children: ReactNode}) {
  const outerRef = useRef<HTMLDivElement>(null)
  const innerRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  const [height, setHeight] = useState(0)

  useEffect(() => {
    const outer = outerRef.current
    const inner = innerRef.current
    if (!outer || !inner) return
    const measure = () => {
      const s = Math.min(1, outer.clientWidth / PAGE_WIDTH_PX)
      setScale(s)
      setHeight(inner.offsetHeight * s)
    }
    const observer = new ResizeObserver(measure)
    observer.observe(outer)
    observer.observe(inner)
    return () => observer.disconnect()
  }, [])

  return (
    <div ref={outerRef} className="overflow-hidden rounded border bg-white">
      <div style={{height}}>
        <div
          ref={innerRef}
          style={{
            width: PAGE_WIDTH_PX,
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
            padding: `16px ${PAGE_PADDING_X_PX}px`,
            boxSizing: 'border-box',
            backgroundColor: '#ffffff',
            color: '#000000',
            fontFamily: 'Arial, Helvetica, sans-serif',
          }}
        >
          {children}
        </div>
      </div>
    </div>
  )
}
