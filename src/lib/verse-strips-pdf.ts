import {jsPDF} from 'jspdf'

export interface GenerateVerseStripsPdfOptions {
  strips: string[]
  wordFontSize: number
  filename: string
}

const MARGIN = 36
const HORIZONTAL_PADDING = 16
const VERTICAL_PADDING = 12
const HORIZONTAL_GAP = 14
const VERTICAL_GAP = 14
const LINE_HEIGHT_RATIO = 1.0

export async function generateVerseStripsPdf(options: GenerateVerseStripsPdfOptions): Promise<void> {
  const {strips, wordFontSize, filename} = options

  const doc = new jsPDF({orientation: 'portrait', unit: 'pt', format: 'letter'})
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()

  const printableLeft = MARGIN
  const printableRight = pageWidth - MARGIN
  const printableTop = MARGIN
  const printableBottom = pageHeight - MARGIN
  const maxBoxWidth = printableRight - printableLeft

  const applyStripStyle = () => {
    doc.setFont('helvetica', 'bold')
    doc.setLineWidth(0.5)
    doc.setDrawColor(140, 140, 140)
    doc.setLineDashPattern([3, 3], 0)
  }

  applyStripStyle()

  let cursorX = printableLeft
  let cursorY = printableTop
  let currentRowHeight = 0

  for (const strip of strips) {
    const text = strip.trim()
    if (!text) continue

    let effectiveFontSize = wordFontSize
    doc.setFontSize(effectiveFontSize)
    let textWidth = doc.getTextWidth(text)
    let boxWidth = textWidth + HORIZONTAL_PADDING * 2

    if (boxWidth > maxBoxWidth) {
      effectiveFontSize = Math.floor(((maxBoxWidth - HORIZONTAL_PADDING * 2) / textWidth) * effectiveFontSize)
      doc.setFontSize(effectiveFontSize)
      textWidth = doc.getTextWidth(text)
      boxWidth = textWidth + HORIZONTAL_PADDING * 2
    }

    const boxHeight = effectiveFontSize * LINE_HEIGHT_RATIO + VERTICAL_PADDING * 2

    if (cursorX !== printableLeft && cursorX + boxWidth > printableRight) {
      cursorX = printableLeft
      cursorY += currentRowHeight + VERTICAL_GAP
      currentRowHeight = 0
    }

    if (cursorY + boxHeight > printableBottom) {
      doc.addPage()
      applyStripStyle()
      cursorX = printableLeft
      cursorY = printableTop
      currentRowHeight = 0
    }

    doc.rect(cursorX, cursorY, boxWidth, boxHeight, 'S')
    doc.setFontSize(effectiveFontSize)
    doc.setTextColor(0, 0, 0)
    doc.text(text, cursorX + boxWidth / 2, cursorY + boxHeight / 2, {align: 'center', baseline: 'middle'})

    cursorX += boxWidth + HORIZONTAL_GAP
    currentRowHeight = Math.max(currentRowHeight, boxHeight)
  }

  doc.save(filename)
}
