import {Badge} from '@/components/ui/badge'
import {Button} from '@/components/ui/button'
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card'
import {Dialog, DialogContent, DialogHeader, DialogTitle} from '@/components/ui/dialog'
import {Progress} from '@/components/ui/progress'
import {SearchInput} from '@/components/ui/search-input'
import {InlineSpinner} from '@/components/ui/spinner'
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from '@/components/ui/table'
import {useDebouncedValue} from '@/hooks/use-debounced-value'
import {usePersistedState} from '@/hooks/use-persisted-state'
import {cancelMessage, fetchMessage, resumeMessage, sendNowMessage} from '@/lib/api'
import {formatDateTime} from '@/lib/date'
import {formatFullName} from '@/lib/format'
import {queryKeys} from '@/lib/query-keys'
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'
import {
  AlertCircle,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Copy,
  ExternalLink,
  Pencil,
  Play,
  XCircle,
} from 'lucide-react'
import {useMemo, useState} from 'react'
import {Link, useNavigate, useParams} from 'react-router-dom'
import {toast} from 'sonner'

type ErrorInfo = {name: string; error: string}

type Recipient = {
  id: number
  personId: number
  firstName: string | null
  lastName: string | null
  phoneDisplay: string | null
  status: string
  renderedContent: string | null
  errorMessage?: string | null
}

const recipientStatusColors: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  sent: 'default',
  pending: 'outline',
  failed: 'destructive',
  skipped: 'secondary',
}

function RecipientsCard({
  recipients,
  search,
  debouncedSearch,
  onSearchChange,
  page,
  pageSize,
  onPageChange,
  onErrorClick,
}: {
  recipients: Recipient[]
  search: string
  debouncedSearch: string
  onSearchChange: (v: string) => void
  page: number
  pageSize: number
  onPageChange: (fn: (p: number) => number) => void
  onErrorClick: (info: ErrorInfo) => void
}) {
  const [selectedRecipient, setSelectedRecipient] = useState<Recipient | null>(null)

  const filtered = useMemo(() => {
    if (!debouncedSearch) return recipients
    const q = debouncedSearch.toLowerCase()
    return recipients.filter((r) => formatFullName(r).toLowerCase().includes(q) || (r.phoneDisplay || '').includes(q))
  }, [recipients, debouncedSearch])

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recipients</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <SearchInput
          placeholder="Search recipients..."
          value={search}
          onChange={onSearchChange}
          containerClassName="sm:max-w-sm"
        />
        <div className="border rounded-lg bg-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.slice((page - 1) * pageSize, page * pageSize).map((r) => (
                <TableRow
                  key={r.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => setSelectedRecipient(r)}
                >
                  <TableCell className="font-medium">{formatFullName(r)}</TableCell>
                  <TableCell className="text-muted-foreground">{r.phoneDisplay}</TableCell>
                  <TableCell>
                    <Badge variant={recipientStatusColors[r.status] || 'outline'}>{r.status}</Badge>
                  </TableCell>
                  <TableCell>
                    {r.errorMessage && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-500 h-7 px-2"
                        onClick={(e) => {
                          e.stopPropagation()
                          onErrorClick({
                            name: formatFullName(r),
                            error: r.errorMessage!,
                          })
                        }}
                      >
                        <AlertCircle className="h-4 w-4 mr-1" />
                        Error
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-6">
                    {recipients.length === 0 ? 'No recipients' : 'No recipients match your search.'}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        {filtered.length > pageSize && (
          <div className="flex items-center justify-between pt-4">
            <span className="text-sm text-muted-foreground">
              Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, filtered.length)} of {filtered.length}
            </span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPageChange((p) => p - 1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page * pageSize >= filtered.length}
                onClick={() => onPageChange((p) => p + 1)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </CardContent>

      <Dialog open={!!selectedRecipient} onOpenChange={(open) => !open && setSelectedRecipient(null)}>
        {selectedRecipient && (
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{formatFullName(selectedRecipient)}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground mb-0.5">Phone</p>
                  <p>{selectedRecipient.phoneDisplay || '—'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground mb-0.5">Status</p>
                  <Badge variant={recipientStatusColors[selectedRecipient.status] || 'outline'}>
                    {selectedRecipient.status}
                  </Badge>
                </div>
              </div>

              {selectedRecipient.renderedContent && (
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Sent Message</p>
                  <p className="text-sm whitespace-pre-wrap bg-muted p-3 rounded-lg">
                    {selectedRecipient.renderedContent}
                  </p>
                </div>
              )}

              {selectedRecipient.errorMessage && (
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Error</p>
                  <pre className="text-sm text-red-500 whitespace-pre-wrap break-all bg-muted rounded-lg p-3 overflow-auto max-h-32 font-mono">
                    <code>{selectedRecipient.errorMessage}</code>
                  </pre>
                </div>
              )}

              <Link
                to={`/people/${selectedRecipient.personId}`}
                className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                View Person Profile
              </Link>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </Card>
  )
}

export function MessageDetailPage() {
  const {id} = useParams<{id: string}>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [errorInfo, setErrorInfo] = useState<ErrorInfo | null>(null)
  const [recipientSearch, setRecipientSearch] = useState('')
  const debouncedRecipientSearch = useDebouncedValue(recipientSearch, 250)
  const [page, setPage] = usePersistedState(`messageDetail.${id}.page`, 1)
  const pageSize = 25

  const {data: message, isLoading} = useQuery({
    queryKey: queryKeys.message(id!),
    queryFn: () => fetchMessage(Number(id)),
    enabled: !!id,
    refetchInterval: (query) => {
      const msg = query.state.data
      return msg?.status === 'sending' || msg?.status === 'scheduled' ? 2000 : false
    },
  })

  const cancelMutation = useMutation({
    mutationFn: () => cancelMessage(Number(id)),
    onSuccess: (data) => {
      queryClient.invalidateQueries({queryKey: queryKeys.messages()})
      if (data.draftId) {
        queryClient.invalidateQueries({queryKey: queryKeys.drafts()})
        toast.success('Scheduled message moved to drafts')
        navigate(`/messages/compose?draftId=${data.draftId}`)
      } else {
        queryClient.invalidateQueries({queryKey: queryKeys.message(id!)})
        toast.success('Message cancelled')
      }
    },
  })

  const sendNowMutation = useMutation({
    mutationFn: () => sendNowMessage(Number(id)),
    onSuccess: () => {
      queryClient.invalidateQueries({queryKey: queryKeys.message(id!)})
      queryClient.invalidateQueries({queryKey: queryKeys.messages()})
      toast.success('Message sending started')
    },
  })

  const resumeMutation = useMutation({
    mutationFn: () => resumeMessage(Number(id)),
    onSuccess: () => {
      queryClient.invalidateQueries({queryKey: queryKeys.message(id!)})
      queryClient.invalidateQueries({queryKey: queryKeys.messages()})
      toast.success('Message sending resumed')
    },
  })

  if (isLoading) return <InlineSpinner />
  if (!message) return <div className="p-6">Message not found</div>

  const totalWithSkipped = message.totalRecipients + message.skippedCount
  const progressPercent =
    totalWithSkipped > 0
      ? ((message.sentCount + message.failedCount + message.skippedCount) / totalWithSkipped) * 100
      : 0

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-4xl">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/messages')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h2 className="text-2xl font-bold">Message Detail</h2>
          <Badge
            variant={
              message.status === 'completed' ? 'default' : message.status === 'cancelled' ? 'destructive' : 'secondary'
            }
          >
            {message.status}
          </Badge>
        </div>
        <div className="flex items-center gap-2 sm:ml-auto pl-12 sm:pl-0">
          {(message.status === 'scheduled' || message.status === 'past_due') && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate(`/messages/compose?editMessageId=${message.id}`)}
            >
              <Pencil className="h-4 w-4 mr-1" />
              Edit
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              navigate('/messages/compose', {
                state: {
                  content: message.content,
                  groupId: message.groupId,
                  excludeIds: message.recipients.filter((r) => r.status === 'skipped').map((r) => r.personId),
                },
              })
            }
          >
            <Copy className="h-4 w-4 mr-1" />
            Duplicate
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Message Content</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="whitespace-pre-wrap bg-muted p-4 rounded-lg">{message.renderedPreview || message.content}</p>
          {message.renderedPreview && message.renderedPreview !== message.content && (
            <details className="text-sm">
              <summary className="text-muted-foreground cursor-pointer">Template</summary>
              <p className="whitespace-pre-wrap bg-muted p-4 rounded-lg mt-1">{message.content}</p>
            </details>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Group</span>
              <p>{message.groupName || '—'}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Date</span>
              <p>{formatDateTime(message.createdAt)}</p>
            </div>
            {message.scheduledAt && (
              <div>
                <span className="text-muted-foreground">Scheduled For</span>
                <p>{formatDateTime(message.scheduledAt)}</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Actions for scheduled/past_due */}
      {(message.status === 'scheduled' || message.status === 'past_due') && (
        <div className="flex gap-2">
          <Button
            variant="destructive"
            size="sm"
            onClick={() => cancelMutation.mutate()}
            disabled={cancelMutation.isPending}
          >
            <XCircle className="h-4 w-4 mr-1" />
            Cancel
          </Button>
          {message.status === 'past_due' && (
            <Button size="sm" onClick={() => sendNowMutation.mutate()} disabled={sendNowMutation.isPending}>
              <Play className="h-4 w-4 mr-1" />
              Send Now
            </Button>
          )}
        </div>
      )}

      {/* Progress — hidden for scheduled/past_due */}
      {message.status !== 'scheduled' && message.status !== 'past_due' && (
        <Card>
          <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <CardTitle>Progress</CardTitle>
            <div className="flex flex-wrap gap-2">
              {message.status === 'sending' && (
                <>
                  <Button size="sm" onClick={() => resumeMutation.mutate()} disabled={resumeMutation.isPending}>
                    <Play className="h-4 w-4 mr-1" />
                    Resume
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => cancelMutation.mutate()}
                    disabled={cancelMutation.isPending}
                  >
                    <XCircle className="h-4 w-4 mr-1" />
                    Cancel
                  </Button>
                </>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <Progress value={progressPercent} />
            <div className="flex gap-6 text-sm">
              <span className="text-green-600">Sent: {message.sentCount}</span>
              <span className="text-red-500">Failed: {message.failedCount}</span>
              <span className="text-muted-foreground">Skipped: {message.skippedCount}</span>
              <span>Total: {message.totalRecipients}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recipients — hidden for scheduled/past_due */}
      {message.status !== 'scheduled' && message.status !== 'past_due' && (
        <RecipientsCard
          recipients={message.recipients}
          search={recipientSearch}
          debouncedSearch={debouncedRecipientSearch}
          onSearchChange={(v) => {
            setRecipientSearch(v)
            setPage(1)
          }}
          page={page}
          pageSize={pageSize}
          onPageChange={setPage}
          onErrorClick={setErrorInfo}
        />
      )}
      <Dialog
        open={!!errorInfo}
        onOpenChange={(open) => {
          if (!open) setErrorInfo(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Error — {errorInfo?.name}</DialogTitle>
          </DialogHeader>
          <pre className="text-sm text-red-500 whitespace-pre-wrap break-all bg-muted rounded-lg p-3 overflow-auto max-h-64 font-mono">
            <code>{errorInfo?.error}</code>
          </pre>
        </DialogContent>
      </Dialog>
    </div>
  )
}
