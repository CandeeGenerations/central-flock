// Lightweight exporter for Fair Booth: two-page PDF (grid then roster), a
// single-page JPG of just the grid, and the per-person Shifts Card.
import {saveExportedDataUrl, saveExportedFile} from '@/lib/save-exported-file'

// Pre-resolve <img> srcs to data URLs. html-to-image fetches them itself
// otherwise and swallows failures as a bare DOM Event — the logo just silently
// vanishes from the capture. Mirrors use-schedule-export.ts.
async function inlineImagesAsDataUrls(root: HTMLElement): Promise<void> {
  await Promise.all(
    Array.from(root.querySelectorAll('img')).map(async (img) => {
      if (!img.src || img.src.startsWith('data:')) return
      try {
        const res = await fetch(img.src, {credentials: 'include'})
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const blob = await res.blob()
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve(String(reader.result))
          reader.onerror = () => reject(new Error('FileReader failed'))
          reader.readAsDataURL(blob)
        })
        img.removeAttribute('crossorigin')
        img.src = dataUrl
      } catch (err) {
        const wrapped = new Error(
          `Failed to load image ${img.src}: ${err instanceof Error ? err.message : String(err)}`,
        )
        ;(wrapped as Error & {cause?: unknown}).cause = err
        throw wrapped
      }
    }),
  )
}

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
    await inlineImagesAsDataUrls(clone)
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
  await saveExportedDataUrl(await captureNode(gridNode), `${filename}.jpg`)
}

// ── Shifts Card ────────────────────────────────────────────────────────
// Facebook-story geometry so the card drops straight into a story or an
// iMessage thread without cropping. Captured at 1:1 pixel ratio because the
// node is already authored at output size; the component scales its own type
// to fit (see fair-booth-shifts-card.tsx).
export const SHIFTS_CARD_WIDTH = 1080
export const SHIFTS_CARD_HEIGHT = 1920

export async function renderShiftsCardJpeg(cardNode: HTMLElement): Promise<string> {
  await document.fonts.ready
  const clone = cardNode.cloneNode(true) as HTMLElement
  const container = document.createElement('div')
  container.style.cssText = `position:fixed;left:-99999px;top:0;width:${SHIFTS_CARD_WIDTH}px;background:#fff;`
  container.appendChild(clone)
  document.body.appendChild(container)
  try {
    await inlineImagesAsDataUrls(clone)
    const {toJpeg} = await import('html-to-image')
    return await toJpeg(clone, {
      quality: 0.95,
      pixelRatio: 1,
      backgroundColor: '#ffffff',
      cacheBust: false,
      skipFonts: true,
      width: SHIFTS_CARD_WIDTH,
      height: SHIFTS_CARD_HEIGHT,
    })
  } finally {
    document.body.removeChild(container)
  }
}

export async function exportShiftsCardJpg(cardNode: HTMLElement, filename: string): Promise<void> {
  await saveExportedDataUrl(await renderShiftsCardJpeg(cardNode), `${filename}.jpg`)
}

// US Letter in mm.
const LETTER_LONG = 279.4
const LETTER_SHORT = 215.9
// Trimmed from 8mm: every page is fit-to-page, so a thinner margin scales the
// whole capture up. 5mm stays clear of the ~4.2mm non-printable edge a laser
// printer clips; going to 4 risks losing the outer grid border.
const PAGE_MARGIN = 5
// Fixed canvas width the print nodes render at before being scaled to fill the
// sheet. On-page font size scales as 1/CAPTURE_WIDTH — a narrower canvas maps
// each glyph to more mm on paper, enlarging the text. Floor is set by grid cell
// wrapping (fixed columns): too narrow and long initials lines wrap.
//
// Do not narrow this for the split-page export. A lone Grid Half is wide and
// short (ratio ~1.5), so its sheet goes landscape — where the usable box is only
// ~206mm tall and the node already sits near the width/height-limited boundary.
// Narrowing the capture adds wrapped lines, tips the node into height-limited,
// and the type comes out *smaller*. (Portrait behaves the opposite way, which is
// why the split sheets are landscape and the roster page is not.)
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

// gridNodes is one node for the combined grid, or one node per Grid Half for
// the split-page export. Every grid page shares a single orientation — decided
// from the tallest node so it fits — because a doc you have to rotate halfway
// through reads as a mistake.
export async function exportFairBoothPdf(
  gridNodes: HTMLElement[],
  rosterNode: HTMLElement,
  filename: string,
): Promise<void> {
  const {jsPDF} = await import('jspdf')

  // Grid pages: capture, then pick whichever orientation scales the schedule
  // largest (a wide grid gains ~30% in landscape; a tall one stays portrait).
  // Roster page: always portrait, padded to fill the sheet.
  const gridRatios: number[] = []
  const gridUrls: string[] = []
  for (const node of gridNodes) {
    const url = await captureNode(node, {width: CAPTURE_WIDTH})
    const img = await imageDataUrlToImg(url)
    gridUrls.push(url)
    gridRatios.push(img.width / img.height)
  }
  const tallestRatio = Math.min(...gridRatios)
  const gridOrientation: Orientation =
    placement('landscape', tallestRatio).renderWidth > placement('portrait', tallestRatio).renderWidth
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
    ...gridUrls.map((url, i) => ({url, orientation: gridOrientation, imgRatio: gridRatios[i]})),
    {url: rosterUrl, orientation: 'portrait', imgRatio: rosterRatio},
  ]
  for (let i = 0; i < pages.length; i++) {
    const p = pages[i]
    const pos = placement(p.orientation, p.imgRatio)
    if (i > 0) pdf.addPage('letter', p.orientation)
    pdf.addImage(p.url, 'JPEG', pos.x, pos.y, pos.renderWidth, pos.renderHeight)
  }
  await saveExportedFile(pdf.output('blob'), `${filename}.pdf`, 'application/pdf')
}
