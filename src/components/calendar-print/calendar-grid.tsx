import type {CalendarPrintEvent} from '@/lib/api'
import type {CSSProperties, ReactNode} from 'react'

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

const HIGHLIGHT_PINK = '#e0144f'
const DEFAULT_ACCENT = '#1e293b' // slate-800; used when no theme color set
const NEUTRAL_DEFAULT_GRAY = '#6b7280'

// Letter landscape at ~96 DPI (matches jsPDF point conversion when scaled)
export const PAGE_WIDTH = 1056
export const PAGE_HEIGHT = 816

interface CalendarGridProps {
  year: number
  month: number // 1-12
  theme: string | null
  themeColor: string | null
  verseText: string | null
  verseReference: string | null
  normalScheduleText: string | null
  defaultSchedule: string
  events: CalendarPrintEvent[]
}

interface CellMeta {
  date: Date
  iso: string
  dayOfMonth: number
  isInMonth: boolean
  weekIndex: number
  colIndex: number
  dayOfWeek: number
}

function toIso(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

interface GridLayout {
  cells: CellMeta[] // includes ALL rendered cells (in-month + leading/trailing out-of-month for in-month rows)
  weeksNeeded: number // number of in-month rows
  leadingBlanks: number // 0..6
  trailingBlanks: number // 0..6 (in last in-month row)
  footerInTrailing: boolean // true ⇒ footer goes in the trailing merged area of last in-month row
  totalRows: number // weeksNeeded or weeksNeeded + 1
}

function buildLayout(year: number, month: number): GridLayout {
  const firstOfMonth = new Date(year, month - 1, 1)
  const leadingBlanks = firstOfMonth.getDay() // 0..6
  const daysInMonth = new Date(year, month, 0).getDate()
  const totalInMonthCells = leadingBlanks + daysInMonth
  const weeksNeeded = Math.ceil(totalInMonthCells / 7)
  const trailingBlanks = weeksNeeded * 7 - totalInMonthCells

  // If we have at least 4 trailing cells in the last row, fit the footer in them.
  // Otherwise append an extra row dedicated to the footer.
  const footerInTrailing = trailingBlanks >= 4
  const totalRows = footerInTrailing ? weeksNeeded : weeksNeeded + 1

  const gridStart = new Date(year, month - 1, 1 - leadingBlanks)
  const cells: CellMeta[] = []
  for (let i = 0; i < weeksNeeded * 7; i++) {
    const date = new Date(gridStart)
    date.setDate(gridStart.getDate() + i)
    const inMonth = date.getMonth() === month - 1 && date.getFullYear() === year
    cells.push({
      date,
      iso: toIso(date),
      dayOfMonth: date.getDate(),
      isInMonth: inMonth,
      weekIndex: Math.floor(i / 7),
      colIndex: i % 7,
      dayOfWeek: date.getDay(),
    })
  }
  return {cells, weeksNeeded, leadingBlanks, trailingBlanks, footerInTrailing, totalRows}
}

interface RenderCell {
  type: 'in_month' | 'merged_out_leading' | 'merged_out_trailing'
  weekIndex: number
  colIndex: number
  span: number
  cells: CellMeta[]
}

function buildRenderRows(layout: GridLayout): RenderCell[][] {
  const {cells, weeksNeeded} = layout
  const weeks: CellMeta[][] = []
  for (let w = 0; w < weeksNeeded; w++) {
    weeks.push(cells.filter((c) => c.weekIndex === w))
  }

  return weeks.map((week, weekIndex) => {
    const rendered: RenderCell[] = []
    let i = 0
    while (i < week.length) {
      const cell = week[i]
      if (cell.isInMonth) {
        rendered.push({
          type: 'in_month',
          weekIndex: cell.weekIndex,
          colIndex: cell.colIndex,
          span: 1,
          cells: [cell],
        })
        i++
      } else {
        const run: CellMeta[] = []
        while (i < week.length && !week[i].isInMonth) {
          run.push(week[i])
          i++
        }
        const isLeading = run[0].colIndex === 0
        const isLastWeek = weekIndex === weeksNeeded - 1
        rendered.push({
          type: isLeading && !isLastWeek ? 'merged_out_leading' : 'merged_out_trailing',
          weekIndex: run[0].weekIndex,
          colIndex: run[0].colIndex,
          span: run.length,
          cells: run,
        })
      }
    }
    return rendered
  })
}

function eventsByIso(events: CalendarPrintEvent[]): Map<string, CalendarPrintEvent[]> {
  const map = new Map<string, CalendarPrintEvent[]>()
  for (const e of events) {
    const list = map.get(e.date) ?? []
    list.push(e)
    map.set(e.date, list)
  }
  for (const [k, list] of map) {
    list.sort((a, b) => {
      const order = (s: string) => (s === 'bold' ? 0 : s === 'regular' ? 1 : 2)
      const o = order(a.style) - order(b.style)
      if (o !== 0) return o
      return a.sortOrder - b.sortOrder
    })
    map.set(k, list)
  }
  return map
}

function shouldShowNormalScheduleLabel(dayOfWeek: number, dayEvents: CalendarPrintEvent[]): boolean {
  if (dayOfWeek !== 0 && dayOfWeek !== 3 && dayOfWeek !== 6) return false
  return !dayEvents.some((e) => e.style === 'no_kaya')
}

function cellIsHighlighted(dayEvents: CalendarPrintEvent[]): boolean {
  return dayEvents.some((e) => e.style === 'bold' || e.style === 'no_kaya')
}

function cellHasNoKaya(dayEvents: CalendarPrintEvent[]): boolean {
  return dayEvents.some((e) => e.style === 'no_kaya')
}

interface ScheduleSegment {
  text: string
  bold: boolean
}

function parseScheduleLine(line: string): ScheduleSegment[] {
  const segments: ScheduleSegment[] = []
  const regex = /\*\*([^*]+)\*\*/g
  let lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = regex.exec(line)) !== null) {
    if (match.index > lastIndex) {
      segments.push({text: line.slice(lastIndex, match.index), bold: false})
    }
    segments.push({text: match[1], bold: true})
    lastIndex = regex.lastIndex
  }
  if (lastIndex < line.length) {
    segments.push({text: line.slice(lastIndex), bold: false})
  }
  return segments
}

// Split schedule text by a `---` line (3+ dashes) into [col1, col2].
// If no separator, everything is col1 and col2 is empty.
function splitScheduleColumns(text: string): {col1: string[]; col2: string[]} {
  const lines = text.split('\n')
  const sepIndex = lines.findIndex((l) => /^-{3,}\s*$/.test(l.trim()))
  if (sepIndex === -1) return {col1: lines, col2: []}
  return {col1: lines.slice(0, sepIndex), col2: lines.slice(sepIndex + 1)}
}

interface ScheduleColumnProps {
  lines: string[]
}

function ScheduleColumn({lines}: ScheduleColumnProps) {
  return (
    <div style={{display: 'flex', flexDirection: 'column', textAlign: 'left', alignItems: 'flex-start'}}>
      {lines.map((line, i) => {
        const trimmed = line.trim()
        if (!trimmed) {
          return <div key={i} style={{height: '6px'}} />
        }
        return (
          <div key={i} style={{whiteSpace: 'nowrap', lineHeight: 1.3, textAlign: 'left'}}>
            {parseScheduleLine(line).map((seg, j) => (
              <span key={j} style={{fontWeight: seg.bold ? 700 : 500}}>
                {seg.text}
              </span>
            ))}
          </div>
        )
      })}
    </div>
  )
}

interface FooterContentProps {
  scheduleText: string
  theme: string | null
  verseText: string | null
  verseReference: string | null
  accentColor: string
}

function FooterContent({scheduleText, theme, verseText, verseReference, accentColor}: FooterContentProps) {
  const {col1, col2} = splitScheduleColumns(scheduleText)
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        padding: '8px 12px',
        boxSizing: 'border-box',
        display: 'grid',
        gridTemplateColumns: '1fr 1.2fr 1.4fr',
        columnGap: '16px',
        fontFamily: 'Montserrat, sans-serif',
        fontSize: '10px',
        color: '#000',
      }}
    >
      <div style={{textAlign: 'left'}}>
        <div
          style={{
            fontWeight: 700,
            fontSize: '11px',
            marginBottom: '4px',
            display: 'inline-block',
            borderBottom: '1.5px solid #000',
            paddingBottom: '1px',
          }}
        >
          Normal Schedule:
        </div>
        <ScheduleColumn lines={col1} />
      </div>
      <div style={{paddingTop: '20px', textAlign: 'left'}}>
        <ScheduleColumn lines={col2} />
      </div>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'flex-end',
          textAlign: 'right',
          fontFamily: '"DM Serif Display", serif',
          fontStyle: 'italic',
          color: accentColor,
          gap: '4px',
        }}
      >
        {theme && <div style={{fontSize: '14px', lineHeight: 1.2, whiteSpace: 'pre-wrap'}}>{theme}</div>}
        {verseText && (
          <div style={{fontSize: '12px', lineHeight: 1.3, whiteSpace: 'pre-wrap'}}>&ldquo;{verseText}&rdquo;</div>
        )}
        {verseReference && (
          <div style={{fontSize: '12px', lineHeight: 1.3, whiteSpace: 'pre-wrap'}}>{verseReference}</div>
        )}
      </div>
    </div>
  )
}

interface InMonthCellProps {
  cell: CellMeta
  dayEvents: CalendarPrintEvent[]
  showNormalSchedule: boolean
  isLastRowInMonth: boolean
  isLastColInMonth: boolean
}

function InMonthCell({cell, dayEvents, showNormalSchedule, isLastRowInMonth, isLastColInMonth}: InMonthCellProps) {
  const highlight = cellIsHighlighted(dayEvents)
  const hasNoKaya = cellHasNoKaya(dayEvents)
  const cellTextColor = highlight ? HIGHLIGHT_PINK : '#000'

  const cellStyle: CSSProperties = {
    borderRight: isLastColInMonth ? 'none' : '2pt solid #000',
    borderBottom: isLastRowInMonth ? 'none' : '2pt solid #000',
    padding: '6px 8px',
    minHeight: 0,
    overflow: 'hidden',
    fontFamily: 'Montserrat, sans-serif',
    color: cellTextColor,
    display: 'flex',
    flexDirection: 'column',
  }

  // All events render in the center. no_kaya is styled like bold; the fixed
  // "NO KAYA or Choir" indicator sits at the bottom whenever the cell has any
  // no_kaya event.
  const titledEvents = dayEvents.filter((e) => e.title.trim().length > 0)

  return (
    <div style={cellStyle}>
      <div
        style={{
          fontWeight: 700,
          fontSize: '14px',
          lineHeight: 1,
          marginBottom: '2px',
          textAlign: 'left',
        }}
      >
        {cell.dayOfMonth}
      </div>
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '2px',
          textAlign: 'center',
          minHeight: 0,
        }}
      >
        {titledEvents.map((event) => {
          const boldLike = event.style === 'bold' || event.style === 'no_kaya'
          return (
            <div
              key={event.id}
              style={{
                fontWeight: boldLike ? 700 : 500,
                fontSize: boldLike ? '12px' : '11px',
                lineHeight: 1.2,
                color: boldLike || highlight ? HIGHLIGHT_PINK : '#000',
                whiteSpace: 'pre-wrap',
              }}
            >
              {event.title}
            </div>
          )
        })}
      </div>
      {(showNormalSchedule || hasNoKaya) && (
        <div
          style={{
            marginTop: 'auto',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
          }}
        >
          {showNormalSchedule && (
            <div
              style={{
                fontWeight: 500,
                fontStyle: 'italic',
                fontSize: '11px',
                lineHeight: 1.15,
                color: highlight ? HIGHLIGHT_PINK : NEUTRAL_DEFAULT_GRAY,
              }}
            >
              Normal Schedule
            </div>
          )}
          {hasNoKaya && (
            <div
              style={{
                fontWeight: 700,
                fontStyle: 'italic',
                fontSize: '11px',
                lineHeight: 1.15,
                color: HIGHLIGHT_PINK,
              }}
            >
              NO KAYA or Choir
            </div>
          )}
        </div>
      )}
    </div>
  )
}

interface MergedOutCellProps {
  rc: RenderCell
  outOfMonthEventsByIso: Map<string, CalendarPrintEvent[]>
  monthYearOverlay: ReactNode | null
  footerOverlay: ReactNode | null
  isLastRowInMonth: boolean
  isLastColInMonth: boolean
  hideEvents?: boolean
}

function MergedOutCell({
  rc,
  outOfMonthEventsByIso,
  monthYearOverlay,
  footerOverlay,
  isLastRowInMonth,
  isLastColInMonth,
  hideEvents = false,
}: MergedOutCellProps) {
  const allEvents = hideEvents ? [] : rc.cells.flatMap((c) => outOfMonthEventsByIso.get(c.iso) ?? [])

  const cellStyle: CSSProperties = {
    gridColumn: `span ${rc.span}`,
    borderRight: isLastColInMonth ? 'none' : '2pt solid #000',
    borderBottom: isLastRowInMonth ? 'none' : '2pt solid #000',
    overflow: 'hidden',
    fontFamily: 'Montserrat, sans-serif',
    color: '#000',
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
  }

  return (
    <div style={cellStyle}>
      {monthYearOverlay}
      {footerOverlay}
      {allEvents.length > 0 && !footerOverlay && (
        <div
          style={{
            position: 'relative',
            zIndex: 2,
            display: 'flex',
            flexDirection: 'column',
            gap: '2px',
            marginTop: 'auto',
            alignItems: 'flex-end',
            textAlign: 'right',
            padding: '6px 8px',
          }}
        >
          {allEvents.map((event) => (
            <div
              key={event.id}
              style={{
                fontWeight: event.style === 'bold' || event.style === 'no_kaya' ? 700 : 500,
                fontStyle: event.style === 'no_kaya' ? 'italic' : 'normal',
                fontSize: '11px',
                lineHeight: 1.15,
                color: event.style === 'bold' || event.style === 'no_kaya' ? HIGHLIGHT_PINK : '#000',
                whiteSpace: 'pre-wrap',
              }}
            >
              <span style={{fontWeight: 500, color: '#999', marginRight: '4px'}}>
                {event.date.slice(5).replace('-', '/')}
              </span>
              {event.title}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function CalendarGrid({
  year,
  month,
  theme,
  themeColor,
  verseText,
  verseReference,
  normalScheduleText,
  defaultSchedule,
  events,
}: CalendarGridProps) {
  const accentColor = themeColor || DEFAULT_ACCENT

  const layout = buildLayout(year, month)
  const renderRows = buildRenderRows(layout)
  const allEventsByIso = eventsByIso(events)

  const inMonthEventsByIso = new Map<string, CalendarPrintEvent[]>()
  const outOfMonthEventsByIso = new Map<string, CalendarPrintEvent[]>()
  for (const cell of layout.cells) {
    const list = allEventsByIso.get(cell.iso)
    if (!list) continue
    if (cell.isInMonth) inMonthEventsByIso.set(cell.iso, list)
    else outOfMonthEventsByIso.set(cell.iso, list)
  }

  // Title placement
  const firstRow = renderRows[0]
  const leadingOut = firstRow[0]?.type === 'merged_out_leading' ? firstRow[0] : null
  const titleHorizontal = leadingOut !== null && leadingOut.span >= 3
  const titleStacked = leadingOut !== null && leadingOut.span === 2
  const titleAboveGrid = !titleHorizontal && !titleStacked

  const monthName = MONTH_NAMES[month - 1]

  const titleOverlayHorizontal = (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: '"DM Serif Display", serif',
        fontSize: '52px',
        lineHeight: 1,
        fontWeight: 700,
        fontStyle: 'italic',
        color: accentColor,
        zIndex: 1,
        pointerEvents: 'none',
        textAlign: 'center',
      }}
    >
      {`${monthName} ${year}`}
    </div>
  )

  const titleOverlayStacked = (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        fontFamily: '"DM Serif Display", serif',
        lineHeight: 1.05,
        fontWeight: 700,
        fontStyle: 'italic',
        color: accentColor,
        zIndex: 1,
        pointerEvents: 'none',
        textAlign: 'center',
      }}
    >
      <div style={{fontSize: '34px'}}>{monthName}</div>
      <div style={{fontSize: '34px'}}>{year}</div>
    </div>
  )

  // Footer placement
  const scheduleText = (normalScheduleText && normalScheduleText.trim()) || defaultSchedule
  const footerNode = (
    <FooterContent
      scheduleText={scheduleText}
      theme={theme}
      verseText={verseText}
      verseReference={verseReference}
      accentColor={accentColor}
    />
  )
  const footerWrapper = <div style={{position: 'absolute', inset: 0, zIndex: 2, display: 'flex'}}>{footerNode}</div>

  const isCellLastCol = (rc: RenderCell) => rc.colIndex + rc.span - 1 === 6
  const lastInMonthRowIndex = layout.weeksNeeded - 1
  const totalRowsRendered = layout.totalRows
  const lastRenderedRowIndex = totalRowsRendered - 1

  const dayNameRow = (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(7, 1fr)',
        marginBottom: '6px',
      }}
    >
      {DAY_NAMES.map((name) => (
        <div
          key={name}
          style={{
            fontFamily: '"DM Serif Display", serif',
            fontSize: '20px',
            color: accentColor,
            textAlign: 'center',
            paddingBottom: '4px',
          }}
        >
          {name}
        </div>
      ))}
    </div>
  )

  // Identify which trailing cell of the last in-month row hosts the footer (if footerInTrailing)
  let trailingFooterCellKey: string | null = null
  if (layout.footerInTrailing) {
    const lastInMonthRow = renderRows[lastInMonthRowIndex]
    const lastCell = lastInMonthRow[lastInMonthRow.length - 1]
    if (lastCell.type === 'merged_out_trailing') {
      trailingFooterCellKey = `${lastCell.weekIndex}-${lastCell.colIndex}-out`
    }
  }

  const grid = (
    <div
      style={{
        border: '4pt solid #000',
        borderRadius: '12px',
        overflow: 'hidden',
        flex: 1,
        display: 'grid',
        gridTemplateColumns: 'repeat(7, 1fr)',
        gridTemplateRows: `repeat(${totalRowsRendered}, 1fr)`,
      }}
    >
      {renderRows.map((row) =>
        row.map((rc) => {
          const lastCol = isCellLastCol(rc)
          const isLastRendered = rc.weekIndex === lastRenderedRowIndex
          if (rc.type === 'in_month') {
            const cell = rc.cells[0]
            const dayEvents = inMonthEventsByIso.get(cell.iso) ?? []
            const showNormal = shouldShowNormalScheduleLabel(cell.dayOfWeek, dayEvents)
            return (
              <InMonthCell
                key={`${rc.weekIndex}-${rc.colIndex}`}
                cell={cell}
                dayEvents={dayEvents}
                showNormalSchedule={showNormal}
                isLastRowInMonth={isLastRendered}
                isLastColInMonth={lastCol}
              />
            )
          }
          const isLeadingOut = rc.weekIndex === 0 && rc.colIndex === 0
          const overlay = isLeadingOut
            ? titleHorizontal
              ? titleOverlayHorizontal
              : titleStacked
                ? titleOverlayStacked
                : null
            : null
          const cellKey = `${rc.weekIndex}-${rc.colIndex}-out`
          const footerHere = trailingFooterCellKey === cellKey ? footerWrapper : null
          return (
            <MergedOutCell
              key={cellKey}
              rc={rc}
              outOfMonthEventsByIso={outOfMonthEventsByIso}
              monthYearOverlay={overlay}
              footerOverlay={footerHere}
              isLastRowInMonth={isLastRendered}
              isLastColInMonth={lastCol}
              hideEvents={!!footerHere}
            />
          )
        }),
      )}
      {/* Extra footer row, if needed */}
      {!layout.footerInTrailing && (
        <div
          style={{
            gridColumn: 'span 7',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          {footerNode}
        </div>
      )}
    </div>
  )

  return (
    <div
      style={{
        width: `${PAGE_WIDTH}px`,
        height: `${PAGE_HEIGHT}px`,
        backgroundColor: '#fff',
        padding: '36px 48px',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        color: '#000',
      }}
    >
      {titleAboveGrid && (
        <div
          style={{
            fontFamily: '"DM Serif Display", serif',
            fontSize: '40px',
            fontWeight: 700,
            fontStyle: 'italic',
            lineHeight: 1,
            color: accentColor,
            marginBottom: '8px',
            textAlign: 'center',
          }}
        >
          {monthName} {year}
        </div>
      )}

      {dayNameRow}

      {grid}
    </div>
  )
}
