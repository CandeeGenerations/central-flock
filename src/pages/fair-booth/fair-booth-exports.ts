// Lightweight exporter for Fair Booth: two-page PDF (grid then roster) and
// a single-page JPG of just the grid.

// Append blank rows to every roster table until the node is tall enough to
// fill the target height, so the roster page uses the whole sheet instead of
// leaving the bottom empty. No-op once the content already exceeds the target.
function padTablesToHeight(clone: HTMLElement, targetHeight: number): void {
  const tbodies = Array.from(clone.querySelectorAll<HTMLTableSectionElement>('table tbody'))
  const sampleRow = clone.querySelector<HTMLTableRowElement>('table tbody tr')
  if (!tbodies.length || !sampleRow) return
  const rowHeight = sampleRow.getBoundingClientRect().height || 26
  const deficit = targetHeight - clone.scrollHeight
  if (deficit <= rowHeight) return
  const rowsToAdd = Math.floor(deficit / rowHeight)
  for (const tbody of tbodies) {
    const template = tbody.lastElementChild
    if (!template) continue
    for (let i = 0; i < rowsToAdd; i++) {
      const row = template.cloneNode(true) as HTMLElement
      row.querySelectorAll('td').forEach((td) => {
        td.textContent = ' '
      })
      tbody.appendChild(row)
    }
  }
}

async function captureNode(node: HTMLElement, opts: {width?: number; fillToHeight?: number} = {}): Promise<string> {
  const {width = 1100, fillToHeight} = opts
  await document.fonts.ready
  const clone = node.cloneNode(true) as HTMLElement
  const container = document.createElement('div')
  container.style.cssText = `position:fixed;left:-9999px;top:0;width:${width}px;background:#fff;padding:16px;`
  container.appendChild(clone)
  document.body.appendChild(container)
  try {
    if (fillToHeight) padTablesToHeight(clone, fillToHeight)
    const {toJpeg} = await import('html-to-image')
    return await toJpeg(clone, {
      quality: 0.95,
      pixelRatio: 2,
      backgroundColor: '#ffffff',
      cacheBust: false,
      skipFonts: true,
      width,
      height: clone.scrollHeight,
    })
  } finally {
    document.body.removeChild(container)
  }
}

async function imageDataUrlToImg(dataUrl: string): Promise<HTMLImageElement> {
  const img = new Image()
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve()
    img.onerror = reject
    img.src = dataUrl
  })
  return img
}

export async function exportFairBoothJpg(gridNode: HTMLElement, filename: string): Promise<void> {
  const dataUrl = await captureNode(gridNode)
  const a = document.createElement('a')
  a.href = dataUrl
  a.download = `${filename}.jpg`
  a.click()
}

// US Letter in mm.
const LETTER_LONG = 279.4
const LETTER_SHORT = 215.9
const PAGE_MARGIN = 8
// Fixed canvas width the print nodes render at before being scaled to fill the
// sheet. On-page font size scales as 1/CAPTURE_WIDTH — a narrower canvas maps
// each glyph to more mm on paper, enlarging the text. Floor is set by grid cell
// wrapping (fixed columns): too narrow and long initials lines wrap.
const CAPTURE_WIDTH = 900

type Orientation = 'portrait' | 'landscape'

function pageDims(orientation: Orientation): {pageWidth: number; pageHeight: number} {
  return orientation === 'landscape'
    ? {pageWidth: LETTER_LONG, pageHeight: LETTER_SHORT}
    : {pageWidth: LETTER_SHORT, pageHeight: LETTER_LONG}
}

// Fit-to-page while preserving aspect ratio, centered on the sheet.
function placement(orientation: Orientation, imgRatio: number) {
  const {pageWidth, pageHeight} = pageDims(orientation)
  const maxWidth = pageWidth - PAGE_MARGIN * 2
  const maxHeight = pageHeight - PAGE_MARGIN * 2
  const pageRatio = maxWidth / maxHeight
  let renderWidth: number
  let renderHeight: number
  if (imgRatio > pageRatio) {
    renderWidth = maxWidth
    renderHeight = maxWidth / imgRatio
  } else {
    renderHeight = maxHeight
    renderWidth = maxHeight * imgRatio
  }
  return {
    pageWidth,
    pageHeight,
    renderWidth,
    renderHeight,
    x: (pageWidth - renderWidth) / 2,
    y: (pageHeight - renderHeight) / 2,
  }
}

export async function exportFairBoothPdf(
  gridNode: HTMLElement,
  rosterNode: HTMLElement,
  filename: string,
): Promise<void> {
  const {jsPDF} = await import('jspdf')

  // Grid page: capture once, then pick whichever orientation scales the
  // schedule largest (a wide grid gains ~30% in landscape; a tall one stays
  // portrait). Roster page: always portrait, padded to fill the sheet.
  const gridUrl = await captureNode(gridNode, {width: CAPTURE_WIDTH})
  const gridImg = await imageDataUrlToImg(gridUrl)
  const gridRatio = gridImg.width / gridImg.height
  const gridOrientation: Orientation =
    placement('landscape', gridRatio).renderWidth > placement('portrait', gridRatio).renderWidth
      ? 'landscape'
      : 'portrait'

  const rosterPortrait = pageDims('portrait')
  const rosterFillHeight =
    (CAPTURE_WIDTH * (rosterPortrait.pageHeight - PAGE_MARGIN * 2)) / (rosterPortrait.pageWidth - PAGE_MARGIN * 2)
  const rosterUrl = await captureNode(rosterNode, {width: CAPTURE_WIDTH, fillToHeight: rosterFillHeight})
  const rosterImg = await imageDataUrlToImg(rosterUrl)
  const rosterRatio = rosterImg.width / rosterImg.height

  const pdf = new jsPDF({orientation: gridOrientation, unit: 'mm', format: 'letter'})
  const pages: {url: string; orientation: Orientation; imgRatio: number}[] = [
    {url: gridUrl, orientation: gridOrientation, imgRatio: gridRatio},
    {url: rosterUrl, orientation: 'portrait', imgRatio: rosterRatio},
  ]
  for (let i = 0; i < pages.length; i++) {
    const p = pages[i]
    const pos = placement(p.orientation, p.imgRatio)
    if (i > 0) pdf.addPage('letter', p.orientation)
    pdf.addImage(p.url, 'JPEG', pos.x, pos.y, pos.renderWidth, pos.renderHeight)
  }
  pdf.save(`${filename}.pdf`)
}
