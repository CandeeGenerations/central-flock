import {captureFixedPageJpeg, exportFixedPagePackPdf} from '@/lib/fixed-page-pdf'
import {saveExportedDataUrl} from '@/lib/save-exported-file'
import {type RefObject, useCallback, useState} from 'react'

/**
 * Export helpers for the Nursery Schedule and the Special Music Schedule, both
 * of which print from the fixed 816x1056 page box (ADR 0021). There is no
 * fit-to-page step anywhere here: the node is already Letter-proportioned, so
 * the image maps 1:1 onto the sheet.
 *
 * `exporting` is the flag the body components read to drop edit chrome — a
 * `SearchableSelect`, a "+ Add", a Double Booking badge — before capture, which
 * is the ADR 0005 rule that no edit affordance reaches the PDF.
 */
export function useScheduleExport(pageRef: RefObject<HTMLDivElement | null>) {
  const [exporting, setExporting] = useState(false)

  /** Hold `exporting` true across the whole run, giving React a beat to drop
   *  edit chrome and re-render the page node before anything is captured. */
  const whileExporting = useCallback(async <T>(fn: () => Promise<T>): Promise<T> => {
    setExporting(true)
    try {
      await new Promise((r) => setTimeout(r, 120))
      return await fn()
    } finally {
      setExporting(false)
    }
  }, [])

  /** The page as a JPEG data URL at ~192 DPI — the JPG download and the
   *  Messages attachment. */
  const generateImage = useCallback(async (): Promise<string> => {
    if (!pageRef.current) throw new Error('Preview not ready')
    return captureFixedPageJpeg(pageRef.current)
  }, [pageRef])

  const exportJpg = useCallback(
    async (filename: string) => {
      const dataUrl = await whileExporting(generateImage)
      await saveExportedDataUrl(dataUrl, `${filename}.jpg`)
    },
    [generateImage, whileExporting],
  )

  /** The Master Copy / Recipient Copy pack: one page per descriptor, `prepare`
   *  re-highlighting the single live node between captures. */
  const exportPackPdf = useCallback(
    async <T>(pages: T[], opts: {filename: string; prepare: (page: T) => void}) =>
      whileExporting(() =>
        exportFixedPagePackPdf(pages, {
          filename: opts.filename,
          node: () => pageRef.current,
          prepare: opts.prepare,
        }),
      ),
    [pageRef, whileExporting],
  )

  return {exporting, generateImage, exportJpg, exportPackPdf, whileExporting}
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
