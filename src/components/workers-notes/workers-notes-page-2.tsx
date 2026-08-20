import type {WorkersNotesMonth} from '@/lib/workers-notes-api'
import {
  MONTH_NAMES,
  type ResolvedLessonRow,
  type WorkersNotesTerm,
  hymnRefLabel,
  lessonRowDateLabel,
  termRangeLabel,
} from '@/lib/workers-notes-core'
import {forwardRef} from 'react'

import {TitleBox, WorkersNotesPage} from './page-frame'

interface Page2Props {
  year: number
  term: WorkersNotesTerm
  months: WorkersNotesMonth[]
  lessonRows: ResolvedLessonRow[]
}

const LABEL_COL = 62
const ROW_FONT = '11pt'

/** "The Family of God (B-23)" — override wins, hymn supplies the reference. */
function songLine(m: WorkersNotesMonth): string {
  const title = m.songTitleOverride?.trim() || m.hymnTitle || ''
  const ref = m.hymnBook && m.hymnNumber != null ? ` ${hymnRefLabel(m.hymnBook, m.hymnNumber)}` : ''
  return `${title}${ref}`.trim()
}

export const WorkersNotesPage2 = forwardRef<HTMLDivElement, Page2Props>(function WorkersNotesPage2(
  {year, term, months, lessonRows},
  ref,
) {
  // A blank line between months, exactly as printed. Derived at render time.
  const monthOf = (row: ResolvedLessonRow) => (row.date ? Number(row.date.slice(5, 7)) : null)
  let lastMonth: number | null = null

  return (
    <WorkersNotesPage ref={ref}>
      <TitleBox fontSize={13}>Songs, Mottos, and Verses of the Month &ndash; {year}</TitleBox>

      <div style={{margin: '18px 0 24px'}}>
        {months.map((m) => (
          <div key={m.month} style={{display: 'grid', gridTemplateColumns: '120px 1fr', marginBottom: 16}}>
            <div style={{fontSize: ROW_FONT, fontWeight: 700}}>{MONTH_NAMES[m.month - 1].toUpperCase()}</div>
            <div style={{fontSize: ROW_FONT, lineHeight: 1.45}}>
              <div style={{display: 'grid', gridTemplateColumns: `${LABEL_COL}px 1fr`}}>
                <span>Song:</span>
                <span>{songLine(m)}</span>
              </div>
              <div style={{display: 'grid', gridTemplateColumns: `${LABEL_COL}px 1fr`}}>
                <span>Motto:</span>
                <span>{m.motto}</span>
              </div>
              <div style={{display: 'grid', gridTemplateColumns: `${LABEL_COL}px 1fr`}}>
                <span>Verse:</span>
                <span>{m.verse}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      <TitleBox fontSize={13}>Betty Lukens Lessons for {termRangeLabel(year, term)}</TitleBox>

      <table style={{width: '100%', borderCollapse: 'collapse', marginTop: 16, fontSize: ROW_FONT}}>
        <thead>
          <tr>
            <th style={{width: 110, textAlign: 'left', borderBottom: '1px solid #000', paddingBottom: 2}}>Date</th>
            <th style={{width: 80, textAlign: 'left', borderBottom: '1px solid #000', paddingBottom: 2}}>Lesson</th>
            <th style={{textAlign: 'left', borderBottom: '1px solid #000', paddingBottom: 2}}>Points to Emphasize</th>
          </tr>
        </thead>
        <tbody>
          {lessonRows.map((row, i) => {
            const month = monthOf(row)
            const gap = month !== null && lastMonth !== null && month !== lastMonth
            if (month !== null) lastMonth = month

            if (row.kind === 'note') {
              return (
                <tr key={i}>
                  <td colSpan={3} style={{textAlign: 'center', fontStyle: 'italic', padding: '4px 0'}}>
                    {row.text}
                  </td>
                </tr>
              )
            }
            return (
              <tr key={i}>
                <td style={{paddingTop: gap ? 12 : 2, whiteSpace: 'pre'}}>
                  {row.date ? lessonRowDateLabel(row.date) : ''}
                </td>
                {row.kind === 'combined' ? (
                  <td colSpan={2} style={{paddingTop: gap ? 12 : 2, fontStyle: 'italic'}}>
                    {row.text}
                  </td>
                ) : (
                  <>
                    <td style={{paddingTop: gap ? 12 : 2}}>{row.lessonLabel}</td>
                    <td style={{paddingTop: gap ? 12 : 2}}>{row.text}</td>
                  </>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
    </WorkersNotesPage>
  )
})
