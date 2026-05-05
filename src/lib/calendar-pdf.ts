import html2canvas from 'html2canvas'
import {jsPDF} from 'jspdf'

export type CalendarExportFormat = 'pdf' | 'jpg'

export interface GenerateCalendarOptions {
  element: HTMLElement
  year: number
  month: number
  format: CalendarExportFormat
}

const MONTH_NAMES = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
]

function fileBaseName(year: number, month: number) {
  return `calendar-${year}-${String(month).padStart(2, '0')}-${MONTH_NAMES[month - 1]}`
}

export async function generateCalendarExport({element, year, month, format}: GenerateCalendarOptions): Promise<void> {
  const canvas = await html2canvas(element, {
    scale: 3,
    backgroundColor: '#ffffff',
    useCORS: true,
    logging: false,
  })

  const base = fileBaseName(year, month)

  if (format === 'jpg') {
    const dataUrl = canvas.toDataURL('image/jpeg', 0.95)
    const a = document.createElement('a')
    a.href = dataUrl
    a.download = `${base}.jpg`
    a.click()
    return
  }

  const imgData = canvas.toDataURL('image/png')
  const doc = new jsPDF({orientation: 'landscape', unit: 'pt', format: 'letter'})
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  doc.addImage(imgData, 'PNG', 0, 0, pageWidth, pageHeight)
  doc.save(`${base}.pdf`)
}
