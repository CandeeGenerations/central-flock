import {saveExportedDataUrl, saveExportedFile} from '@/lib/save-exported-file'

// html-to-image and jspdf are imported dynamically, matching use-schedule-export
// and fair-booth-exports. A static import here would pull both into the main
// bundle and make their lazy imports elsewhere inert.

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
  // Wait for fonts to be ready before rasterizing so DM Serif Display + Montserrat
  // render correctly in the export.
  if (document.fonts && document.fonts.ready) {
    await document.fonts.ready
  }

  const {toCanvas} = await import('html-to-image')
  const canvas = await toCanvas(element, {
    pixelRatio: 3,
    backgroundColor: '#ffffff',
    cacheBust: true,
  })

  const base = fileBaseName(year, month)

  if (format === 'jpg') {
    await saveExportedDataUrl(canvas.toDataURL('image/jpeg', 0.95), `${base}.jpg`)
    return
  }

  const imgData = canvas.toDataURL('image/png')
  const {jsPDF} = await import('jspdf')
  const doc = new jsPDF({orientation: 'landscape', unit: 'pt', format: 'letter'})
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  doc.addImage(imgData, 'PNG', 0, 0, pageWidth, pageHeight)
  await saveExportedFile(doc.output('blob'), `${base}.pdf`, 'application/pdf')
}
