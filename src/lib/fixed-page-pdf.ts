import {PAGE_HEIGHT_PX, PAGE_WIDTH_PX} from '@/components/print/page-frame'
import {saveExportedFile} from '@/lib/save-exported-file'

// US Letter in mm.
const PAGE_WIDTH_MM = 215.9
const PAGE_HEIGHT_MM = 279.4

/**
 * Captures one fixed-size page node at its native 816x1056 and places it edge
 * to edge on a Letter sheet. Deliberately no fit-to-page step: because the node
 * is already Letter-proportioned, the image maps 1:1 to the sheet and every pt
 * in the CSS prints as a real point, no matter how much content the page holds.
 * See docs/adr/0021-fixed-page-box-print.md.
 */
async function capturePage(node: HTMLElement, pixelRatio = 3): Promise<string> {
  await document.fonts.ready
  const clone = node.cloneNode(true) as HTMLElement
  await inlineImages(clone)
  const container = document.createElement('div')
  container.style.cssText = `position:fixed;left:-99999px;top:0;width:${PAGE_WIDTH_PX}px;background:#fff;`
  container.appendChild(clone)
  document.body.appendChild(container)
  try {
    const {toJpeg} = await import('html-to-image')
    return await toJpeg(clone, {
      quality: 0.95,
      pixelRatio, // 3 = ~288 DPI, for print; 2 = ~192 DPI, for a texted image
      backgroundColor: '#ffffff',
      cacheBust: false,
      skipFonts: true,
      width: PAGE_WIDTH_PX,
      height: PAGE_HEIGHT_PX,
    })
  } finally {
    document.body.removeChild(container)
  }
}

/**
 * One PDF from a list of fixed-size page nodes, one node per sheet. Shared by
 * every fixed-page-box export — the capture is type-agnostic.
 */
export async function exportFixedPagePdf(pages: HTMLElement[], filename: string): Promise<void> {
  const images: string[] = []
  for (const node of pages) images.push(await capturePage(node))

  const {jsPDF} = await import('jspdf')
  const pdf = new jsPDF({orientation: 'portrait', unit: 'mm', format: 'letter'})
  images.forEach((dataUrl, i) => {
    if (i > 0) pdf.addPage('letter', 'portrait')
    pdf.addImage(dataUrl, 'JPEG', 0, 0, PAGE_WIDTH_MM, PAGE_HEIGHT_MM)
  })
  // Never pdf.save() — it bypasses the iOS standalone path (ADR 0017).
  await saveExportedFile(pdf.output('blob'), `${filename}.pdf`, 'application/pdf')
}

async function inlineImages(root: HTMLElement) {
  const imgs = Array.from(root.querySelectorAll('img'))
  await Promise.all(
    imgs.map(async (img) => {
      if (!img.src || img.src.startsWith('data:')) return
      const res = await fetch(img.src, {credentials: 'include'})
      if (!res.ok) throw new Error(`Failed to load image ${img.src}: HTTP ${res.status}`)
      const blob = await res.blob()
      img.removeAttribute('crossorigin')
      img.src = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result))
        reader.onerror = () => reject(new Error('FileReader failed'))
        reader.readAsDataURL(blob)
      })
    }),
  )
}

/**
 * One PDF from a SINGLE page node re-rendered once per page descriptor — the
 * Master Copy / Recipient Copy pack. `prepare` mutates React state to highlight
 * the next recipient; the loop waits a tick for React to flush, captures, and
 * appends. Same edge-to-edge placement as `exportFixedPagePdf`: no fit step, so
 * every pt still prints as a real point on every page of the pack.
 */
export async function exportFixedPagePackPdf<T>(
  pages: T[],
  opts: {filename: string; node: () => HTMLElement | null; prepare: (page: T) => void},
): Promise<void> {
  if (pages.length === 0) return
  const {jsPDF} = await import('jspdf')
  const pdf = new jsPDF({orientation: 'portrait', unit: 'mm', format: 'letter'})
  for (let i = 0; i < pages.length; i++) {
    opts.prepare(pages[i])
    // Let React flush state + paint before we capture.
    await new Promise((r) => setTimeout(r, 120))
    const node = opts.node()
    if (!node) throw new Error('Preview not ready')
    const dataUrl = await capturePage(node)
    if (i > 0) pdf.addPage('letter', 'portrait')
    pdf.addImage(dataUrl, 'JPEG', 0, 0, PAGE_WIDTH_MM, PAGE_HEIGHT_MM)
  }
  // Never pdf.save() — it bypasses the iOS standalone path (ADR 0017).
  await saveExportedFile(pdf.output('blob'), `${opts.filename}.pdf`, 'application/pdf')
}

/**
 * One fixed page as a JPEG data URL. Captured at pixelRatio 2 (~192 DPI) rather
 * than the PDF's 3: this feeds the JPG download and the Messages attachment,
 * where 2448x3168 is heavy and 1632x2112 is already sharper than any phone
 * screen. Same node, same geometry — only the density differs.
 */
export async function captureFixedPageJpeg(node: HTMLElement): Promise<string> {
  return capturePage(node, 2)
}
