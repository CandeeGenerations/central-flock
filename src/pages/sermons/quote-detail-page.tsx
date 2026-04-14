import {ConfirmDialog} from '@/components/confirm-dialog'
import {Badge} from '@/components/ui/badge'
import {Button} from '@/components/ui/button'
import {Card, CardContent, CardHeader} from '@/components/ui/card'
import {PageSpinner} from '@/components/ui/spinner'
import {deleteQuote, getQuote} from '@/lib/quotes-api'
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'
import {ArrowLeft, Copy, Edit, Trash2} from 'lucide-react'
import {useState} from 'react'
import {useNavigate, useParams} from 'react-router-dom'
import {toast} from 'sonner'

import {QuoteFormDialog} from './quote-form-dialog'

const SOURCE_LABELS: Record<string, string> = {n8n: 'n8n', import: 'Import', manual: 'Manual'}

export function QuoteDetailPage() {
  const {id} = useParams<{id: string}>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  const {data: quote, isLoading} = useQuery({
    queryKey: ['quote', Number(id)],
    queryFn: () => getQuote(Number(id)),
    enabled: !!id,
  })

  const deleteMutation = useMutation({
    mutationFn: () => deleteQuote(Number(id)),
    onSuccess: () => {
      qc.invalidateQueries({queryKey: ['quotes']})
      toast.success('Quote deleted')
      navigate('/sermons/quotes')
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to delete'),
  })

  const copyQuote = () => {
    if (!quote) return
    navigator.clipboard.writeText(quote.quoteText).then(() => toast.success('Copied to clipboard'))
  }

  if (isLoading) return <PageSpinner />
  if (!quote) return <div className="p-6 text-muted-foreground">Quote not found.</div>

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-3xl">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => navigate('/sermons/quotes')}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold leading-tight">{quote.title}</h1>
              <p className="text-muted-foreground mt-1">
                {quote.author}
                {quote.dateDisplay && <span className="ml-2 text-sm">· {quote.dateDisplay}</span>}
              </p>
            </div>
            <Badge variant="outline" className="shrink-0 mt-1">
              {SOURCE_LABELS[quote.source] ?? quote.source}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {quote.summary && (
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-1">Summary</p>
              <p className="text-sm">{quote.summary}</p>
            </div>
          )}

          <div>
            <p className="text-sm font-medium text-muted-foreground mb-1">Quote</p>
            <blockquote className="border-l-4 border-border pl-4 whitespace-pre-wrap font-serif text-sm leading-relaxed">
              {quote.quoteText}
            </blockquote>
          </div>

          {quote.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {quote.tags.map((tag) => (
                <Badge key={tag} variant="secondary">
                  {tag}
                </Badge>
              ))}
            </div>
          )}

          {quote.createdAt && (
            <p className="text-xs text-muted-foreground">
              Added{' '}
              {new Date(quote.createdAt).toLocaleString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
              })}
            </p>
          )}
        </CardContent>
      </Card>

      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={copyQuote}>
          <Copy className="h-4 w-4 mr-1" /> Copy quote
        </Button>
        <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
          <Edit className="h-4 w-4 mr-1" /> Edit
        </Button>
        <Button variant="destructive" size="sm" onClick={() => setDeleteOpen(true)}>
          <Trash2 className="h-4 w-4 mr-1" /> Delete
        </Button>
      </div>

      <QuoteFormDialog open={editOpen} onOpenChange={setEditOpen} quote={quote} />
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete Quote"
        description={`Delete "${quote.title}"? This cannot be undone.`}
        confirmLabel="Delete"
        variant="destructive"
        loading={deleteMutation.isPending}
        onConfirm={() => deleteMutation.mutate()}
      />
    </div>
  )
}
