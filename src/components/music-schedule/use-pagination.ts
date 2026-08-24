import {type RefObject, useCallback, useLayoutEffect, useState} from 'react'

export interface PaginationResult {
  /** Block keys, grouped per page. Always at least one page. */
  pages: string[][]
  /** Blocks taller than a whole page, with the measured overflow in px. */
  overflow: {key: string; px: number}[]
  /** True once heights have been measured — pages are provisional before that. */
  measured: boolean
  /** Measured block heights, so callers never have to read the DOM themselves. */
  heights: Record<string, number>
}

/**
 * Measures each service block in a hidden layer at the real page width, then
 * packs whole blocks onto pages. A break may only fall BETWEEN blocks, so a
 * song set never straddles a page turn — see
 * docs/adr/0023-service-boundary-pagination.md.
 *
 * `forcedBreakAfter` holds the keys of blocks followed by an explicit page-break
 * Order Line. A block taller than a page gets a page to itself and is reported
 * in `overflow`, which is ADR 0021's warn-and-clip behaviour retained as the
 * floor case.
 */
export function usePagination(
  keys: string[],
  measureRef: RefObject<HTMLDivElement | null>,
  available: {first: number; rest: number},
  forcedBreakAfter: Set<string>,
  deps: unknown,
): PaginationResult {
  const [heights, setHeights] = useState<Record<string, number>>({})
  const [measured, setMeasured] = useState(false)

  const measure = useCallback(() => {
    const root = measureRef.current
    if (!root) return
    const next: Record<string, number> = {}
    root.querySelectorAll<HTMLElement>('[data-page-block]').forEach((el) => {
      const key = el.dataset.pageBlock
      if (key) next[key] = el.offsetHeight
    })
    setHeights(next)
    setMeasured(true)
  }, [measureRef])

  useLayoutEffect(() => {
    measure()
    // Fonts and images land after first paint and shift every height under the
    // packer, so remeasure when each settles rather than trusting pass one.
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
  }, [measure, measureRef, deps])

  const pages: string[][] = []
  const overflow: {key: string; px: number}[] = []
  let current: string[] = []
  let used = 0

  const limit = () => (pages.length === 0 ? available.first : available.rest)
  const flush = () => {
    if (current.length) pages.push(current)
    current = []
    used = 0
  }

  for (const key of keys) {
    const h = heights[key] ?? 0
    if (h > limit()) {
      flush()
      pages.push([key])
      overflow.push({key, px: Math.round(h - available.rest)})
      continue
    }
    if (current.length && used + h > limit()) flush()
    current.push(key)
    used += h
    if (forcedBreakAfter.has(key)) flush()
  }
  flush()
  if (!pages.length) pages.push([])

  return {pages, overflow, measured, heights}
}
