import {Button} from '@/components/ui/button'
import {Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle} from '@/components/ui/dialog'
import {Label} from '@/components/ui/label'
import {SearchableSelect} from '@/components/ui/searchable-select'
import {Textarea} from '@/components/ui/textarea'
import {usePersistedState} from '@/hooks/use-persisted-state'
import {fetchPeople} from '@/lib/api'
import {sendScheduleImage} from '@/lib/schedules-api'
import {useQuery} from '@tanstack/react-query'
import {useMemo, useState} from 'react'
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
}: SendScheduleDialogProps) {
  const [selectedRecipientId, setSelectedRecipientId] = usePersistedState<string>(recipientStorageKey, '')
  const [caption, setCaption] = useState('')
  const [sending, setSending] = useState(false)

  const {data: peopleData} = useQuery({
    queryKey: ['people', 'schedule-send-all'],
    queryFn: () => fetchPeople({status: 'active', limit: 500, page: 1}),
    enabled: open,
  })

  const recipientOptions = useMemo(() => {
    if (!peopleData?.data) return []
    return peopleData.data
      .filter((p) => p.phoneNumber)
      .map((p) => ({
        value: String(p.id),
        label: [p.firstName, p.lastName].filter(Boolean).join(' ') || p.phoneDisplay || 'Unknown',
      }))
  }, [peopleData])

  async function handleSend() {
    if (!selectedRecipientId) {
      toast.error('Pick a recipient')
      return
    }
    setSending(true)
    try {
      onBeforeSend?.()
      const imageData = await getImage()
      const {results} = await sendScheduleImage({
        imageData,
        recipientIds: [Number(selectedRecipientId)],
        caption: caption.trim() || undefined,
      })
      const failed = results.filter((r) => !r.success)
      if (failed.length === 0) {
        toast.success('Schedule sent')
        onOpenChange(false)
        setCaption('')
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
          <DialogTitle>Send Schedule</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Recipient</Label>
            <SearchableSelect
              value={selectedRecipientId}
              onValueChange={setSelectedRecipientId}
              options={recipientOptions}
              placeholder="Select a person..."
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
          <Button onClick={handleSend} disabled={sending || !selectedRecipientId}>
            {sending ? 'Sending...' : 'Send'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
