import {useCallback, useState} from 'react'

interface ExportOptions {
  filename: string
}

// Shared image-generation + export helpers for any printable Schedule
// (nursery, special music, future sunday school). The preview is captured
// at a fixed 800px width so JPG/PDF output is consistent regardless of the
// viewport that's editing it.
export function useScheduleExport(previewRef: React.RefObject<HTMLDivElement | null>) {
  const [exporting, setExporting] = useState(false)

  const generateImage = useCallback(async (): Promise<string> => {
    if (!previewRef.current) throw new Error('Preview not ready')
    await document.fonts.ready
    const clone = previewRef.current.cloneNode(true) as HTMLElement
    // Pre-resolve <img> srcs to data URLs so html-to-image doesn't have to
    // fetch them itself — its internal fetch silently swallows failures and
    // rejects with a DOM Event we can't surface as a useful message.
    await inlineImagesAsDataUrls(clone)
    const container = document.createElement('div')
    container.style.cssText = 'position:fixed;left:-9999px;top:0;width:800px;background:#fff;'
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
        width: 800,
        height: clone.scrollHeight,
      })
    } finally {
      document.body.removeChild(container)
    }
  }, [previewRef])

  const exportAs = useCallback(
    async (format: 'pdf' | 'jpg', opts: ExportOptions) => {
      setExporting(true)
      try {
        await new Promise((r) => setTimeout(r, 100))
        const dataUrl = await generateImage()
        if (format === 'jpg') {
          const a = document.createElement('a')
          a.href = dataUrl
          a.download = `${opts.filename}.jpg`
          a.click()
        } else {
          const {jsPDF} = await import('jspdf')
          const img = new Image()
          await new Promise<void>((resolve, reject) => {
            img.onload = () => resolve()
            img.onerror = reject
            img.src = dataUrl
          })
          // US Letter, 10mm margins, preserve aspect ratio
          const pageWidth = 215.9
          const pageHeight = 279.4
          const margin = 10
          const maxWidth = pageWidth - margin * 2
          const maxHeight = pageHeight - margin * 2
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
          const pdf = new jsPDF({orientation: 'portrait', unit: 'mm', format: 'letter'})
          pdf.addImage(dataUrl, 'JPEG', x, y, renderWidth, renderHeight)
          pdf.save(`${opts.filename}.pdf`)
        }
      } finally {
        setExporting(false)
      }
    },
    [generateImage],
  )

  return {exporting, generateImage, exportAs, setExporting}
}

async function inlineImagesAsDataUrls(root: HTMLElement) {
  const imgs = Array.from(root.querySelectorAll('img'))
  await Promise.all(
    imgs.map(async (img) => {
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

export function describeExportError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  if (typeof error === 'string' && error) return error
  if (error && typeof error === 'object') {
    const target = (error as {target?: HTMLImageElement}).target
    if (target?.tagName === 'IMG') return `Image failed to load: ${target.src || '(empty src)'}`
    const type = (error as {type?: string}).type
    if (type) return `${type} event`
  }
  return 'Unknown error (check browser console for details)'
}
