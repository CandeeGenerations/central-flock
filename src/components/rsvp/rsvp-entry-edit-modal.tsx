import {Button} from '@/components/ui/button'
import {Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle} from '@/components/ui/dialog'
import {Input} from '@/components/ui/input'
import {Label} from '@/components/ui/label'
import {Textarea} from '@/components/ui/textarea'
import {queryKeys} from '@/lib/query-keys'
import {type RsvpEntry, updateRsvpEntry} from '@/lib/rsvp-api'
import {useMutation, useQueryClient} from '@tanstack/react-query'
import {useState} from 'react'
import {toast} from 'sonner'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  entry: RsvpEntry | null
  listId: number
}

export function RsvpEntryEditModal({open, onOpenChange, entry, listId}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            Edit {entry ? `${entry.firstName ?? ''} ${entry.lastName ?? ''}`.trim() || 'entry' : 'entry'}
          </DialogTitle>
        </DialogHeader>
        {open && entry && <EditForm entry={entry} listId={listId} onOpenChange={onOpenChange} />}
      </DialogContent>
    </Dialog>
  )
}

function EditForm({
  entry,
  listId,
  onOpenChange,
}: {
  entry: RsvpEntry
  listId: number
  onOpenChange: (open: boolean) => void
}) {
  const queryClient = useQueryClient()
  const [headcount, setHeadcount] = useState(entry.headcount?.toString() ?? '')
  const [note, setNote] = useState(entry.note ?? '')

  const updateMutation = useMutation({
    mutationFn: () => {
      const headcountValue = headcount.trim() === '' ? null : Number(headcount)
      return updateRsvpEntry(entry.id, {
        headcount: Number.isFinite(headcountValue ?? Number.NaN) ? headcountValue : null,
        note: note.trim() === '' ? null : note,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({queryKey: queryKeys.rsvpList(listId)})
      queryClient.invalidateQueries({queryKey: ['rsvpLists']})
      toast.success('Entry updated')
      onOpenChange(false)
    },
    onError: (err: Error) => toast.error(err.message),
  })

  return (
    <>
      <div className="space-y-3">
        <div className="space-y-1">
          <Label htmlFor="rsvp-headcount">Headcount</Label>
          <Input
            id="rsvp-headcount"
            type="number"
            min={0}
            value={headcount}
            onChange={(e) => setHeadcount(e.target.value)}
            placeholder="e.g. 4"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="rsvp-note">Note</Label>
          <Textarea
            id="rsvp-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Bringing dessert"
            rows={3}
          />
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button disabled={updateMutation.isPending} onClick={() => updateMutation.mutate()}>
          {updateMutation.isPending ? 'Saving…' : 'Save'}
        </Button>
      </DialogFooter>
    </>
  )
}
