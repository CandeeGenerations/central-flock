import {Fragment, type ReactNode} from 'react'

/**
 * Renders text with _underscore pairs_ converted into <u>underlines</u>.
 * Lone underscores render literally. No nesting.
 *
 * Extracted from schedule-preview-frame.tsx when the Workers' Notes pages
 * needed the same markup for their bullet paragraphs (the underlined
 * "baptize" and "you" on page 1).
 */
export function renderWithUnderlines(text: string): ReactNode {
  const parts: ReactNode[] = []
  const regex = /_([^_]+)_/g
  let last = 0
  let m: RegExpExecArray | null
  let key = 0
  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) parts.push(<Fragment key={key++}>{text.slice(last, m.index)}</Fragment>)
    parts.push(<u key={key++}>{m[1]}</u>)
    last = m.index + m[0].length
  }
  if (last < text.length) parts.push(<Fragment key={key}>{text.slice(last)}</Fragment>)
  return parts.length > 0 ? parts : text
}
