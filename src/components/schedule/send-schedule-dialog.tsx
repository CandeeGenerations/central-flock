import {Button} from '@/components/ui/button'
import {Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle} from '@/components/ui/dialog'
import {Label} from '@/components/ui/label'
import {PersonPicker} from '@/components/ui/person-picker'
import {Textarea} from '@/components/ui/textarea'
import {usePersistedState} from '@/hooks/use-persisted-state'
import {sendScheduleImage} from '@/lib/schedules-api'
import {useState} from 'react'
import {toast} from 'sonner'

interface SendScheduleDialogProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  // Caller is responsible for putting the preview into a stable (non-edit-mode)
  // state and triggering image generation. The dialog asks for an image at
  // send time via this thunk.
  getImage: () => Promise<string>
  // Identifier used for the persisted recipient memory key — same recipient
  // recurs across sessions per-schedule-type.
  recipientStorageKey: string
  // When the image is about one specific person (a Shifts Card), seed the
  // picker with them and ignore the persisted memory — otherwise the last-used
  // recipient would leak across people and mis-route a send. Still swappable
  // for a one-off; it just never sticks. Seeded at mount, so callers passing
  // this should mount the dialog only while it's open.
  initialRecipientId?: number
  // Overrides the dialog title/button copy for per-person sends.
  title?: string
  // Pre-fills the caption textarea. Seeded at mount and restored after a
  // successful send; still fully editable.
  defaultCaption?: string
  // Caller's own onBeforeSend hook (e.g. flip out of edit mode, prep refs).
  onBeforeSend?: () => void
  // Caller-supplied error describer (export errors with image-load metadata).
  describeError?: (e: unknown) => string
}

export function SendScheduleDialog({
  open,
  onOpenChange,
  getImage,
  recipientStorageKey,
  onBeforeSend,
  describeError,
  initialRecipientId,
  title = 'Send Schedule',
  defaultCaption = '',
}: SendScheduleDialogProps) {
  const [persistedRecipientId, setPersistedRecipientId] = usePersistedState<number | null>(recipientStorageKey, null)
  const [overrideRecipientId, setOverrideRecipientId] = useState<number | null>(initialRecipientId ?? null)
  const pinned = initialRecipientId != null
  const recipientId = pinned ? overrideRecipientId : persistedRecipientId
  const setRecipientId = pinned ? setOverrideRecipientId : setPersistedRecipientId
  const [caption, setCaption] = useState(defaultCaption)
  const [sending, setSending] = useState(false)

  async function handleSend() {
    if (recipientId == null) {
      toast.error('Pick a recipient')
      return
    }
    setSending(true)
    try {
      onBeforeSend?.()
      const imageData = await getImage()
      const {results} = await sendScheduleImage({
        imageData,
        recipientIds: [recipientId],
        caption: caption.trim() || undefined,
      })
      const failed = results.filter((r) => !r.success)
      if (failed.length === 0) {
        toast.success('Schedule sent')
        onOpenChange(false)
        setCaption(defaultCaption)
      } else {
        toast.error(`Send failed: ${failed[0].error || 'Unknown error'}`)
      }
    } catch (e) {
      console.error('Send schedule error:', e)
      toast.error(`Send failed: ${describeError ? describeError(e) : e instanceof Error ? e.message : 'Unknown error'}`)
    } finally {
      setSending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Recipient</Label>
            <PersonPicker
              value={recipientId}
              onChange={setRecipientId}
              placeholder="Search people..."
              className="w-full"
            />
          </div>
          <div className="space-y-2">
            <Label>Caption (optional)</Label>
            <Textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Add a message to go with the schedule..."
              rows={2}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>
            Cancel
          </Button>
          <Button onClick={handleSend} disabled={sending || recipientId == null}>
            {sending ? 'Sending...' : 'Send'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
