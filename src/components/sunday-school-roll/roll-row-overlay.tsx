import {useCallback, useEffect, useLayoutEffect, useRef, useState} from 'react'

interface Box {
  row: number
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
 * Borderless inputs laid exactly over the Name cells of a rendered Roll Sheet,
 * so the sheet is edited where it is read — the spreadsheet these replace.
 * Lives in a wrapper: the page component stays pure render and nothing here
 * reaches the PDF (ADR 0005).
 *
 * Enter and the arrow keys walk the column; Enter on the last row of a page
 * falls through to the next, which is how a roster grows past the grid.
 */
export function RollRowOverlay({
  pageRef,
  rows,
  onChange,
  focusRow,
  onFocusRow,
  deps,
}: {
  pageRef: React.RefObject<HTMLDivElement | null>
  /** Row index -> current text, for the rows this page shows. */
  rows: Record<number, string>
  onChange: (row: number, value: string) => void
  focusRow: number | null
  onFocusRow: (row: number | null) => void
  /** Changing this remeasures — pass whatever drives the page's layout. */
  deps: unknown
}) {
  const [boxes, setBoxes] = useState<Box[]>([])
  const inputs = useRef(new Map<number, HTMLInputElement>())

  const measure = useCallback(() => {
    const root = pageRef.current
    if (!root) return
    const found: Box[] = []
    root.querySelectorAll<HTMLElement>('[data-roll-row]').forEach((el) => {
      const row = Number(el.dataset.rollRow)
      if (!Number.isInteger(row)) return
      const offset = offsetWithin(el, root)
      if (!offset) return
      found.push({row, top: offset.top, left: offset.left, width: el.offsetWidth, height: el.offsetHeight})
    })
    setBoxes(found)
  }, [pageRef])

  useLayoutEffect(measure, [measure, deps])

  useEffect(() => {
    const root = pageRef.current
    if (!root) return
    const observer = new ResizeObserver(measure)
    observer.observe(root)
    return () => observer.disconnect()
  }, [measure, pageRef])

  useEffect(() => {
    if (focusRow == null) return
    inputs.current.get(focusRow)?.focus()
  }, [focusRow, boxes])

  return (
    <div className="pointer-events-none absolute inset-0">
      {boxes.map((b) => (
        <input
          key={b.row}
          ref={(el) => {
            if (el) inputs.current.set(b.row, el)
            else inputs.current.delete(b.row)
          }}
          value={rows[b.row] ?? ''}
          onChange={(e) => onChange(b.row, e.target.value)}
          onFocus={() => onFocusRow(b.row)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === 'ArrowDown') {
              e.preventDefault()
              onFocusRow(b.row + 1)
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              if (b.row > 0) onFocusRow(b.row - 1)
            }
          }}
          className="pointer-events-auto absolute border-0 bg-transparent outline-none focus:bg-blue-50"
          style={{
            top: b.top,
            left: b.left,
            width: b.width,
            height: b.height,
            padding: '0 6px',
            // Matches the cell it covers, so typing looks like the print.
            fontSize: '11pt',
            fontFamily: 'Arial, Helvetica, sans-serif',
            color: '#000',
          }}
        />
      ))}
    </div>
  )
}
