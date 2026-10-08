import {Button} from '@/components/ui/button'
import {Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle} from '@/components/ui/dialog'
import {Label} from '@/components/ui/label'
import {PersonPicker} from '@/components/ui/person-picker'
import {Textarea} from '@/components/ui/textarea'
import {fetchPeople, fetchPerson, sendMessage} from '@/lib/api'
import type {CampaignDetail} from '@/lib/fill-america-api'
import {useMutation, useQuery} from '@tanstack/react-query'
import {useState} from 'react'
import {toast} from 'sonner'

// Results go to the pastor who runs Fill America. Looked up by name rather than
// pinned to an id, so a re-import of contacts doesn't silently mis-route it.
const DEFAULT_RECIPIENT = 'Tim Kirchoff'

function resultsMessage(firstName: string | null, totals: CampaignDetail['totals']): string {
  const greeting = firstName ? `Bro. ${firstName}, here` : 'Here'
  return [
    `${greeting} are our results:`,
    '',
    `- Unique Participants: ${totals.uniqueParticipants.toLocaleString()}`,
    `- Tracts: ${totals.tracts.toLocaleString()}`,
    `- Door Hangers: ${totals.doorHangers.toLocaleString()}`,
  ].join('\n')
}

/**
 * Texts a campaign's totals to one person. Mount only while open: the
 * recipient and message are seeded at mount, so every opening starts from the
 * default recipient and the current numbers.
 */
export function SendResultsDialog({totals, onClose}: {totals: CampaignDetail['totals']; onClose: () => void}) {
  const [pickedId, setPickedId] = useState<number | null | undefined>(undefined)
  const [edited, setEdited] = useState<string | null>(null)

  const {data: defaultMatch} = useQuery({
    queryKey: ['people-search', DEFAULT_RECIPIENT, 'fill-america-default'],
    queryFn: () => fetchPeople({search: DEFAULT_RECIPIENT, limit: 1}),
  })
  // undefined = not yet chosen (use the default); null = deliberately cleared.
  const recipientId = pickedId === undefined ? (defaultMatch?.data[0]?.id ?? null) : pickedId

  const {data: recipient} = useQuery({
    queryKey: ['person', recipientId],
    queryFn: () => fetchPerson(recipientId as number),
    enabled: recipientId != null,
  })

  // The greeting follows the recipient until the text is edited by hand.
  const message = edited ?? resultsMessage(recipient?.firstName ?? null, totals)

  const send = useMutation({
    mutationFn: () => sendMessage({content: message, recipientIds: [recipientId as number]}),
    onSuccess: () => {
      toast.success('Results sent')
      onClose()
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Send failed'),
  })

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Send Results</DialogTitle>
          <DialogDescription>Text this campaign's totals to someone.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Recipient</Label>
            <PersonPicker
              value={recipientId}
              onChange={(id) => {
                setPickedId(id)
                setEdited(null)
              }}
              placeholder="Search people..."
              className="w-full"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="fa-results-message">Message</Label>
            <Textarea id="fa-results-message" value={message} onChange={(e) => setEdited(e.target.value)} rows={6} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={send.isPending}>
            Cancel
          </Button>
          <Button onClick={() => send.mutate()} disabled={send.isPending || recipientId == null || !message.trim()}>
            {send.isPending ? 'Sending...' : 'Send'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
