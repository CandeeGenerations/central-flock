import {useCallback, useLayoutEffect, useState} from 'react'

/**
 * Region names a page can expose via `data-wn-region`. Each maps to the edit
 * sub-page a click should open.
 */
export type RegionName = 'theme' | 'blocks' | 'months' | 'lessons'

const REGION_LABELS: Record<RegionName, string> = {
  theme: 'Yearly Theme',
  blocks: 'Bullets',
  months: 'Months',
  lessons: 'Lessons',
}

interface Box {
  region: RegionName
  top: number
  left: number
  width: number
  height: number
}

/**
 * Layout offset of `el` relative to `root`, walking the offsetParent chain.
 * Deliberately not getBoundingClientRect: the page sits inside a CSS transform
 * for zoom, and offsetTop/offsetLeft are untransformed layout values, so the
 * measured boxes stay correct at every scale without dividing by it.
 */
function offsetWithin(el: HTMLElement, root: HTMLElement): {top: number; left: number} | null {
  let top = 0
  let left = 0
  let node: HTMLElement | null = el
  while (node && node !== root) {
    top += node.offsetTop
    left += node.offsetLeft
    node = node.offsetParent as HTMLElement | null
  }
  return node === root ? {top, left} : null
}

/**
 * Transparent tap targets measured from the page's own DOM, so they can't drift
 * out of alignment when content length changes. Lives in a wrapper — the page
 * components stay pure render and nothing here reaches the PDF (ADR 0005).
 */
export function RegionOverlay({
  pageRef,
  onOpen,
  deps,
}: {
  pageRef: React.RefObject<HTMLDivElement | null>
  onOpen: (region: RegionName) => void
  /** Changing this remeasures — pass whatever data drives the page's content. */
  deps: unknown
}) {
  const [boxes, setBoxes] = useState<Box[]>([])

  const measure = useCallback(() => {
    const root = pageRef.current
    if (!root) return
    const found: Box[] = []
    root.querySelectorAll<HTMLElement>('[data-wn-region]').forEach((el) => {
      const region = el.dataset.wnRegion as RegionName | undefined
      if (!region) return
      const offset = offsetWithin(el, root)
      if (!offset) return
      found.push({region, top: offset.top, left: offset.left, width: el.offsetWidth, height: el.offsetHeight})
    })
    setBoxes(found)
  }, [pageRef])

  useLayoutEffect(() => {
    measure()
    // Fonts land after first paint and shift everything down a few pixels.
    document.fonts?.ready.then(measure).catch(() => {})
  }, [measure, deps])

  return (
    <>
      {boxes.map((b, i) => (
        <button
          key={i}
          type="button"
          onClick={() => onOpen(b.region)}
          title={`Edit ${REGION_LABELS[b.region]}`}
          className="group absolute cursor-pointer rounded-sm border-2 border-transparent transition-colors hover:border-sky-400/70 hover:bg-sky-200/20 active:bg-sky-300/30"
          style={{top: b.top - 3, left: b.left - 4, width: b.width + 8, height: b.height + 6}}
        >
          <span className="pointer-events-none absolute top-0.5 right-1 rounded bg-sky-500 px-1.5 py-0.5 text-[11px] whitespace-nowrap text-white opacity-0 group-hover:opacity-100">
            {REGION_LABELS[b.region]}
          </span>
        </button>
      ))}
    </>
  )
}
