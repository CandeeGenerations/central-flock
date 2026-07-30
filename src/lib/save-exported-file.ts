// Single delivery point for every generated file in the app (JPG, PDF, CSV).
// See docs/adr/0017-export-delivery-and-ios-standalone.md.
//
// In an iOS home-screen web app (standalone display mode) Safari silently
// drops a `download`-attribute navigation to a data:/blob: URL — no download,
// no error. The replacement is the Web Share sheet, but Safari requires
// navigator.share() to run under *transient user activation*, and every caller
// here awaits a 200-500ms html-to-image render before it has a file. That
// activation is gone by then. So the share path is deliberately two-step: we
// park the finished file behind a toast whose Save tap is a fresh activation.
import {toast} from 'sonner'

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  if (window.matchMedia?.('(display-mode: standalone)').matches) return true
  // iOS Safari's legacy signal, kept alongside the manifest-driven query.
  return (window.navigator as Navigator & {standalone?: boolean}).standalone === true
}

function canShareFiles(file: File): boolean {
  return (
    typeof navigator !== 'undefined' && typeof navigator.canShare === 'function' && navigator.canShare({files: [file]})
  )
}

function anchorDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  // Revoke on the next tick — revoking synchronously races the download in
  // some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

// Deliver a generated file to the user. Resolves once the file has been handed
// off (or parked behind the Save toast); it does not wait for the share sheet.
export async function saveExportedFile(blob: Blob, filename: string, mimeType?: string): Promise<void> {
  const file = new File([blob], filename, {type: mimeType || blob.type || 'application/octet-stream'})

  if (!isStandalone() || !canShareFiles(file)) {
    anchorDownload(blob, filename)
    return
  }

  toast.success(`${filename} ready`, {
    duration: Infinity,
    action: {
      label: 'Save',
      onClick: () => {
        // Synchronous inside the tap handler — awaiting anything first would
        // consume the activation and Safari would throw NotAllowedError.
        navigator.share({files: [file]}).catch((err: unknown) => {
          if (err instanceof Error && err.name === 'AbortError') return
          toast.error(`Save failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
        })
      },
    },
  })
}

// Convenience for callers holding a data: URL rather than a Blob.
export async function saveExportedDataUrl(dataUrl: string, filename: string): Promise<void> {
  const blob = await (await fetch(dataUrl)).blob()
  await saveExportedFile(blob, filename)
}
