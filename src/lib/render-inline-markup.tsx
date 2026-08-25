import {Fragment, type ReactNode} from 'react'

/**
 * Renders the inline markup the printed schedules use:
 *
 *   *bold*        -> <strong>
 *   __italic__    -> <em>
 *   _underline_   -> <u>
 *
 * Underline came first (the underlined "baptize" and "you" on Workers' Notes
 * page 1), which is why it owns the single underscore and italic takes the
 * double. Lone markers render literally. Bold and italic may contain the
 * others; underline is a leaf.
 *
 * Extracted from schedule-preview-frame.tsx when the Workers' Notes pages
 * needed the same markup for their bullet paragraphs.
 */
// Built fresh on every call: this function recurses into what it matches, and
// a shared /g regex would have the inner call rewind the outer one's lastIndex
// — which loops forever on the first nested marker.
const token = () => /__([^_]+)__|_([^_]+)_|\*([^*]+)\*/g

export function renderInline(text: string): ReactNode {
  const parts: ReactNode[] = []
  const regex = token()
  let last = 0
  let m: RegExpExecArray | null
  let key = 0

  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) parts.push(<Fragment key={key++}>{text.slice(last, m.index)}</Fragment>)
    const [italic, underline, bold] = [m[1], m[2], m[3]]
    if (italic !== undefined) parts.push(<em key={key++}>{renderInline(italic)}</em>)
    else if (underline !== undefined) parts.push(<u key={key++}>{underline}</u>)
    else parts.push(<strong key={key++}>{renderInline(bold)}</strong>)
    last = m.index + m[0].length
  }
  if (last < text.length) parts.push(<Fragment key={key}>{text.slice(last)}</Fragment>)
  return parts.length > 0 ? parts : text
}
