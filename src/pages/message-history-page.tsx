import {ConfirmDialog} from '@/components/confirm-dialog'
import {Badge} from '@/components/ui/badge'
import {Button} from '@/components/ui/button'
import {Checkbox} from '@/components/ui/checkbox'
import {SearchInput} from '@/components/ui/search-input'
import {PageSpinner} from '@/components/ui/spinner'
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from '@/components/ui/table'
import {Tooltip, TooltipContent, TooltipProvider, TooltipTrigger} from '@/components/ui/tooltip'
import {useDebouncedValue} from '@/hooks/use-debounced-value'
import {useSetToggle} from '@/hooks/use-set-toggle'
import {deleteDrafts, deleteMessages, duplicateDraft, duplicateMessage, fetchDrafts, fetchMessages} from '@/lib/api'
import type {Draft, Message} from '@/lib/api'
import {formatDateTime} from '@/lib/date'
import {queryKeys} from '@/lib/query-keys'
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'
import {Copy, Pencil, Plus, Trash2} from 'lucide-react'
import {useEffect, useMemo, useState} from 'react'
import {Link, useNavigate, useSearchParams} from 'react-router-dom'
import {toast} from 'sonner'

const statusColors: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  completed: 'default',
  sending: 'secondary',
  pending: 'outline',
  cancelled: 'destructive',
  scheduled: 'secondary',
  past_due: 'destructive',
}

function MessageGroupCell({msg}: {msg: Message}) {
  if (!msg.groupName) return <>{'\u2014'}</>
  const extraNames = msg.extraNames ?? []
  if (extraNames.length === 0) return <>{msg.groupName}</>
  return (
    <>
      {msg.groupName} +{' '}
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="underline decoration-dotted cursor-default">
              {extraNames.length} extra
            </span>
          </TooltipTrigger>
          <TooltipContent>
            <div className="text-sm">
              {extraNames.map((name, i) => (
                <div key={i}>{name}</div>
              ))}
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </>
  )
}

export function MessageHistoryPage() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const tabParam = searchParams.get('tab')
  const activeTab = (tabParam === 'drafts' ? 'drafts' : tabParam === 'scheduled' ? 'scheduled' : 'sent') as
    | 'sent'
    | 'scheduled'
    | 'drafts'
  const setActiveTab = (tab: 'sent' | 'scheduled' | 'drafts') =>
    setSearchParams(tab === 'sent' ? {} : {tab}, {replace: true})
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search, 250)

  // Sent messages state
  const {
    data: messages,
    isLoading: messagesLoading,
    refetch: refetchMessages,
  } = useQuery({
    queryKey: queryKeys.messages(debouncedSearch || undefined),
    queryFn: () => fetchMessages({search: debouncedSearch || undefined}),
  })
  // Refetch when switching tabs so status changes (e.g. scheduled → sent) are reflected
  useEffect(() => {
    refetchMessages()
  }, [activeTab, refetchMessages])
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [confirmOpen, setConfirmOpen] = useState(false)

  const sentMessages = useMemo(
    () =>
      messages?.filter(
        (m) => m.status === 'pending' || m.status === 'sending' || m.status === 'completed' || m.status === 'cancelled',
      ),
    [messages],
  )
  const scheduledMessages = useMemo(
    () =>
      messages
        ?.filter((m) => m.status === 'scheduled' || m.status === 'past_due')
        .sort((a, b) => (a.scheduledAt ?? '').localeCompare(b.scheduledAt ?? '')),
    [messages],
  )

  // Drafts state
  const {data: drafts, isLoading: draftsLoading} = useQuery({
    queryKey: queryKeys.drafts(debouncedSearch || undefined),
    queryFn: () => fetchDrafts({search: debouncedSearch || undefined}),
  })
  const [selectedDraftIds, setSelectedDraftIds] = useState<Set<number>>(new Set())
  const [draftConfirmOpen, setDraftConfirmOpen] = useState(false)

  const deleteMutation = useMutation({
    mutationFn: () => deleteMessages([...selectedIds]),
    onSuccess: (data) => {
      queryClient.invalidateQueries({queryKey: queryKeys.messages()})
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
      queryClient.invalidateQueries({queryKey: queryKeys.drafts()})
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
      queryClient.invalidateQueries({queryKey: queryKeys.drafts()})
      toast.success('Draft duplicated')
      navigate(`/messages/compose?draftId=${draft.id}`)
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to duplicate draft')
    },
  })

  const duplicateMessageMutation = useMutation({
    mutationFn: (id: number) => duplicateMessage(id),
    onSuccess: (draft) => {
      queryClient.invalidateQueries({queryKey: queryKeys.drafts()})
      toast.success('Duplicated as draft')
      navigate(`/messages/compose?draftId=${draft.id}`)
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to duplicate message')
    },
  })

  const toggleSelect = useSetToggle(setSelectedIds)

  const toggleAll = () => {
    if (!messages) return
    if (selectedIds.size === messages.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(messages.map((m) => m.id)))
    }
  }

  const toggleDraftSelect = useSetToggle(setSelectedDraftIds)

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
      const extraNames = draft.extraNames ?? []
      if (extraNames.length > 0) {
        return (
          <>
            {draft.groupName} ({count}) +{' '}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="underline decoration-dotted cursor-default">
                    {extraNames.length} extra
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  <div className="text-sm">
                    {extraNames.map((name, i) => (
                      <div key={i}>{name}</div>
                    ))}
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </>
        )
      }
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
    if (hasContent && hasRecipients && draft.scheduledAt) return {label: 'Scheduled', variant: 'secondary'}
    if (hasContent && hasRecipients) return {label: 'Ready', variant: 'default'}
    if (!hasContent && !hasRecipients) return {label: 'Empty', variant: 'destructive'}
    return {label: 'Incomplete', variant: 'outline'}
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-2xl font-bold">Messages</h2>
        <div className="flex gap-2 flex-wrap">
          {(activeTab === 'sent' || activeTab === 'scheduled') && selectedIds.size > 0 && (
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
              <kbd className="ml-2 text-[10px] font-mono opacity-60 hidden md:inline">
                {typeof navigator !== 'undefined' && navigator.platform.toUpperCase().includes('MAC') ? '⌘' : 'Ctrl+'}J
              </kbd>
            </Button>
          </Link>
        </div>
      </div>

      {/* Search */}
      <SearchInput
        placeholder={activeTab === 'drafts' ? 'Search drafts...' : 'Search messages...'}
        value={search}
        onChange={setSearch}
        containerClassName="sm:max-w-sm"
      />

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
          {sentMessages && sentMessages.length > 0 && (
            <Badge variant="secondary" className="text-xs">
              {sentMessages.length}
            </Badge>
          )}
        </button>
        <button
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 cursor-pointer ${
            activeTab === 'scheduled'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
          onClick={() => setActiveTab('scheduled')}
        >
          Scheduled
          {scheduledMessages && scheduledMessages.length > 0 && (
            <Badge variant="secondary" className="text-xs">
              {scheduledMessages.length}
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
            <PageSpinner />
          ) : (
            <div className="border rounded-md overflow-x-auto bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        checked={sentMessages && sentMessages.length > 0 && selectedIds.size === sentMessages.length}
                        onCheckedChange={toggleAll}
                      />
                    </TableHead>
                    <TableHead>Date Sent</TableHead>
                    <TableHead>Message</TableHead>
                    <TableHead>Recipients</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Group</TableHead>
                    <TableHead className="w-16">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sentMessages?.map((msg) => (
                    <TableRow
                      key={msg.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => navigate(`/messages/${msg.id}`)}
                    >
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Checkbox checked={selectedIds.has(msg.id)} onCheckedChange={() => toggleSelect(msg.id)} />
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {formatDateTime(msg.completedAt || msg.createdAt)}
                      </TableCell>
                      <TableCell className="max-w-xs truncate">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="truncate block">
                                {(msg.renderedPreview || msg.content).substring(0, 80)}
                                {(msg.renderedPreview || msg.content).length > 80 ? '...' : ''}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="bottom" className="max-w-sm whitespace-pre-wrap">
                              {msg.renderedPreview || msg.content}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </TableCell>
                      <TableCell>
                        <span className="text-green-600">{msg.sentCount}</span>
                        {msg.failedCount > 0 && <span className="text-red-500 ml-1">/ {msg.failedCount} failed</span>}
                        <span className="text-muted-foreground"> of {msg.totalRecipients}</span>
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusColors[msg.status] || 'outline'}>{msg.status}</Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground"><MessageGroupCell msg={msg} /></TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Duplicate as draft"
                          onClick={() => duplicateMessageMutation.mutate(msg.id)}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {sentMessages?.length === 0 && (
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

      {/* Scheduled Tab */}
      {activeTab === 'scheduled' && (
        <>
          {messagesLoading ? (
            <PageSpinner />
          ) : (
            <div className="border rounded-md overflow-x-auto bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        checked={
                          scheduledMessages &&
                          scheduledMessages.length > 0 &&
                          selectedIds.size === scheduledMessages.length
                        }
                        onCheckedChange={toggleAll}
                      />
                    </TableHead>
                    <TableHead>Scheduled For</TableHead>
                    <TableHead>Message</TableHead>
                    <TableHead>Recipients</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Group</TableHead>
                    <TableHead className="w-16">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {scheduledMessages?.map((msg) => (
                    <TableRow
                      key={msg.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => navigate(`/messages/${msg.id}`)}
                    >
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Checkbox checked={selectedIds.has(msg.id)} onCheckedChange={() => toggleSelect(msg.id)} />
                      </TableCell>
                      <TableCell className="text-sm whitespace-nowrap">
                        {msg.status === 'past_due' ? (
                          <span className="text-destructive">Past Due: {formatDateTime(msg.scheduledAt!)}</span>
                        ) : (
                          <span className="text-muted-foreground">{formatDateTime(msg.scheduledAt!)}</span>
                        )}
                      </TableCell>
                      <TableCell className="max-w-xs truncate">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="truncate block">
                                {(msg.renderedPreview || msg.content).substring(0, 80)}
                                {(msg.renderedPreview || msg.content).length > 80 ? '...' : ''}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="bottom" className="max-w-sm whitespace-pre-wrap">
                              {msg.renderedPreview || msg.content}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </TableCell>
                      <TableCell>
                        <span className="text-muted-foreground">{msg.totalRecipients}</span>
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusColors[msg.status] || 'outline'}>
                          {msg.status === 'past_due' ? 'past due' : msg.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground"><MessageGroupCell msg={msg} /></TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Edit scheduled message"
                            onClick={() => navigate(`/messages/compose?editMessageId=${msg.id}`)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Duplicate as draft"
                            onClick={() => duplicateMessageMutation.mutate(msg.id)}
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {scheduledMessages?.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                        No scheduled messages.
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
            <PageSpinner />
          ) : (
            <div className="border rounded-md overflow-x-auto bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        checked={drafts && drafts.length > 0 && selectedDraftIds.size === drafts.length}
                        onCheckedChange={toggleAllDrafts}
                      />
                    </TableHead>
                    <TableHead>Scheduled</TableHead>
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
                      className="cursor-pointer hover:bg-muted/50"
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
                        {draft.scheduledAt ? formatDateTime(draft.scheduledAt) : '—'}
                      </TableCell>
                      <TableCell className="max-w-xs truncate">
                        {draft.content ? (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="truncate block">
                                  {draft.name || (
                                    <>
                                      {(draft.renderedPreview || draft.content).substring(0, 80)}
                                      {(draft.renderedPreview || draft.content).length > 80 ? '...' : ''}
                                    </>
                                  )}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="bottom" className="max-w-sm whitespace-pre-wrap">
                                {draft.renderedPreview || draft.content}
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        ) : (
                          draft.name || <span className="text-muted-foreground italic">Empty draft</span>
                        )}
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
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
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
