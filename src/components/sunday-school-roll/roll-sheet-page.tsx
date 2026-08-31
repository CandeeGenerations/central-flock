import {PrintPage, contentWidthPx} from '@/components/print/page-frame'
import {type Quarter, ROLL_ROW_COUNT, rollDateHeader, rollSheetTitle, rowsForPage} from '@/lib/sunday-school-roll-core'
import {forwardRef} from 'react'

// Landscape content box is 940px wide. The Name column takes 210 and the
// Sundays split the rest — 56px each at 13 columns, 52 at the worst-case 14,
// both wide enough for "Aug 16" at 9pt bold. See CONTEXT.md → Roll Sheet.
const NAME_COL_PX = 210
const ROW_HEIGHT_PX = 32
const HEADER_HEIGHT_PX = 28

const RULE = '1px solid #000'

interface RollSheetPageProps {
  titlePrefix: string
  year: number
  quarter: Quarter
  label: string
  scholars: string
  dates: string[]
  logoPath: string | null
  /** 0-based. Only ever non-zero when a roster outgrows ROLL_ROW_COUNT. */
  page?: number
  /** Row the editor is focused on, so the preview shows the caret's home. */
  activeRow?: number | null
  onRowClick?: (row: number) => void
}

/**
 * One printed landscape page of a Sunday School Roll. Logo and title carry no
 * border — only the grid is ruled. Pure render apart from the optional row
 * click, which the export path never passes (the ADR 0005 rule).
 */
export const RollSheetPage = forwardRef<HTMLDivElement, RollSheetPageProps>(function RollSheetPage(
  {titlePrefix, year, quarter, label, scholars, dates, logoPath, page = 0, activeRow = null, onRowClick},
  ref,
) {
  const rows = rowsForPage(scholars, page)
  const dateColPx = Math.floor((contentWidthPx('landscape') - NAME_COL_PX) / Math.max(1, dates.length))

  return (
    <PrintPage ref={ref} orientation="landscape">
      {logoPath ? (
        <div style={{textAlign: 'center', marginBottom: 6}}>
          <img
            src={logoPath}
            alt=""
            style={{maxHeight: 76, maxWidth: '100%', objectFit: 'contain', display: 'block', margin: '0 auto'}}
            crossOrigin="anonymous"
          />
        </div>
      ) : null}

      <div style={{textAlign: 'center', fontWeight: 700, fontSize: '13pt', lineHeight: 1.2, margin: '0 0 12px'}}>
        {rollSheetTitle(titlePrefix, year, quarter, label)}
      </div>

      <table style={{borderCollapse: 'collapse', tableLayout: 'fixed', width: '100%'}}>
        <colgroup>
          <col style={{width: NAME_COL_PX}} />
          {dates.map((d) => (
            <col key={d} style={{width: dateColPx}} />
          ))}
        </colgroup>
        <thead>
          <tr style={{height: HEADER_HEIGHT_PX}}>
            <th
              style={{
                border: RULE,
                textAlign: 'left',
                padding: '0 6px',
                fontSize: '10pt',
                fontWeight: 700,
              }}
            >
              Name
            </th>
            {dates.map((d) => (
              <th key={d} style={{border: RULE, fontSize: '9pt', fontWeight: 700, padding: 0}}>
                {rollDateHeader(d)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((name, i) => {
            const row = page * ROLL_ROW_COUNT + i
            return (
              <tr key={row} style={{height: ROW_HEIGHT_PX}}>
                <td
                  data-roll-row={row}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  style={{
                    border: RULE,
                    padding: '0 6px',
                    fontSize: '11pt',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    cursor: onRowClick ? 'text' : undefined,
                    backgroundColor: activeRow === row ? '#eef4ff' : undefined,
                  }}
                >
                  {name}
                </td>
                {dates.map((d) => (
                  <td key={d} style={{border: RULE}} />
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>
    </PrintPage>
  )
})
