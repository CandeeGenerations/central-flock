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
  themePlacement: string | null
  versePlacement: string | null
  verseText: string | null
  verseReference: string | null
  normalScheduleText: string | null
  defaultSchedule: string
  events: CalendarPrintEvent[]
}

export const FOOTER_CENTER_PLACEMENT = 'footer-center'
export const FOOTER_LEFT_PLACEMENT = 'footer-left'
export const FOOTER_RIGHT_PLACEMENT = 'footer-right'
export const DEFAULT_PLACEMENT = FOOTER_CENTER_PLACEMENT

export function isFooterPlacement(id: string | null | undefined): boolean {
  return (
    id === FOOTER_CENTER_PLACEMENT || id === FOOTER_LEFT_PLACEMENT || id === FOOTER_RIGHT_PLACEMENT || id === 'footer'
  )
}

export function footerAlignment(id: string | null | undefined): 'left' | 'center' | 'right' {
  if (id === FOOTER_LEFT_PLACEMENT) return 'left'
  if (id === FOOTER_RIGHT_PLACEMENT) return 'right'
  return 'center'
}

export interface PlacementOption {
  id: string // 'footer-center' | 'footer-left' | 'cell:<w>-<c>'
  label: string
}

// Returns the list of placement options for a given month: the default footer variants
// plus every open out-of-month merged cell (excluding the cell that hosts the footer).
// The cell that hosts the month/year title gets a special "Under Month/Year" label.
export function getAvailablePlacements(year: number, month: number): PlacementOption[] {
  const layout = buildLayout(year, month)
  const renderRows = buildRenderRows(layout)
  const options: PlacementOption[] = [
    {id: FOOTER_CENTER_PLACEMENT, label: 'Default — centered text'},
    {id: FOOTER_LEFT_PLACEMENT, label: 'Default — left text'},
    {id: FOOTER_RIGHT_PLACEMENT, label: 'Default — right text'},
  ]

  // Identify which merged-out cell hosts the footer (if footerInTrailing)
  let footerCellId: string | null = null
  if (layout.footerInTrailing) {
    const lastRow = renderRows[layout.weeksNeeded - 1]
    const last = lastRow[lastRow.length - 1]
    if (last && last.type !== 'in_month') footerCellId = cellPlacementId(last)
  }

  // Identify the leading cell (if any) which may host the title
  const firstRow = renderRows[0]
  const leadingOut = firstRow[0]?.type === 'merged_out_leading' ? firstRow[0] : null
  const titleCellId = leadingOut !== null && leadingOut.span >= 2 ? cellPlacementId(leadingOut) : null

  for (const row of renderRows) {
    for (const rc of row) {
      if (rc.type === 'in_month') continue
      const id = cellPlacementId(rc)
      if (id === footerCellId) continue
      let label: string
      if (id === titleCellId) {
        label = 'Under Month / Year'
      } else {
        const first = rc.cells[0].date
        const last = rc.cells[rc.cells.length - 1].date
        label = rc.span === 1 ? formatShortDate(first) : `${formatShortDate(first)} – ${formatShortDate(last)}`
      }
      options.push({id, label})
    }
  }
  return options
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

function cellPlacementId(rc: RenderCell): string {
  return `cell:${rc.weekIndex}-${rc.colIndex}`
}

function formatShortDate(d: Date): string {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${months[d.getMonth()]} ${d.getDate()}`
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
  if (dayEvents.some((e) => e.style === 'no_kaya')) return false
  if (dayEvents.some((e) => e.suppressNormalSchedule)) return false
  return true
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

interface FooterContentExtraProps extends FooterContentProps {
  showThemeInFooter: boolean
  showVerseInFooter: boolean
  themeAlign: 'left' | 'center' | 'right'
  verseAlign: 'left' | 'center' | 'right'
}

function FooterContent({
  scheduleText,
  theme,
  verseText,
  verseReference,
  accentColor,
  showThemeInFooter,
  showVerseInFooter,
  themeAlign,
  verseAlign,
}: FooterContentExtraProps) {
  const {col1, col2} = splitScheduleColumns(scheduleText)
  const hasRightCol = (showThemeInFooter && theme) || (showVerseInFooter && (verseText || verseReference))
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        padding: '8px 12px',
        boxSizing: 'border-box',
        display: 'grid',
        gridTemplateColumns: hasRightCol ? 'auto auto 1fr' : 'auto auto 1fr',
        columnGap: '24px',
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
      {hasRightCol && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'stretch',
            fontFamily: '"DM Serif Display", serif',
            fontStyle: 'italic',
            color: accentColor,
            gap: '4px',
          }}
        >
          {showThemeInFooter && theme && (
            <div style={{fontSize: '14px', lineHeight: 1.2, whiteSpace: 'pre-wrap', textAlign: themeAlign}}>
              {theme}
            </div>
          )}
          {showVerseInFooter && verseText && (
            <div style={{fontSize: '12px', lineHeight: 1.3, whiteSpace: 'pre-wrap', textAlign: verseAlign}}>
              &ldquo;{verseText}&rdquo;
            </div>
          )}
          {showVerseInFooter && verseReference && (
            <div style={{fontSize: '12px', lineHeight: 1.3, whiteSpace: 'pre-wrap', textAlign: verseAlign}}>
              {verseReference}
            </div>
          )}
        </div>
      )}
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
    borderRight: isLastColInMonth ? 'none' : '1pt solid #000',
    borderBottom: isLastRowInMonth ? 'none' : '1pt solid #000',
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
  cellContent: ReactNode | null
  footerOverlay: ReactNode | null
  isLastRowInMonth: boolean
  isLastColInMonth: boolean
}

function MergedOutCell({rc, cellContent, footerOverlay, isLastRowInMonth, isLastColInMonth}: MergedOutCellProps) {
  const cellStyle: CSSProperties = {
    gridColumn: `span ${rc.span}`,
    borderRight: isLastColInMonth ? 'none' : '1pt solid #000',
    borderBottom: isLastRowInMonth ? 'none' : '1pt solid #000',
    overflow: 'hidden',
    fontFamily: 'Montserrat, sans-serif',
    color: '#000',
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
  }

  return (
    <div style={cellStyle}>
      {cellContent}
      {footerOverlay}
    </div>
  )
}

export function CalendarGrid({
  year,
  month,
  theme,
  themeColor,
  themePlacement,
  versePlacement,
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
  for (const cell of layout.cells) {
    if (!cell.isInMonth) continue
    const list = allEventsByIso.get(cell.iso)
    if (list) inMonthEventsByIso.set(cell.iso, list)
  }

  // Title placement
  const firstRow = renderRows[0]
  const leadingOut = firstRow[0]?.type === 'merged_out_leading' ? firstRow[0] : null
  const titleHorizontal = leadingOut !== null && leadingOut.span >= 3
  const titleStacked = leadingOut !== null && leadingOut.span === 2
  const titleAboveGrid = !titleHorizontal && !titleStacked

  const monthName = MONTH_NAMES[month - 1]

  // Resolve placements; null falls back to default.
  const effThemePlacement = themePlacement || DEFAULT_PLACEMENT
  const effVersePlacement = versePlacement || DEFAULT_PLACEMENT

  // Footer placement
  const scheduleText = (normalScheduleText && normalScheduleText.trim()) || defaultSchedule
  const footerNode = (
    <FooterContent
      scheduleText={scheduleText}
      theme={theme}
      verseText={verseText}
      verseReference={verseReference}
      accentColor={accentColor}
      showThemeInFooter={isFooterPlacement(effThemePlacement)}
      showVerseInFooter={isFooterPlacement(effVersePlacement)}
      themeAlign={footerAlignment(effThemePlacement)}
      verseAlign={footerAlignment(effVersePlacement)}
    />
  )
  const footerWrapper = <div style={{position: 'absolute', inset: 0, zIndex: 2, display: 'flex'}}>{footerNode}</div>

  const titleHorizontalInline = (
    <div
      style={{
        fontFamily: '"DM Serif Display", serif',
        fontSize: '52px',
        lineHeight: 1.25,
        fontWeight: 400,
        fontStyle: 'italic',
        textAlign: 'center',
        color: accentColor,
      }}
    >
      {`${monthName} ${year}`}
    </div>
  )

  const titleStackedInline = (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        fontFamily: '"DM Serif Display", serif',
        lineHeight: 1.2,
        fontWeight: 400,
        fontStyle: 'italic',
        color: accentColor,
        textAlign: 'center',
      }}
    >
      <div style={{fontSize: '34px'}}>{monthName}</div>
      <div style={{fontSize: '34px'}}>{year}</div>
    </div>
  )

  const themeNode = theme ? (
    <div
      style={{
        fontFamily: '"DM Serif Display", serif',
        fontStyle: 'italic',
        fontSize: '14px',
        lineHeight: 1.25,
        color: accentColor,
        textAlign: 'center',
        whiteSpace: 'pre-wrap',
        padding: '0 8px',
      }}
    >
      {theme}
    </div>
  ) : null

  const verseNode =
    verseText || verseReference ? (
      <div
        style={{
          fontFamily: '"DM Serif Display", serif',
          fontStyle: 'italic',
          fontSize: '12px',
          lineHeight: 1.3,
          color: accentColor,
          textAlign: 'center',
          padding: '0 8px',
          display: 'flex',
          flexDirection: 'column',
          gap: '2px',
        }}
      >
        {verseText && <div style={{whiteSpace: 'pre-wrap'}}>&ldquo;{verseText}&rdquo;</div>}
        {verseReference && <div style={{whiteSpace: 'pre-wrap'}}>{verseReference}</div>}
      </div>
    ) : null

  // For each merged_out cell, pre-compute whether it hosts the title and/or theme/verse content.
  const buildCellContent = (rc: RenderCell): ReactNode | null => {
    const id = cellPlacementId(rc)
    const isLeading = rc.weekIndex === 0 && rc.colIndex === 0
    const titleHere = isLeading && (titleHorizontal || titleStacked)
    const themeHere = effThemePlacement === id && !!themeNode
    const verseHere = effVersePlacement === id && !!verseNode
    if (!titleHere && !themeHere && !verseHere) return null
    return (
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
          padding: '8px',
          zIndex: 1,
          pointerEvents: 'none',
          textAlign: 'center',
        }}
      >
        {titleHere && (titleStacked ? titleStackedInline : titleHorizontalInline)}
        {themeHere && themeNode}
        {verseHere && verseNode}
      </div>
    )
  }

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
        border: '2pt solid #000',
        borderRadius: '12px',
        overflow: 'hidden',
        flex: 1,
        display: 'grid',
        gridTemplateColumns: 'repeat(7, 1fr)',
        gridTemplateRows: layout.footerInTrailing
          ? `repeat(${totalRowsRendered}, 1fr)`
          : `repeat(${layout.weeksNeeded}, 1fr) auto`,
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
          const cellKey = `${rc.weekIndex}-${rc.colIndex}-out`
          const footerHere = trailingFooterCellKey === cellKey ? footerWrapper : null
          const content = footerHere ? null : buildCellContent(rc)
          return (
            <MergedOutCell
              key={cellKey}
              rc={rc}
              cellContent={content}
              footerOverlay={footerHere}
              isLastRowInMonth={isLastRendered}
              isLastColInMonth={lastCol}
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
            fontWeight: 400,
            fontStyle: 'italic',
            lineHeight: 1.25,
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
