// Lightweight exporter for Fair Booth: two-page PDF (grid then roster) and
// a single-page JPG of just the grid.

async function captureNode(node: HTMLElement, width = 1100): Promise<string> {
  await document.fonts.ready
  const clone = node.cloneNode(true) as HTMLElement
  const container = document.createElement('div')
  container.style.cssText = `position:fixed;left:-9999px;top:0;width:${width}px;background:#fff;padding:16px;`
  container.appendChild(clone)
  document.body.appendChild(container)
  try {
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

export async function exportFairBoothPdf(
  gridNode: HTMLElement,
  rosterNode: HTMLElement,
  filename: string,
): Promise<void> {
  const {jsPDF} = await import('jspdf')
  const pdf = new jsPDF({orientation: 'portrait', unit: 'mm', format: 'letter'})
  const pageWidth = 215.9
  const pageHeight = 279.4
  const margin = 10
  const maxWidth = pageWidth - margin * 2
  const maxHeight = pageHeight - margin * 2
  const nodes = [gridNode, rosterNode]
  for (let i = 0; i < nodes.length; i++) {
    const dataUrl = await captureNode(nodes[i])
    const img = await imageDataUrlToImg(dataUrl)
    const imgRatio = img.width / img.height
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
    const x = (pageWidth - renderWidth) / 2
    const y = (pageHeight - renderHeight) / 2
    if (i > 0) pdf.addPage()
    pdf.addImage(dataUrl, 'JPEG', x, y, renderWidth, renderHeight)
  }
  pdf.save(`${filename}.pdf`)
}
