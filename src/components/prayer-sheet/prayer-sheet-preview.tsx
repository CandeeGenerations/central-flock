import type {PrayerSheetEdition, PrayerSheetMinistryItem, PrayerSheetSettings, PrayerSheetSunday} from '@/lib/api'

// Half-sheet dimensions at 96 DPI (5.5" × 8.5")
export const HALF_SHEET_WIDTH = 528
export const HALF_SHEET_HEIGHT = 816

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

function formatSundayHeading(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  return `Sunday, ${MONTH_NAMES[d.getMonth()]} ${d.getDate()}`
}

function getDateRangeLabel(sundays: PrayerSheetSunday[]): string {
  if (sundays.length === 0) return ''
  const first = new Date(sundays[0].sundayDate + 'T12:00:00')
  const last = new Date(sundays[sundays.length - 1].sundayDate + 'T12:00:00')
  const firstLabel = `${MONTH_NAMES[first.getMonth()]} ${first.getFullYear()}`
  const lastLabel = `${MONTH_NAMES[last.getMonth()]} ${last.getFullYear()}`
  return firstLabel === lastLabel
    ? firstLabel
    : `${MONTH_NAMES[first.getMonth()]} – ${MONTH_NAMES[last.getMonth()]} ${last.getFullYear()}`
}

function splitSundays(
  sundays: PrayerSheetSunday[],
  columnSplit: number | null,
): [PrayerSheetSunday[], PrayerSheetSunday[]] {
  const splitAt = columnSplit != null ? columnSplit : Math.ceil(sundays.length / 2)
  return [sundays.slice(0, splitAt), sundays.slice(splitAt)]
}

interface SundayColumnProps {
  sundays: PrayerSheetSunday[]
  fontSize: number
}

const ENTRY_LINE_HEIGHT = 1.35
// Blank lines left between Sundays for requests written in by hand after printing.
const WRITE_IN_LINES = 2

function SundayColumn({sundays, fontSize}: SundayColumnProps) {
  const writeInSpace = Math.round((fontSize - 1) * ENTRY_LINE_HEIGHT * WRITE_IN_LINES)
  return (
    <div style={{flex: 1, minWidth: 0}}>
      {sundays.map((sunday, idx) => (
        <div key={sunday.id} style={{marginBottom: idx < sundays.length - 1 ? writeInSpace : 0}}>
          <div
            style={{
              fontWeight: 'bold',
              textDecoration: 'underline',
              fontSize: fontSize,
              marginBottom: 2,
              color: '#000',
            }}
          >
            {formatSundayHeading(sunday.sundayDate)}
          </div>
          {sunday.entries.map((entry) => (
            <div
              key={entry.id}
              style={{
                fontSize: fontSize - 1,
                lineHeight: ENTRY_LINE_HEIGHT,
                paddingLeft: 2,
                color: '#111',
              }}
            >
              {entry.text}
            </div>
          ))}
          {sunday.entries.length === 0 && (
            <div style={{fontSize: fontSize - 2, color: '#aaa', fontStyle: 'italic'}}>No entries yet</div>
          )}
        </div>
      ))}
    </div>
  )
}

interface PrayerSheetFrontProps {
  edition: PrayerSheetEdition
  settings: PrayerSheetSettings
}

export function PrayerSheetFront({edition, settings}: PrayerSheetFrontProps) {
  const color = edition.themeColor
  const [leftCol, rightCol] = splitSundays(edition.sundays, edition.columnSplit)
  const dateRange = getDateRangeLabel(edition.sundays)
  const fontSize = 12

  return (
    <div
      style={{
        width: HALF_SHEET_WIDTH,
        height: HALF_SHEET_HEIGHT,
        backgroundColor: '#fff',
        fontFamily: 'Georgia, serif',
        padding: '28px 32px 24px',
        boxSizing: 'border-box',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {/* Title */}
      <div
        style={{
          fontSize: 30,
          fontWeight: 'bold',
          color,
          textAlign: 'center',
          letterSpacing: '0.02em',
          lineHeight: 1.1,
          marginBottom: 6,
          fontFamily: 'Georgia, serif',
        }}
      >
        {settings.title}
      </div>

      {/* Scripture */}
      <div
        style={{
          fontSize: 16,
          fontStyle: 'italic',
          color: '#222',
          lineHeight: 1.45,
          marginBottom: 8,
          fontFamily: 'Georgia, serif',
        }}
      >
        {settings.scriptureText}
        <br />
        {settings.scriptureReference}
      </div>

      {/* Date range */}
      {dateRange && (
        <div
          style={{
            fontSize: 15,
            fontWeight: 'bold',
            color,
            textAlign: 'center',
            marginBottom: 12,
            fontFamily: 'Georgia, serif',
          }}
        >
          {dateRange}
        </div>
      )}

      {/* Two-column Sunday groupings */}
      <div style={{display: 'flex', gap: 20, alignItems: 'flex-start'}}>
        <SundayColumn sundays={leftCol} fontSize={fontSize} />
        <SundayColumn sundays={rightCol} fontSize={fontSize} />
      </div>
    </div>
  )
}

interface PrayerSheetBackProps {
  ministryItems: PrayerSheetMinistryItem[]
  themeColor: string
}

export function PrayerSheetBack({ministryItems, themeColor}: PrayerSheetBackProps) {
  return (
    <div
      style={{
        width: HALF_SHEET_WIDTH,
        height: HALF_SHEET_HEIGHT,
        backgroundColor: '#fff',
        fontFamily: 'Georgia, serif',
        padding: '28px 32px 24px',
        boxSizing: 'border-box',
        overflow: 'hidden',
        // Title + list are centered across the page as one block; lines stay left-aligned.
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
      }}
    >
      <div>
        {/* Title */}
        <div
          style={{
            fontSize: 20,
            fontWeight: 'bold',
            color: themeColor,
            textDecoration: 'underline',
            marginBottom: 12,
            fontFamily: 'Georgia, serif',
          }}
        >
          CBC Ministries:
        </div>

        {/* Ministry list */}
        <ul style={{margin: 0, padding: '0 0 0 18px', listStyleType: 'square'}}>
          {ministryItems.map((item) => (
            <li
              key={item.id}
              style={{
                fontSize: 11,
                lineHeight: 1.4,
                color: item.bold ? themeColor : '#111',
                fontWeight: item.bold ? 'bold' : 'normal',
                marginBottom: 1,
              }}
            >
              {item.text}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
