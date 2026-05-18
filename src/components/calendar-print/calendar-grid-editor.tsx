import {CalendarGrid} from '@/components/calendar-print/calendar-grid'
import type {ComponentProps} from 'react'

// Visible editor wrapper around CalendarGrid. Forwards onCellClick so in-month
// cells become tappable. The hidden capture target mounts CalendarGrid directly
// without onCellClick so editor chrome (cursor pointer) never reaches export.
export function CalendarGridEditor(props: ComponentProps<typeof CalendarGrid>) {
  return <CalendarGrid {...props} />
}
