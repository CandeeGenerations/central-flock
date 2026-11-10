import {cn} from '@/lib/utils'
import {RotateCcw} from 'lucide-react'
import {type PointerEvent, useEffect, useRef, useState} from 'react'

const MIN = 1
const MAX = 8
const LOUPE_DEFAULT = 2.5

interface View {
  scale: number
  x: number
  y: number
}

const FIT: View = {scale: 1, x: 0, y: 0}

/**
 * A photo fitted to its box. With a mouse it works like a loupe: hovering
 * magnifies the spot under the pointer and the scroll wheel (or a trackpad
 * pinch) sets how strong. On a touch screen, pinch to zoom and drag to move.
 * Scale 1 is "whole photo fits"; it never zooms out past that.
 *
 * `fitToPhoto` sizes the box to the photo's own shape instead of the space given.
 */
export function ZoomableImage({
  src,
  alt,
  className,
  fitToPhoto,
}: {
  src: string
  alt: string
  className?: string
  fitToPhoto?: boolean
}) {
  const boxRef = useRef<HTMLDivElement>(null)
  const [view, setView] = useState<View>(FIT)
  const [aspect, setAspect] = useState<number | null>(null)
  const loupe = useRef(LOUPE_DEFAULT)
  const [hovering, setHovering] = useState(false)
  const pointers = useRef(new Map<number, {x: number; y: number}>())
  const pinchFrom = useRef<{dist: number; view: View; mid: {x: number; y: number}} | null>(null)

  // Keeps the photo covering its box, so it can't be moved off screen.
  const clamp = (v: View): View => {
    const box = boxRef.current
    if (!box) return v
    const w = box.clientWidth
    const h = box.clientHeight
    return {
      scale: v.scale,
      x: Math.min(0, Math.max(w - w * v.scale, v.x)),
      y: Math.min(0, Math.max(h - h * v.scale, v.y)),
    }
  }

  /** Zoom to `next` keeping the box point (cx, cy) over the same spot of the photo. */
  const zoomAt = (v: View, next: number, cx: number, cy: number): View => {
    const scale = Math.min(MAX, Math.max(MIN, next))
    if (scale === MIN) return FIT
    const k = scale / v.scale
    return clamp({scale, x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k})
  }

  // A loupe: the spot under the pointer stays put while everything around it grows.
  const loupeAt = (p: {x: number; y: number}) => zoomAt(FIT, loupe.current, p.x, p.y)

  useEffect(() => {
    const box = boxRef.current
    if (!box) return
    // Non-passive so the page doesn't scroll while the pointer is over the photo.
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const r = box.getBoundingClientRect()
      const p = {x: e.clientX - r.left, y: e.clientY - r.top}
      // Trackpad pinch arrives as a ctrl-wheel with small deltas; a mouse wheel as larger steps.
      const factor = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015))
      loupe.current = Math.min(MAX, Math.max(1.25, loupe.current * factor))
      setHovering(true)
      setView(loupeAt(p))
    }
    box.addEventListener('wheel', onWheel, {passive: false})
    return () => box.removeEventListener('wheel', onWheel)
  }, [])

  const local = (e: PointerEvent) => {
    const r = boxRef.current!.getBoundingClientRect()
    return {x: e.clientX - r.left, y: e.clientY - r.top}
  }

  const onPointerMove = (e: PointerEvent) => {
    const now = local(e)
    if (e.pointerType === 'mouse') {
      setHovering(true)
      setView(loupeAt(now))
      return
    }
    const prev = pointers.current.get(e.pointerId)
    if (!prev) return
    pointers.current.set(e.pointerId, now)
    if (pointers.current.size === 2 && pinchFrom.current) {
      const [a, b] = [...pointers.current.values()]
      const p = pinchFrom.current
      setView(zoomAt(p.view, p.view.scale * (Math.hypot(a.x - b.x, a.y - b.y) / p.dist), p.mid.x, p.mid.y))
      return
    }
    setView((v) => (v.scale === 1 ? v : clamp({...v, x: v.x + now.x - prev.x, y: v.y + now.y - prev.y})))
  }

  const onPointerDown = (e: PointerEvent) => {
    if (e.pointerType === 'mouse') return
    e.currentTarget.setPointerCapture(e.pointerId)
    pointers.current.set(e.pointerId, local(e))
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      pinchFrom.current = {dist: Math.hypot(a.x - b.x, a.y - b.y), view, mid: {x: (a.x + b.x) / 2, y: (a.y + b.y) / 2}}
    }
  }

  const onPointerUp = (e: PointerEvent) => {
    pointers.current.delete(e.pointerId)
    if (pointers.current.size < 2) pinchFrom.current = null
  }

  const onPointerLeave = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse') return
    setHovering(false)
    setView(FIT)
  }

  // A touch zoom stays until reset; a mouse loupe clears itself on leaving.
  const touchZoomed = view.scale > 1 && !hovering

  return (
    <div
      ref={boxRef}
      className={cn('relative touch-none overflow-hidden select-none', fitToPhoto && 'w-full', className)}
      style={fitToPhoto && aspect ? {aspectRatio: aspect} : undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onPointerLeave={onPointerLeave}
    >
      <img
        src={src}
        alt={alt}
        draggable={false}
        onLoad={(e) => setAspect(e.currentTarget.naturalWidth / e.currentTarget.naturalHeight)}
        className="absolute inset-0 h-full w-full object-contain"
        style={{transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`, transformOrigin: '0 0'}}
      />
      {touchZoomed ? (
        <button
          type="button"
          aria-label="Fit the whole photo"
          title="Fit the whole photo"
          className="absolute top-2 right-2 rounded-full bg-black/60 p-1.5 text-white"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => setView(FIT)}
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </button>
      ) : view.scale === 1 ? (
        <span className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-black/50 px-2 py-0.5 text-[11px] whitespace-nowrap text-white">
          <span className="pointer-coarse:hidden">Hover to zoom · scroll to change how much</span>
          <span className="hidden pointer-coarse:inline">Pinch to zoom · drag to move</span>
        </span>
      ) : null}
    </div>
  )
}
