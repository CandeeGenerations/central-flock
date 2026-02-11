import {Badge} from '@/components/ui/badge'
import {Button} from '@/components/ui/button'
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card'
import {Dialog, DialogContent, DialogHeader, DialogTitle} from '@/components/ui/dialog'
import {Progress} from '@/components/ui/progress'
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from '@/components/ui/table'
import {usePersistedState} from '@/hooks/use-persisted-state'
import {cancelMessage, fetchMessage} from '@/lib/api'
import {formatDateTime} from '@/lib/date'
import {formatFullName} from '@/lib/format'
import {queryKeys} from '@/lib/query-keys'
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'
import {AlertCircle, ArrowLeft, ChevronLeft, ChevronRight, Copy, XCircle} from 'lucide-react'
import {useState} from 'react'
import {useNavigate, useParams} from 'react-router-dom'
import {toast} from 'sonner'

type ErrorInfo = {name: string; error: string}

const recipientStatusColors: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  sent: 'default',
  pending: 'outline',
  failed: 'destructive',
  skipped: 'secondary',
}

export function MessageDetailPage() {
  const {id} = useParams<{id: string}>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [errorInfo, setErrorInfo] = useState<ErrorInfo | null>(null)
  const [page, setPage] = usePersistedState(`messageDetail.${id}.page`, 1)
  const pageSize = 25

  const {data: message, isLoading} = useQuery({
    queryKey: queryKeys.message(id!),
    queryFn: () => fetchMessage(Number(id)),
    enabled: !!id,
    refetchInterval: (query) => {
      const msg = query.state.data
      return msg?.status === 'sending' ? 2000 : false
    },
  })

  const cancelMutation = useMutation({
    mutationFn: () => cancelMessage(Number(id)),
    onSuccess: () => {
      queryClient.invalidateQueries({queryKey: queryKeys.message(id!)})
      toast.success('Message cancelled')
    },
  })

  if (isLoading) return <div className="p-6 text-muted-foreground">Loading...</div>
  if (!message) return <div className="p-6">Message not found</div>

  const progressPercent =
    message.totalRecipients > 0
      ? ((message.sentCount + message.failedCount + message.skippedCount) / message.totalRecipients) * 100
      : 0

  return (
    <div className="p-6 space-y-6 max-w-4xl">
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
        <Button
          variant="outline"
          size="sm"
          className="ml-auto"
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

      <Card>
        <CardHeader>
          <CardTitle>Message Content</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="whitespace-pre-wrap bg-muted p-4 rounded-md">{message.content}</p>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Group</span>
              <p>{message.groupName || '—'}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Date</span>
              <p>{formatDateTime(message.createdAt)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Progress */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Progress</CardTitle>
          {message.status === 'sending' && (
            <Button variant="destructive" size="sm" onClick={() => cancelMutation.mutate()}>
              <XCircle className="h-4 w-4 mr-1" />
              Cancel
            </Button>
          )}
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

      {/* Recipients */}
      <Card>
        <CardHeader>
          <CardTitle>Recipients</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Rendered Message</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {message.recipients.slice((page - 1) * pageSize, page * pageSize).map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{formatFullName(r)}</TableCell>
                  <TableCell className="text-muted-foreground">{r.phoneDisplay}</TableCell>
                  <TableCell>
                    <Badge variant={recipientStatusColors[r.status] || 'outline'}>{r.status}</Badge>
                  </TableCell>
                  <TableCell className="max-w-xs truncate text-sm">{r.renderedContent}</TableCell>
                  <TableCell>
                    {r.errorMessage && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-500 h-7 px-2"
                        onClick={() =>
                          setErrorInfo({
                            name: formatFullName(r),
                            error: r.errorMessage!,
                          })
                        }
                      >
                        <AlertCircle className="h-4 w-4 mr-1" />
                        Error
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {message.recipients.length > pageSize && (
            <div className="flex items-center justify-between pt-4">
              <span className="text-sm text-muted-foreground">
                Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, message.recipients.length)} of{' '}
                {message.recipients.length}
              </span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page * pageSize >= message.recipients.length}
                  onClick={() => setPage((p) => p + 1)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
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
          <pre className="text-sm text-red-500 whitespace-pre-wrap break-all bg-muted rounded-md p-3 overflow-auto max-h-64 font-mono">
            <code>{errorInfo?.error}</code>
          </pre>
        </DialogContent>
      </Dialog>
    </div>
  )
}
