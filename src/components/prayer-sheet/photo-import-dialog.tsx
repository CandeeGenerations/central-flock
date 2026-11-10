import {AIProgress} from '@/components/ai-progress'
import {Button} from '@/components/ui/button'
import {Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle} from '@/components/ui/dialog'
import {useProgressOperation} from '@/hooks/use-sse'
import {importPrayerSheetPhoto} from '@/lib/api'
import {queryKeys} from '@/lib/query-keys'
import {useQueryClient} from '@tanstack/react-query'
import {Camera} from 'lucide-react'
import {useRef, useState} from 'react'
import {useNavigate} from 'react-router-dom'
import {toast} from 'sonner'

const STAGES = [
  {message: 'Uploading photo…', progress: 10},
  {message: 'Reading the sheet with Claude…', progress: 30},
  {message: 'Finding each Sunday…', progress: 50},
  {message: 'Reading prayer requests…', progress: 70},
  {message: 'Still reading…', progress: 80},
  {message: 'Building the edition…', progress: 90},
]

// Claude rejects images over 5 MB; phone photos routinely exceed that.
const MAX_DIMENSION = 2048

function toJpegBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      const scale = Math.min(1, MAX_DIMENSION / Math.max(img.width, img.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
      resolve(canvas.toDataURL('image/jpeg', 0.85))
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('This browser can’t read that image. Try a JPEG or PNG.'))
    }
    img.src = url
  })
}

export function PhotoImportDialog({open, onOpenChange}: {open: boolean; onOpenChange: (open: boolean) => void}) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const {state, start, reset} = useProgressOperation(STAGES, 3000)

  function close(next: boolean) {
    if (state.isRunning) return
    onOpenChange(next)
    if (!next) {
      setPreview(null)
      reset()
    }
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      setPreview(await toJpegBase64(file))
      reset()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not read image')
    }
  }

  async function handleImport() {
    if (!preview) return
    try {
      const edition = await start(() => importPrayerSheetPhoto(preview.split(',')[1], 'image/jpeg'))
      queryClient.invalidateQueries({queryKey: ['prayerSheetEditions']})
      queryClient.invalidateQueries({queryKey: queryKeys.prayerSheetEditionYears})
      const entryCount = edition.sundays.reduce((n, s) => n + s.entries.length, 0)
      toast.success(`Imported ${edition.sundays.length} Sundays and ${entryCount} requests`)
      close(false)
      navigate(`/prayer-sheet/${edition.id}`)
    } catch {
      // The error stays in the dialog via state.error so the user can retry.
    }
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent showCloseButton={!state.isRunning}>
        <DialogHeader>
          <DialogTitle>Import from Photo</DialogTitle>
          <DialogDescription>
            Take a photo of the front of a printed prayer sheet. Every Sunday and request on it becomes a new edition
            you can review.
          </DialogDescription>
        </DialogHeader>

        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />

        {preview ? (
          <button
            type="button"
            className="bg-muted/30 flex justify-center rounded-lg border p-2 disabled:cursor-default"
            onClick={() => fileRef.current?.click()}
            disabled={state.isRunning}
            title="Choose a different photo"
          >
            <img src={preview} alt="Prayer sheet" className="max-h-72 rounded object-contain" />
          </button>
        ) : (
          <Button variant="outline" className="h-32 flex-col gap-2" onClick={() => fileRef.current?.click()}>
            <Camera className="h-6 w-6" />
            Take or choose a photo
          </Button>
        )}

        {state.isRunning && <AIProgress message={state.message} progress={state.progress} />}
        {state.error && <p className="text-destructive text-sm">{state.error}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={() => close(false)} disabled={state.isRunning}>
            Cancel
          </Button>
          <Button onClick={handleImport} disabled={!preview || state.isRunning}>
            {state.isRunning ? 'Importing…' : state.error ? 'Try Again' : 'Import'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
