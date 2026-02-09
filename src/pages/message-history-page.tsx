import {ConfirmDialog} from '@/components/confirm-dialog'
import {Badge} from '@/components/ui/badge'
import {Button} from '@/components/ui/button'
import {Checkbox} from '@/components/ui/checkbox'
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from '@/components/ui/table'
import {deleteDrafts, deleteMessages, duplicateDraft, fetchDrafts, fetchMessages} from '@/lib/api'
import type {Draft} from '@/lib/api'
import {formatDateTime} from '@/lib/date'
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'
import {Copy, Plus, Trash2} from 'lucide-react'
import {useState} from 'react'
import {Link, useNavigate} from 'react-router-dom'
import {toast} from 'sonner'

const statusColors: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  completed: 'default',
  sending: 'secondary',
  pending: 'outline',
  cancelled: 'destructive',
}

export function MessageHistoryPage() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<'sent' | 'drafts'>('sent')

  // Sent messages state
  const {data: messages, isLoading: messagesLoading} = useQuery({
    queryKey: ['messages'],
    queryFn: fetchMessages,
  })
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [confirmOpen, setConfirmOpen] = useState(false)

  // Drafts state
  const {data: drafts, isLoading: draftsLoading} = useQuery({
    queryKey: ['drafts'],
    queryFn: fetchDrafts,
  })
  const [selectedDraftIds, setSelectedDraftIds] = useState<Set<number>>(new Set())
  const [draftConfirmOpen, setDraftConfirmOpen] = useState(false)

  const deleteMutation = useMutation({
    mutationFn: () => deleteMessages([...selectedIds]),
    onSuccess: (data) => {
      queryClient.invalidateQueries({queryKey: ['messages']})
      toast.success(`Deleted ${data.deleted} message${data.deleted !== 1 ? 's' : ''}`)
      setSelectedIds(new Set())
      setConfirmOpen(false)
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to delete messages')
    },
  })

  const deleteDraftsMutation = useMutation({
    mutationFn: () => deleteDrafts([...selectedDraftIds]),
    onSuccess: (data) => {
      queryClient.invalidateQueries({queryKey: ['drafts']})
      toast.success(`Deleted ${data.deleted} draft${data.deleted !== 1 ? 's' : ''}`)
      setSelectedDraftIds(new Set())
      setDraftConfirmOpen(false)
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to delete drafts')
    },
  })

  const duplicateDraftMutation = useMutation({
    mutationFn: (id: number) => duplicateDraft(id),
    onSuccess: (draft) => {
      queryClient.invalidateQueries({queryKey: ['drafts']})
      toast.success('Draft duplicated')
      navigate(`/messages/compose?draftId=${draft.id}`)
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to duplicate draft')
    },
  })

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    if (!messages) return
    if (selectedIds.size === messages.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(messages.map((m) => m.id)))
    }
  }

  const toggleDraftSelect = (id: number) => {
    setSelectedDraftIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAllDrafts = () => {
    if (!drafts) return
    if (selectedDraftIds.size === drafts.length) {
      setSelectedDraftIds(new Set())
    } else {
      setSelectedDraftIds(new Set(drafts.map((d) => d.id)))
    }
  }

  const getDraftRecipientInfo = (draft: Draft) => {
    const count = draft.recipientCount ?? 0
    if (draft.recipientMode === 'group') {
      if (!draft.groupName) return 'No group selected'
      return `${draft.groupName} (${count})`
    }
    if (count > 0) {
      return `${count} individual${count !== 1 ? 's' : ''}`
    }
    return 'No recipients'
  }

  const getDraftStatus = (
    draft: Draft,
  ): {
    label: string
    variant: 'default' | 'secondary' | 'outline' | 'destructive'
  } => {
    const hasContent = !!draft.content?.trim()
    const hasRecipients =
      (draft.recipientMode === 'group' && !!draft.groupId) ||
      (draft.recipientMode === 'individual' && !!draft.selectedIndividualIds)
    if (hasContent && hasRecipients) return {label: 'Ready', variant: 'default'}
    if (!hasContent && !hasRecipients) return {label: 'Empty', variant: 'destructive'}
    return {label: 'Incomplete', variant: 'outline'}
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Messages</h2>
        <div className="flex gap-2">
          {activeTab === 'sent' && selectedIds.size > 0 && (
            <Button variant="destructive" onClick={() => setConfirmOpen(true)}>
              <Trash2 className="h-4 w-4 mr-2" />
              Delete ({selectedIds.size})
            </Button>
          )}
          {activeTab === 'drafts' && selectedDraftIds.size > 0 && (
            <Button variant="destructive" onClick={() => setDraftConfirmOpen(true)}>
              <Trash2 className="h-4 w-4 mr-2" />
              Delete ({selectedDraftIds.size})
            </Button>
          )}
          <Link to="/messages/compose">
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Compose
            </Button>
          </Link>
        </div>
      </div>

      {/* Tab toggle */}
      <div className="flex gap-1 border-b">
        <button
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 cursor-pointer ${
            activeTab === 'sent'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
          onClick={() => setActiveTab('sent')}
        >
          Sent Messages
          {messages && messages.length > 0 && (
            <Badge variant="secondary" className="text-xs">
              {messages.length}
            </Badge>
          )}
        </button>
        <button
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 cursor-pointer ${
            activeTab === 'drafts'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
          onClick={() => setActiveTab('drafts')}
        >
          Drafts
          {drafts && drafts.length > 0 && (
            <Badge variant="secondary" className="text-xs">
              {drafts.length}
            </Badge>
          )}
        </button>
      </div>

      {/* Sent Messages Tab */}
      {activeTab === 'sent' && (
        <>
          {messagesLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading...</div>
          ) : (
            <div className="border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        checked={messages && messages.length > 0 && selectedIds.size === messages.length}
                        onCheckedChange={toggleAll}
                      />
                    </TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Message</TableHead>
                    <TableHead>Recipients</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Group</TableHead>
                    <TableHead className="w-16">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {messages?.map((msg) => (
                    <TableRow key={msg.id}>
                      <TableCell>
                        <Checkbox checked={selectedIds.has(msg.id)} onCheckedChange={() => toggleSelect(msg.id)} />
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {formatDateTime(msg.createdAt)}
                      </TableCell>
                      <TableCell className="max-w-xs truncate">
                        <Link to={`/messages/${msg.id}`} className="hover:underline">
                          {msg.content.substring(0, 80)}
                          {msg.content.length > 80 ? '...' : ''}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <span className="text-green-600">{msg.sentCount}</span>
                        {msg.failedCount > 0 && <span className="text-red-500 ml-1">/ {msg.failedCount} failed</span>}
                        <span className="text-muted-foreground"> of {msg.totalRecipients}</span>
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusColors[msg.status] || 'outline'}>{msg.status}</Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{msg.groupName || '—'}</TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Duplicate as draft"
                          onClick={() =>
                            navigate('/messages/compose', {
                              state: {
                                content: msg.content,
                                groupId: msg.groupId,
                              },
                            })
                          }
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {messages?.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                        No messages sent yet.{' '}
                        <Link to="/messages/compose" className="underline">
                          Compose one
                        </Link>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </>
      )}

      {/* Drafts Tab */}
      {activeTab === 'drafts' && (
        <>
          {draftsLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading...</div>
          ) : (
            <div className="border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        checked={drafts && drafts.length > 0 && selectedDraftIds.size === drafts.length}
                        onCheckedChange={toggleAllDrafts}
                      />
                    </TableHead>
                    <TableHead>Last Updated</TableHead>
                    <TableHead>Message</TableHead>
                    <TableHead>Recipients</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-16">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {drafts?.map((draft) => (
                    <TableRow
                      key={draft.id}
                      className="cursor-pointer"
                      onClick={(e) => {
                        // Don't navigate when clicking checkbox
                        if ((e.target as HTMLElement).closest('button')) return
                        navigate(`/messages/compose?draftId=${draft.id}`)
                      }}
                    >
                      <TableCell>
                        <Checkbox
                          checked={selectedDraftIds.has(draft.id)}
                          onCheckedChange={() => toggleDraftSelect(draft.id)}
                        />
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {formatDateTime(draft.updatedAt)}
                      </TableCell>
                      <TableCell className="max-w-xs truncate">
                        {draft.name ||
                          (draft.content ? (
                            <>
                              {draft.content.substring(0, 80)}
                              {draft.content.length > 80 ? '...' : ''}
                            </>
                          ) : (
                            <span className="text-muted-foreground italic">Empty draft</span>
                          ))}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{getDraftRecipientInfo(draft)}</TableCell>
                      <TableCell>
                        <Badge variant={getDraftStatus(draft).variant}>{getDraftStatus(draft).label}</Badge>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Duplicate draft"
                          onClick={(e) => {
                            e.stopPropagation()
                            duplicateDraftMutation.mutate(draft.id)
                          }}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {drafts?.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                        No drafts saved yet.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </>
      )}

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`Delete ${selectedIds.size} message${selectedIds.size !== 1 ? 's' : ''}?`}
        description="This will permanently delete the selected messages and all associated recipient data. This action cannot be undone."
        confirmLabel="Delete"
        variant="destructive"
        loading={deleteMutation.isPending}
        onConfirm={() => deleteMutation.mutate()}
      />
      <ConfirmDialog
        open={draftConfirmOpen}
        onOpenChange={setDraftConfirmOpen}
        title={`Delete ${selectedDraftIds.size} draft${selectedDraftIds.size !== 1 ? 's' : ''}?`}
        description="This will permanently delete the selected drafts. This action cannot be undone."
        confirmLabel="Delete"
        variant="destructive"
        loading={deleteDraftsMutation.isPending}
        onConfirm={() => deleteDraftsMutation.mutate()}
      />
    </div>
  )
}
