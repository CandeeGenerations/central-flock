import {useCallback, useLayoutEffect, useState} from 'react'

interface Box {
  serviceId: number
  label: string
  top: number
  left: number
  width: number
  height: number
}

/**
 * Layout offset of `el` relative to `root`, walking the offsetParent chain.
 * Deliberately not getBoundingClientRect: the page sits inside a CSS transform
 * for zoom, and offsetTop/offsetLeft are untransformed layout values, so the
 * boxes stay correct at every scale without dividing by it.
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
 * Transparent tap targets over each service block, measured from the page's own
 * DOM so they can't drift as content changes. Lives in a wrapper — the page
 * components stay pure render and nothing here reaches the PDF (ADR 0005).
 */
export function ServiceOverlay({
  pageRef,
  labels,
  onOpen,
  deps,
}: {
  pageRef: React.RefObject<HTMLDivElement | null>
  labels: Record<number, string>
  onOpen: (serviceId: number) => void
  deps: unknown
}) {
  const [boxes, setBoxes] = useState<Box[]>([])

  const measure = useCallback(() => {
    const root = pageRef.current
    if (!root) return
    const found: Box[] = []
    root.querySelectorAll<HTMLElement>('[data-ms-service]').forEach((el) => {
      const serviceId = Number(el.dataset.msService)
      if (!Number.isFinite(serviceId)) return
      const offset = offsetWithin(el, root)
      if (!offset) return
      found.push({
        serviceId,
        label: labels[serviceId] ?? 'Service',
        top: offset.top,
        left: offset.left,
        width: el.offsetWidth,
        height: el.offsetHeight,
      })
    })
    setBoxes(found)
  }, [pageRef, labels])

  useLayoutEffect(() => {
    measure()
    document.fonts?.ready.then(measure).catch(() => {})
    const root = pageRef.current
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
  }, [measure, pageRef, deps])

  return (
    <>
      {boxes.map((b) => (
        <button
          key={b.serviceId}
          type="button"
          onClick={() => onOpen(b.serviceId)}
          title={`Edit ${b.label}`}
          className="group absolute cursor-pointer rounded-sm border-2 border-transparent transition-colors hover:border-sky-400/70 hover:bg-sky-200/20 active:bg-sky-300/30"
          style={{top: b.top - 3, left: b.left - 4, width: b.width + 8, height: b.height + 6}}
        >
          <span className="pointer-events-none absolute top-0.5 right-1 rounded bg-sky-500 px-1.5 py-0.5 text-[11px] whitespace-nowrap text-white opacity-0 group-hover:opacity-100">
            {b.label}
          </span>
        </button>
      ))}
    </>
  )
}
