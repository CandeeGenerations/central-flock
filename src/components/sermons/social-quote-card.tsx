import {RankBadge, SensitiveBadge} from '@/components/sermons/rank-badges'
import {Button} from '@/components/ui/button'
import {Card, CardContent} from '@/components/ui/card'
import {Textarea} from '@/components/ui/textarea'
import {type SocialQuote, getQuoteContext, promoteSocialQuote, updateSocialQuote} from '@/lib/sermons-api'
import {cn} from '@/lib/utils'
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'
import {BookmarkPlus, Check, Copy, Heart, Pencil, X} from 'lucide-react'
import {useState} from 'react'
import {toast} from 'sonner'

type Form = 'cleaned' | 'verbatim' | 'polished'

const FORM_LABEL: Record<Form, string> = {cleaned: 'Cleaned', verbatim: 'Verbatim', polished: 'Polished'}

export function SocialQuoteCard({sermonId, quote}: {sermonId: number; quote: SocialQuote}) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState<Form>('cleaned')
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [showContext, setShowContext] = useState(false)

  const displayed =
    form === 'verbatim'
      ? quote.verbatimText
      : form === 'polished'
        ? quote.polishedText
        : quote.editedText || quote.cleanedText

  const invalidate = () => queryClient.invalidateQueries({queryKey: ['sermons', 'detail', sermonId]})

  const saveMutation = useMutation({
    mutationFn: (data: {editedText?: string | null; used?: boolean; favorite?: boolean}) =>
      updateSocialQuote(sermonId, quote.id, data),
    onSuccess: () => {
      invalidate()
      setEditing(false)
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Save failed'),
  })

  const promoteMutation = useMutation({
    mutationFn: () => promoteSocialQuote(sermonId, quote.id),
    onSuccess: () => {
      invalidate()
      toast.success('Added to your quote corpus')
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Could not add to corpus'),
  })

  const {data: context, isLoading: contextLoading} = useQuery({
    queryKey: ['sermons', 'quote-context', sermonId, quote.id],
    queryFn: () => getQuoteContext(sermonId, quote.id),
    enabled: showContext,
  })

  function copy() {
    navigator.clipboard.writeText(displayed).then(() => toast.success('Copied'))
  }

  return (
    <Card size="sm" className={cn(quote.used && 'opacity-60', quote.favorite && 'border-red-300')}>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            variant="ghost"
            size="icon"
            className="-ml-1 h-7 w-7"
            aria-label={quote.favorite ? 'Remove from favorites' : 'Add to favorites'}
            onClick={() => saveMutation.mutate({favorite: !quote.favorite})}
          >
            <Heart className={cn('h-4 w-4', quote.favorite && 'fill-red-500 text-red-500')} />
          </Button>
          <RankBadge tier={quote.rankTier} note={quote.rankNote} />
          {quote.sensitive && <SensitiveBadge reason={quote.sensitiveReason} />}
          <div className="ml-auto flex gap-1">
            {(['cleaned', 'verbatim', 'polished'] as Form[]).map((f) => (
              <Button
                key={f}
                variant={form === f ? 'secondary' : 'ghost'}
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => setForm(f)}
              >
                {FORM_LABEL[f]}
              </Button>
            ))}
          </div>
        </div>

        {editing ? (
          <div className="space-y-2">
            <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={3} />
            <div className="flex gap-2">
              <Button size="sm" onClick={() => saveMutation.mutate({editedText: draft})}>
                Save
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                Cancel
              </Button>
              {quote.editedText && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="ml-auto text-muted-foreground"
                  onClick={() => saveMutation.mutate({editedText: null})}
                >
                  Revert to generated
                </Button>
              )}
            </div>
          </div>
        ) : (
          <p className={cn('text-lg leading-snug', form === 'verbatim' && 'text-muted-foreground text-base')}>
            “{displayed}”
          </p>
        )}

        {form === 'cleaned' && quote.editedText && !editing && (
          <p className="text-xs text-muted-foreground">Edited by you</p>
        )}

        {showContext && (
          <div className="rounded-md bg-muted/50 p-3 text-sm leading-relaxed">
            {contextLoading ? (
              <span className="text-muted-foreground">Loading…</span>
            ) : context?.available ? (
              <>
                <span className="text-muted-foreground">…{context.before} </span>
                <span className="font-medium">{context.quote}</span>
                <span className="text-muted-foreground"> {context.after}…</span>
              </>
            ) : (
              <span className="text-muted-foreground">
                Context unavailable — this quote no longer maps into the stored transcript.
              </span>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-1">
          <Button variant="ghost" size="sm" onClick={copy}>
            <Copy className="h-4 w-4 mr-1" /> Copy
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setShowContext((v) => !v)}>
            {showContext ? 'Hide context' : 'Show context'}
          </Button>
          {!editing && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setDraft(quote.editedText || quote.cleanedText)
                setForm('cleaned')
                setEditing(true)
              }}
            >
              <Pencil className="h-4 w-4 mr-1" /> Edit
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            disabled={promoteMutation.isPending || quote.promotedQuoteId !== null}
            onClick={() => promoteMutation.mutate()}
          >
            <BookmarkPlus className="h-4 w-4 mr-1" />
            {quote.promotedQuoteId ? 'In corpus' : 'Add to Quotes'}
          </Button>
          <Button
            variant={quote.used ? 'secondary' : 'ghost'}
            size="sm"
            className="ml-auto"
            onClick={() => saveMutation.mutate({used: !quote.used})}
          >
            {quote.used ? <X className="h-4 w-4 mr-1" /> : <Check className="h-4 w-4 mr-1" />}
            {quote.used ? 'Mark unused' : 'Mark used'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
