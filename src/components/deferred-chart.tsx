import {type ReactNode, useEffect, useState} from 'react'

/**
 * Mounts a chart one frame later than the one above it, so recharts' synchronous SVG
 * layout is broken into separate tasks instead of one long block. Three charts mounting
 * at once monopolises the main thread long enough that a tap on the mobile FAB is queued
 * behind them rather than handled.
 *
 * A chart's own render overruns its frame, so the next chart's pending
 * `requestAnimationFrame` cannot fire until it finishes — the stagger sequences itself
 * without any shared counter.
 *
 * The gate is deliberately the only thing this component does. Swapping the frame chain
 * for an IntersectionObserver turns staged mounting into mount-on-visible, with no change
 * at the call sites. See docs/adr/0036-ios-relaunch-restore-not-prevent.md.
 */
export function DeferredChart({
  order = 0,
  width,
  height,
  children,
}: {
  order?: number
  width?: number
  height: number
  children: ReactNode
}) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    let raf = 0
    let remaining = order + 1
    const step = () => {
      remaining -= 1
      if (remaining <= 0) {
        setMounted(true)
        return
      }
      raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [order])

  // Reserves the chart's exact box. Without this each chart popping in shifts everything
  // below it while the user is already reaching for something — a tap landing on a moved
  // target is a worse bug than a tap landing late.
  if (!mounted) return <div style={{width, height}} aria-hidden />

  return <>{children}</>
}
