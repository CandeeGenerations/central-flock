import {parseScheduleLine} from '@/components/calendar-print/calendar-grid'
import type {DraftItem} from '@/components/calendar-print/schedule-items-editor'

interface Props {
  items: DraftItem[]
}

function Column({lines}: {lines: {text: string; bold: boolean; spacer: boolean}[]}) {
  return (
    <div className="flex flex-col items-start text-left">
      {lines.map((line, i) => {
        if (line.spacer) return <div key={i} style={{height: '6px'}} />
        const text = line.bold && !/\*\*/.test(line.text) ? `**${line.text}**` : line.text
        return (
          <div
            key={i}
            style={{
              whiteSpace: 'normal',
              wordBreak: 'break-word',
              lineHeight: 1.3,
              fontFamily: 'Montserrat, sans-serif',
            }}
          >
            {parseScheduleLine(text).map((seg, j) => (
              <span key={j} style={{fontWeight: seg.bold || line.bold ? 700 : 500, fontSize: '10px'}}>
                {seg.text}
              </span>
            ))}
          </div>
        )
      })}
    </div>
  )
}

export function SchedulePreview({items}: Props) {
  const visible = items.filter((it) => !it.hidden)
  const col1 = visible
    .filter((it) => it.column !== 2)
    .map((it) => ({text: it.text, bold: it.bold, spacer: it.type === 'spacer'}))
  const col2 = visible
    .filter((it) => it.column === 2)
    .map((it) => ({text: it.text, bold: it.bold, spacer: it.type === 'spacer'}))
  return (
    <div className="rounded-md border bg-white text-black p-3">
      <div className="text-[11px] font-bold border-b border-black inline-block pb-0.5 mb-1">Normal Schedule:</div>
      <div className="grid grid-cols-2 gap-x-6">
        <Column lines={col1} />
        <Column lines={col2} />
      </div>
    </div>
  )
}
