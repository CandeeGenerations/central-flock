import {ConfirmDialog} from '@/components/confirm-dialog'
import {Button} from '@/components/ui/button'
import {Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle} from '@/components/ui/dialog'
import {Input} from '@/components/ui/input'
import {Label} from '@/components/ui/label'
import {ScrollArea} from '@/components/ui/scroll-area'
import {Textarea} from '@/components/ui/textarea'
import {
  type Quote,
  type QuoteCreateInput,
  type QuoteUpdateInput,
  aiTagQuote,
  createQuote,
  updateQuote,
} from '@/lib/quotes-api'
import {useMutation, useQueryClient} from '@tanstack/react-query'
import {Sparkles} from 'lucide-react'
import {useState} from 'react'
import {toast} from 'sonner'

interface QuoteFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  quote?: Quote // if provided, edit mode
}

// QuoteFormDialogInner is remounted via `key` whenever the quote or open state changes.
function QuoteFormDialogInner({open, onOpenChange, quote}: QuoteFormDialogProps) {
  const qc = useQueryClient()
  const isEdit = !!quote

  // Initialize state from props — remounting (via key) resets these.
  const [title, setTitle] = useState(quote?.title ?? '')
  const [author, setAuthor] = useState(quote?.author ?? '')
  const [capturedBy, setCapturedBy] = useState(quote?.capturedBy ?? '')
  const [dateDisplay, setDateDisplay] = useState(quote?.dateDisplay ?? '')
  const [summary, setSummary] = useState(quote?.summary ?? '')
  const [quoteText, setQuoteText] = useState(quote?.quoteText ?? '')
  const [tagsRaw, setTagsRaw] = useState(quote?.tags.join(', ') ?? '')

  const [aiConfirmOpen, setAiConfirmOpen] = useState(false)

  const aiMutation = useMutation({
    mutationFn: () => aiTagQuote(quoteText),
    onSuccess: (result) => {
      setSummary(result.summary)
      setTagsRaw(result.tags.join(', '))
      toast.success('AI tags applied')
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'AI tagging failed'),
  })

  const requestAiTags = () => {
    if (tagsRaw.trim().length > 0) {
      setAiConfirmOpen(true)
    } else {
      aiMutation.mutate()
    }
  }

  const mutation = useMutation({
    mutationFn: async () => {
      const tags = tagsRaw
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)

      if (isEdit && quote) {
        const input: QuoteUpdateInput = {title, author, capturedBy, dateDisplay, summary, quoteText, tags}
        return updateQuote(quote.id, input)
      } else {
        const input: QuoteCreateInput = {title, author, capturedBy, dateDisplay, summary, quoteText, tags}
        return createQuote(input)
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({queryKey: ['quotes']})
      if (isEdit && quote) qc.invalidateQueries({queryKey: ['quote', quote.id]})
      toast.success(isEdit ? 'Quote updated' : 'Quote added')
      onOpenChange(false)
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Failed to save quote')
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim() || !summary.trim() || !quoteText.trim()) {
      toast.error('Title, summary, and quote text are required')
      return
    }
    mutation.mutate()
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{isEdit ? 'Edit Quote' : 'Add Quote'}</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[70vh] pr-4">
            <form id="quote-form-inner" onSubmit={handleSubmit} className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label htmlFor="qf-title">Title *</Label>
                <Input
                  id="qf-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Quote title"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="qf-author">Author</Label>
                  <Input
                    id="qf-author"
                    value={author}
                    onChange={(e) => setAuthor(e.target.value)}
                    placeholder="Cited author"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="qf-captured-by">Captured By</Label>
                  <Input
                    id="qf-captured-by"
                    value={capturedBy}
                    onChange={(e) => setCapturedBy(e.target.value)}
                    placeholder="e.g. Tyler Candee"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="qf-date">Date</Label>
                <Input
                  id="qf-date"
                  value={dateDisplay}
                  onChange={(e) => setDateDisplay(e.target.value)}
                  placeholder="e.g. Apr 13, 2026"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="qf-summary">Summary *</Label>
                <Textarea
                  id="qf-summary"
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  placeholder="Brief summary of the quote's theme"
                  rows={3}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="qf-text">Quote Text *</Label>
                <Textarea
                  id="qf-text"
                  value={quoteText}
                  onChange={(e) => setQuoteText(e.target.value)}
                  placeholder={`The quote body...\n◇ Author Name`}
                  rows={6}
                  className="font-mono text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="qf-tags">Tags</Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs"
                    disabled={aiMutation.isPending || !quoteText.trim()}
                    onClick={requestAiTags}
                  >
                    <Sparkles className="h-3 w-3 mr-1" />
                    {aiMutation.isPending ? 'Generating…' : 'AI Tags'}
                  </Button>
                </div>
                <Input
                  id="qf-tags"
                  value={tagsRaw}
                  onChange={(e) => setTagsRaw(e.target.value)}
                  placeholder="Comma-separated: Faith, Prayer, Wisdom"
                />
              </div>
            </form>
          </ScrollArea>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" form="quote-form-inner" disabled={mutation.isPending}>
              {mutation.isPending ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Quote'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={aiConfirmOpen}
        onOpenChange={setAiConfirmOpen}
        title="Overwrite existing tags?"
        description="This quote already has tags. Applying AI tags will replace the summary and overwrite them."
        confirmLabel="Generate & Overwrite"
        variant="destructive"
        loading={aiMutation.isPending}
        onConfirm={() => aiMutation.mutate()}
      />
    </>
  )
}

// Wrapper that forces remount when quote or open changes, resetting form state cleanly.
export function QuoteFormDialog(props: QuoteFormDialogProps) {
  const key = props.quote ? `edit-${props.quote.id}` : 'add'
  return <QuoteFormDialogInner key={key} {...props} />
}
