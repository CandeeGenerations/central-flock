import {AIProgress} from '@/components/ai-progress'
import {Button} from '@/components/ui/button'
import {Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle} from '@/components/ui/dialog'
import {useProgressOperation} from '@/hooks/use-sse'
import {createMusicScan, musicScanKeys, photoToDataUrl} from '@/lib/music-scan-api'
import type {ScanSummary} from '@/lib/music-scan-types'
import {weekLabel} from '@/lib/music-schedule-core'
import {useQueryClient} from '@tanstack/react-query'
import {Camera, Plus, X} from 'lucide-react'
import {useRef, useState} from 'react'
import {useNavigate} from 'react-router-dom'
import {toast} from 'sonner'

const STAGES = [
  {message: 'Uploading photos…', progress: 10},
  {message: 'Reading the pastor’s pages…', progress: 30},
  {message: 'Still reading…', progress: 50},
  {message: 'Matching songs to the hymnal…', progress: 75},
  {message: 'Almost done…', progress: 90},
]

const MAX_PHOTOS = 3

/**
 * Take the pastor's pages (Sunday sheet, Midweek sheet, Title/Text form) on the
 * phone and scan them. The result is kept as an unfinished review, usually
 * finished later on a wider screen — nothing is created until it is applied.
 */
export function ScanCaptureDialog({open, onOpenChange}: {open: boolean; onOpenChange: (open: boolean) => void}) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const inputRef = useRef<HTMLInputElement>(null)
  const [photos, setPhotos] = useState<string[]>([])
  const [done, setDone] = useState<{id: number; weekStart: string | null; summary: ScanSummary} | null>(null)
  const {state, start} = useProgressOperation(STAGES, 4000)

  const reset = () => {
    setPhotos([])
    setDone(null)
  }

  const addFiles = async (files: FileList | null) => {
    if (!files?.length) return
    try {
      const urls = await Promise.all([...files].map((f) => photoToDataUrl(f)))
      setPhotos((prev) => [...prev, ...urls].slice(0, MAX_PHOTOS))
    } catch {
      toast.error('Could not read that photo')
    }
  }

  const scan = async () => {
    try {
      const result = await start(() => createMusicScan(photos))
      queryClient.invalidateQueries({queryKey: musicScanKeys.all})
      setDone(result)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Scan failed')
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (state.isRunning) return
        onOpenChange(o)
        if (!o) reset()
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New week from photos</DialogTitle>
          <DialogDescription>
            Take the Sunday sheet, the Midweek sheet and the Title/Text form, in any order. Nothing is created until you
            review it.
          </DialogDescription>
        </DialogHeader>

        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          className="hidden"
          onChange={(e) => {
            void addFiles(e.target.files)
            e.target.value = ''
          }}
        />

        {done ? (
          <div className="space-y-2 rounded border p-3">
            <p className="font-medium">{done.weekStart ? weekLabel(done.weekStart) : 'Week not read'}</p>
            <p className="text-muted-foreground text-sm">
              {done.summary.resolved} of {done.summary.songs} songs found
              {done.summary.toCheck ? ` · ${done.summary.toCheck} to check` : ' · nothing to check'}
            </p>
            <p className="text-muted-foreground text-xs">
              Saved as an unfinished review — open it here, or later from the Music Schedule list on your iPad or
              laptop.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              {photos.map((p, i) => (
                <div key={i} className="relative aspect-[3/4] overflow-hidden rounded border">
                  <img src={p} alt={`Photo ${i + 1}`} className="h-full w-full object-cover" />
                  <button
                    type="button"
                    aria-label="Remove photo"
                    disabled={state.isRunning}
                    className="absolute top-1 right-1 rounded-full bg-black/60 p-1.5 text-white"
                    onClick={() => setPhotos((prev) => prev.filter((_, j) => j !== i))}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              {photos.length < MAX_PHOTOS ? (
                <button
                  type="button"
                  disabled={state.isRunning}
                  onClick={() => inputRef.current?.click()}
                  className="text-muted-foreground hover:bg-muted flex aspect-[3/4] flex-col items-center justify-center gap-1 rounded border border-dashed text-sm"
                >
                  {photos.length ? <Plus className="h-5 w-5" /> : <Camera className="h-5 w-5" />}
                  {photos.length ? 'Add photo' : 'Take photo'}
                </button>
              ) : null}
            </div>
            {state.isRunning ? <AIProgress message={state.message} progress={state.progress} /> : null}
          </div>
        )}

        <DialogFooter>
          {done ? (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Finish later
              </Button>
              <Button onClick={() => navigate(`/schedules/music/scans/${done.id}`)}>Open review</Button>
            </>
          ) : (
            <Button className="w-full sm:w-auto" disabled={!photos.length || state.isRunning} onClick={scan}>
              {state.isRunning ? 'Scanning…' : `Scan ${photos.length || ''} photo${photos.length === 1 ? '' : 's'}`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
