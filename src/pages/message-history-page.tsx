import {ConfirmDialog} from '@/components/confirm-dialog'
import {Badge} from '@/components/ui/badge'
import {Button} from '@/components/ui/button'
import {Card, CardContent} from '@/components/ui/card'
import {Checkbox} from '@/components/ui/checkbox'
import {Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle} from '@/components/ui/dialog'
import {Input} from '@/components/ui/input'
import {Pagination} from '@/components/ui/pagination'
import {SearchInput} from '@/components/ui/search-input'
import {PageSpinner} from '@/components/ui/spinner'
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from '@/components/ui/table'
import {Tooltip, TooltipContent, TooltipProvider, TooltipTrigger} from '@/components/ui/tooltip'
import {useDebouncedValue} from '@/hooks/use-debounced-value'
import {useSetToggle} from '@/hooks/use-set-toggle'
import {
  createTemplate,
  deleteDrafts,
  deleteMessages,
  duplicateDraft,
  duplicateMessage,
  fetchDrafts,
  fetchMessages,
  fetchPeople,
} from '@/lib/api'
import type {Draft, Message, Person, TemplateVariable} from '@/lib/api'
import {formatDateTime} from '@/lib/date'
import {formatFullName} from '@/lib/format'
import {queryKeys} from '@/lib/query-keys'
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'
import {Copy, FileText, Pencil, Plus, Trash2} from 'lucide-react'
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

function MessageRecipientsCell({msg}: {msg: Message}) {
  if (msg.groupName) {
    const extraNames = msg.extraNames ?? []
    if (extraNames.length === 0) return <>{msg.groupName}</>
    return (
      <>
        {msg.groupName} +{' '}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="underline decoration-dotted cursor-default">{extraNames.length} extra</span>
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
  const names = msg.recipientNames ?? []
  if (names.length === 0) return <>{'\u2014'}</>
  if (names.length <= 2) return <>{names.join(', ')}</>
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="underline decoration-dotted cursor-default">
            {names[0]}, {names[1]} + {names.length - 2} more
          </span>
        </TooltipTrigger>
        <TooltipContent>
          <div className="text-sm">
            {names.map((name, i) => (
              <div key={i}>{name}</div>
            ))}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

export function MessageHistoryPage() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const tabParam = searchParams.get('tab')
  const activeTab = (
    tabParam === 'drafts'
      ? 'drafts'
      : tabParam === 'scheduled'
        ? 'scheduled'
        : tabParam === 'upcoming'
          ? 'upcoming'
          : 'sent'
  ) as 'sent' | 'scheduled' | 'drafts' | 'upcoming'
  const setActiveTab = (tab: 'sent' | 'scheduled' | 'drafts' | 'upcoming') =>
    setSearchParams(tab === 'sent' ? {} : {tab}, {replace: true})
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search, 250)
  const pageSize = 25
  const [sentPage, setSentPage] = useState(1)
  const [scheduledPage, setScheduledPage] = useState(1)
  const [draftsPage, setDraftsPage] = useState(1)
  const [upcomingPage, setUpcomingPage] = useState(1)

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
      messages
        ?.filter(
          (m) =>
            m.source !== 'birthday_scheduler' &&
            (m.status === 'pending' || m.status === 'sending' || m.status === 'completed' || m.status === 'cancelled'),
        )
        .sort((a, b) => (b.completedAt ?? b.createdAt).localeCompare(a.completedAt ?? a.createdAt)),
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

  // Birthdays & Anniversaries
  const {data: upcomingPeople} = useQuery({
    queryKey: [...queryKeys.people, 'upcoming'],
    queryFn: () => fetchPeople({limit: 1000}),
    enabled: activeTab === 'upcoming',
  })

  const sortedUpcomingEvents = useMemo(() => {
    if (!upcomingPeople) return []
    const today = new Date()
    const todayMonth = today.getMonth() + 1
    const todayDay = today.getDate()
    const thisYear = today.getFullYear()
    const todayDate = new Date(thisYear, todayMonth - 1, todayDay)

    const events: {
      person: Person
      type: 'birthday' | 'anniversary'
      month: number
      day: number
      year: number | null
      nextYear: number
      daysUntil: number
      age: number | null
    }[] = []

    for (const p of upcomingPeople.data) {
      if (p.birthMonth != null && p.birthDay != null) {
        let next = new Date(thisYear, p.birthMonth - 1, p.birthDay)
        if (next < todayDate) next = new Date(thisYear + 1, p.birthMonth - 1, p.birthDay)
        const nextYear = next.getFullYear()
        const daysUntil = Math.round((next.getTime() - todayDate.getTime()) / (1000 * 60 * 60 * 24))
        const age = p.birthYear ? nextYear - p.birthYear : null
        events.push({
          person: p,
          type: 'birthday',
          month: p.birthMonth,
          day: p.birthDay,
          year: p.birthYear,
          nextYear,
          daysUntil,
          age,
        })
      }
      if (p.anniversaryMonth != null && p.anniversaryDay != null) {
        let next = new Date(thisYear, p.anniversaryMonth - 1, p.anniversaryDay)
        if (next < todayDate) next = new Date(thisYear + 1, p.anniversaryMonth - 1, p.anniversaryDay)
        const nextYear = next.getFullYear()
        const daysUntil = Math.round((next.getTime() - todayDate.getTime()) / (1000 * 60 * 60 * 24))
        const years = p.anniversaryYear ? nextYear - p.anniversaryYear : null
        events.push({
          person: p,
          type: 'anniversary',
          month: p.anniversaryMonth,
          day: p.anniversaryDay,
          year: p.anniversaryYear,
          nextYear,
          daysUntil,
          age: years,
        })
      }
    }

    return events.sort((a, b) => a.daysUntil - b.daysUntil)
  }, [upcomingPeople])

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

  const [saveTemplateMsg, setSaveTemplateMsg] = useState<Message | null>(null)
  const [templateName, setTemplateName] = useState('')

  const saveAsTemplateMutation = useMutation({
    mutationFn: () => {
      const msg = saveTemplateMsg!
      const builtIn = new Set(['firstName', 'lastName', 'fullName'])
      const varNames = new Set<string>()
      for (const m of msg.content.matchAll(/\{\{(\w+)\}\}/g)) {
        if (!builtIn.has(m[1])) varNames.add(m[1])
      }

      let dateVarNames = new Set<string>()
      if (msg.templateState) {
        try {
          const ts = JSON.parse(msg.templateState) as {dateValues?: Record<string, string>}
          if (ts.dateValues) dateVarNames = new Set(Object.keys(ts.dateValues))
        } catch {
          /* ignore */
        }
      }

      const customVariables: TemplateVariable[] = []
      for (const name of varNames) {
        customVariables.push({name, type: dateVarNames.has(name) ? 'date' : 'text'})
      }

      return createTemplate({
        name: templateName.trim(),
        content: msg.content,
        customVariables: customVariables.length > 0 ? JSON.stringify(customVariables) : null,
      })
    },
    onSuccess: (template) => {
      queryClient.invalidateQueries({queryKey: queryKeys.templates()})
      setSaveTemplateMsg(null)
      setTemplateName('')
      toast.success('Template created')
      navigate(`/templates/${template.id}/edit`)
    },
    onError: (err: Error) => toast.error(err.message),
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
                  <span className="underline decoration-dotted cursor-default">{extraNames.length} extra</span>
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
              <kbd className="ml-2 pointer-events-none text-[10px] font-medium opacity-60 border rounded px-1 py-0.5 hidden md:inline">
                {typeof navigator !== 'undefined' && navigator.platform.toUpperCase().includes('MAC') ? '⌘' : 'Ctrl+'}J
              </kbd>
            </Button>
          </Link>
        </div>
      </div>

      {/* Search & Tabs */}
      <Card size="sm">
        <CardContent>
          <SearchInput
            placeholder={activeTab === 'drafts' ? 'Search drafts...' : 'Search messages...'}
            value={search}
            onChange={(v) => {
              setSearch(v)
              setSentPage(1)
              setScheduledPage(1)
              setDraftsPage(1)
              setUpcomingPage(1)
            }}
            containerClassName="sm:max-w-sm"
          />
        </CardContent>

        {/* Tab toggle */}
        <div className="flex border-b">
          <button
            className={`flex-1 px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center justify-center gap-2 cursor-pointer ${
              activeTab === 'sent'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => setActiveTab('sent')}
          >
            Sent
            {sentMessages && sentMessages.length > 0 && (
              <Badge variant="secondary" className="text-xs">
                {sentMessages.length}
              </Badge>
            )}
          </button>
          <button
            className={`flex-1 px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center justify-center gap-2 cursor-pointer ${
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
            className={`flex-1 px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center justify-center gap-2 cursor-pointer ${
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
          <button
            className={`flex-1 px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center justify-center gap-2 cursor-pointer ${
              activeTab === 'upcoming'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => setActiveTab('upcoming')}
          >
            Upcoming
            {sortedUpcomingEvents.length > 0 && (
              <Badge variant="secondary" className="text-xs">
                {sortedUpcomingEvents.length}
              </Badge>
            )}
          </button>
        </div>

        {/* Sent Messages Tab */}
        {activeTab === 'sent' && (
          <>
            {messagesLoading ? (
              <CardContent>
                <PageSpinner />
              </CardContent>
            ) : (
              <>
                <div className="overflow-x-auto border-t">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10">
                          <Checkbox
                            checked={
                              sentMessages && sentMessages.length > 0 && selectedIds.size === sentMessages.length
                            }
                            onCheckedChange={toggleAll}
                          />
                        </TableHead>
                        <TableHead>Date Sent</TableHead>
                        <TableHead>Message</TableHead>
                        <TableHead>Recipients</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Recipients</TableHead>
                        <TableHead className="w-16">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sentMessages?.slice((sentPage - 1) * pageSize, sentPage * pageSize).map((msg) => (
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
                            {msg.failedCount > 0 && (
                              <span className="text-red-500 ml-1">/ {msg.failedCount} failed</span>
                            )}
                            <span className="text-muted-foreground"> of {msg.totalRecipients}</span>
                          </TableCell>
                          <TableCell>
                            <Badge variant={statusColors[msg.status] || 'outline'}>{msg.status}</Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            <MessageRecipientsCell msg={msg} />
                          </TableCell>
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            <div className="flex">
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => duplicateMessageMutation.mutate(msg.id)}
                                    >
                                      <Copy className="h-4 w-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Duplicate as draft</TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button variant="ghost" size="icon" onClick={() => setSaveTemplateMsg(msg)}>
                                      <FileText className="h-4 w-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Save as template</TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            </div>
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
                <CardContent>
                  <Pagination
                    page={sentPage}
                    pageSize={pageSize}
                    total={sentMessages?.length || 0}
                    onPageChange={setSentPage}
                    noun="messages"
                  />
                </CardContent>
              </>
            )}
          </>
        )}

        {/* Scheduled Tab */}
        {activeTab === 'scheduled' && (
          <>
            {messagesLoading ? (
              <CardContent>
                <PageSpinner />
              </CardContent>
            ) : (
              <>
                <div className="overflow-x-auto border-t">
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
                        <TableHead>Recipients</TableHead>
                        <TableHead className="w-16">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {scheduledMessages?.slice((scheduledPage - 1) * pageSize, scheduledPage * pageSize).map((msg) => (
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
                          <TableCell className="text-muted-foreground">
                            <MessageRecipientsCell msg={msg} />
                          </TableCell>
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            <div className="flex gap-1">
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => navigate(`/messages/compose?editMessageId=${msg.id}`)}
                                    >
                                      <Pencil className="h-4 w-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Edit scheduled message</TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => duplicateMessageMutation.mutate(msg.id)}
                                    >
                                      <Copy className="h-4 w-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Duplicate as draft</TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
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
                <CardContent>
                  <Pagination
                    page={scheduledPage}
                    pageSize={pageSize}
                    total={scheduledMessages?.length || 0}
                    onPageChange={setScheduledPage}
                    noun="messages"
                  />
                </CardContent>
              </>
            )}
          </>
        )}

        {/* Drafts Tab */}
        {activeTab === 'drafts' && (
          <>
            {draftsLoading ? (
              <CardContent>
                <PageSpinner />
              </CardContent>
            ) : (
              <>
                <div className="overflow-x-auto border-t">
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
                      {drafts?.slice((draftsPage - 1) * pageSize, draftsPage * pageSize).map((draft) => (
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
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      duplicateDraftMutation.mutate(draft.id)
                                    }}
                                  >
                                    <Copy className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Duplicate draft</TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
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
                <CardContent>
                  <Pagination
                    page={draftsPage}
                    pageSize={pageSize}
                    total={drafts?.length || 0}
                    onPageChange={setDraftsPage}
                    noun="drafts"
                  />
                </CardContent>
              </>
            )}
          </>
        )}

        {/* Upcoming Tab */}
        {activeTab === 'upcoming' && (
          <>
            <div className="overflow-x-auto border-t">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Age / Years</TableHead>
                    <TableHead>Days Until</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedUpcomingEvents
                    .slice((upcomingPage - 1) * pageSize, upcomingPage * pageSize)
                    .map((event, i) => (
                      <TableRow
                        key={`${event.person.id}-${event.type}-${i}`}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => navigate(`/people/${event.person.id}`)}
                      >
                        <TableCell className="font-medium">{formatFullName(event.person)}</TableCell>
                        <TableCell>
                          <Badge variant={event.type === 'birthday' ? 'default' : 'secondary'}>
                            {event.type === 'birthday' ? 'Birthday' : 'Anniversary'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {new Date(2000, event.month - 1).toLocaleString('default', {month: 'long'})} {event.day},{' '}
                          {event.nextYear}
                        </TableCell>
                        <TableCell>{event.age != null ? event.age : '—'}</TableCell>
                        <TableCell>
                          {event.daysUntil === 0 ? (
                            <Badge variant="default">Today!</Badge>
                          ) : (
                            <span>
                              {event.daysUntil} day{event.daysUntil !== 1 ? 's' : ''}
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  {sortedUpcomingEvents.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                        No birthdays or anniversaries recorded. Add them on individual people pages.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
            <CardContent>
              <Pagination
                page={upcomingPage}
                pageSize={pageSize}
                total={sortedUpcomingEvents.length}
                onPageChange={setUpcomingPage}
                noun="events"
              />
            </CardContent>
          </>
        )}
      </Card>

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

      <Dialog
        open={!!saveTemplateMsg}
        onOpenChange={(open) => {
          if (!open) {
            setSaveTemplateMsg(null)
            setTemplateName('')
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save as Template</DialogTitle>
            <DialogDescription>Create a reusable template from this message.</DialogDescription>
          </DialogHeader>
          <div>
            <label className="text-sm font-medium mb-1.5 block">Template Name</label>
            <Input
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              placeholder="e.g. Event Invitation"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter' && templateName.trim()) saveAsTemplateMutation.mutate()
              }}
            />
          </div>
          <DialogFooter>
            <Button
              onClick={() => saveAsTemplateMutation.mutate()}
              disabled={!templateName.trim() || saveAsTemplateMutation.isPending}
            >
              {saveAsTemplateMutation.isPending ? 'Creating...' : 'Create Template'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
