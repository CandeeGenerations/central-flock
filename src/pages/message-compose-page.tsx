import {ConfirmDialog} from '@/components/confirm-dialog'
import {Badge} from '@/components/ui/badge'
import {Button} from '@/components/ui/button'
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card'
import {DateTimePicker} from '@/components/ui/date-time-picker'
import {Input} from '@/components/ui/input'
import {Label} from '@/components/ui/label'
import {Progress} from '@/components/ui/progress'
import {SearchInput} from '@/components/ui/search-input'
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select'
import {Separator} from '@/components/ui/separator'
import {Textarea} from '@/components/ui/textarea'
import {
  createDraft,
  deleteDrafts,
  fetchDraft,
  fetchGroup,
  fetchGroups,
  fetchPeople,
  sendMessage,
  updateDraft,
} from '@/lib/api'
import {fetchMessageStatus} from '@/lib/api'
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'
import {ArrowLeft, Eye, Save, Send, Trash2} from 'lucide-react'
import {useMemo, useState} from 'react'
import {useLocation, useNavigate, useSearchParams} from 'react-router-dom'
import {toast} from 'sonner'

export function MessageComposePage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()
  const dupState = location.state as {
    content?: string
    groupId?: number
    excludeIds?: number[]
  } | null

  const draftIdParam = searchParams.get('draftId')
  const presetGroupId = searchParams.get('groupId') || (dupState?.groupId ? String(dupState.groupId) : '')
  const presetRecipientId = searchParams.get('recipientId')

  const [recipientMode, setRecipientMode] = useState<'group' | 'individual'>(presetRecipientId ? 'individual' : 'group')
  const [selectedGroupId, setSelectedGroupId] = useState(presetGroupId || '')
  const [content, setContent] = useState(dupState?.content || '')
  const [excludeIds, setExcludeIds] = useState<Set<number>>(() => new Set(dupState?.excludeIds || []))
  const [excludeSearch, setExcludeSearch] = useState('')
  const [batchSize, setBatchSize] = useState(1)
  const [sendConfirmOpen, setSendConfirmOpen] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [batchDelayMs, setBatchDelayMs] = useState(5000)
  const [scheduledAt, setScheduledAt] = useState('')
  const [sending, setSending] = useState(false)
  const [sendProgress, setSendProgress] = useState<{
    messageId: number
    sentCount: number
    failedCount: number
    skippedCount: number
    totalRecipients: number
    status: string
  } | null>(null)

  const [currentDraftId, setCurrentDraftId] = useState<number | null>(draftIdParam ? Number(draftIdParam) : null)
  const [individualSearch, setIndividualSearch] = useState('')
  const [selectedIndividualIds, setSelectedIndividualIds] = useState<Set<number>>(() => {
    return presetRecipientId ? new Set([Number(presetRecipientId)]) : new Set()
  })

  const {data: draftData} = useQuery({
    queryKey: ['draft', currentDraftId],
    queryFn: () => fetchDraft(currentDraftId!),
    enabled: !!currentDraftId,
  })

  // Populate form from loaded draft (render-time state adjustment — React-recommended pattern)
  const [loadedDraftId, setLoadedDraftId] = useState<number | null>(null)
  if (draftData && loadedDraftId !== draftData.id) {
    setLoadedDraftId(draftData.id)
    setContent(draftData.content || '')
    setRecipientMode(draftData.recipientMode || 'group')
    setSelectedGroupId(draftData.groupId ? String(draftData.groupId) : '')
    setBatchSize(draftData.batchSize ?? 1)
    setBatchDelayMs(draftData.batchDelayMs ?? 5000)
    setScheduledAt(draftData.scheduledAt || '')
    if (draftData.excludeIds) {
      try {
        setExcludeIds(new Set(JSON.parse(draftData.excludeIds)))
      } catch {
        /* ignore */
      }
    }
    if (draftData.selectedIndividualIds) {
      try {
        setSelectedIndividualIds(new Set(JSON.parse(draftData.selectedIndividualIds)))
      } catch {
        /* ignore */
      }
    }
  }

  const {data: groups} = useQuery({queryKey: ['groups'], queryFn: fetchGroups})
  const {data: groupDetail} = useQuery({
    queryKey: ['group', selectedGroupId],
    queryFn: () => fetchGroup(Number(selectedGroupId)),
    enabled: recipientMode === 'group' && !!selectedGroupId,
  })
  const {data: allPeople} = useQuery({
    queryKey: ['people', 'all'],
    queryFn: () => fetchPeople({limit: 1000}),
    enabled: recipientMode === 'individual',
  })

  const recipients = useMemo(() => {
    if (recipientMode === 'group' && groupDetail) {
      return groupDetail.members.filter((m) => !excludeIds.has(m.id))
    }
    if (recipientMode === 'individual' && allPeople) {
      return allPeople.data.filter((p) => selectedIndividualIds.has(p.id))
    }
    return []
  }, [recipientMode, groupDetail, allPeople, excludeIds, selectedIndividualIds])

  const allRecipientIds = useMemo(() => {
    if (recipientMode === 'group' && groupDetail) {
      return groupDetail.members.map((m) => m.id)
    }
    return [...selectedIndividualIds]
  }, [recipientMode, groupDetail, selectedIndividualIds])

  const previewPerson = recipients[0]
  const renderedPreview = previewPerson
    ? content
        .replace(/\{\{firstName\}\}/g, previewPerson.firstName || '')
        .replace(/\{\{lastName\}\}/g, previewPerson.lastName || '')
        .replace(/\{\{fullName\}\}/g, [previewPerson.firstName, previewPerson.lastName].filter(Boolean).join(' '))
    : content

  const charCount = content.length

  const sendMutation = useMutation({
    mutationFn: () =>
      sendMessage({
        content,
        recipientIds: allRecipientIds,
        excludeIds: [...excludeIds],
        groupId: recipientMode === 'group' ? Number(selectedGroupId) : undefined,
        batchSize,
        batchDelayMs,
      }),
    onSuccess: async (data) => {
      // Auto-delete draft after successful send
      if (currentDraftId) {
        try {
          await deleteDrafts([currentDraftId])
          queryClient.invalidateQueries({queryKey: ['drafts']})
        } catch {
          /* ignore */
        }
      }
      setSending(true)
      const messageId = data.messageId
      // Poll for progress
      const poll = setInterval(async () => {
        try {
          const status = await fetchMessageStatus(messageId)
          setSendProgress({messageId, ...status})
          if (status.status === 'completed' || status.status === 'cancelled') {
            clearInterval(poll)
            setSending(false)
            toast.success(`Message sending complete: ${status.sentCount} sent, ${status.failedCount} failed`)
          }
        } catch {
          clearInterval(poll)
          setSending(false)
        }
      }, 1000)
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const getDraftFormData = () => ({
    content,
    recipientMode,
    groupId: recipientMode === 'group' && selectedGroupId ? Number(selectedGroupId) : null,
    selectedIndividualIds: recipientMode === 'individual' ? JSON.stringify([...selectedIndividualIds]) : null,
    excludeIds: excludeIds.size > 0 ? JSON.stringify([...excludeIds]) : null,
    batchSize,
    batchDelayMs,
    scheduledAt: scheduledAt || null,
  })

  const saveDraftMutation = useMutation({
    mutationFn: async () => {
      const data = getDraftFormData()
      if (currentDraftId) {
        return updateDraft(currentDraftId, data)
      }
      return createDraft(data)
    },
    onSuccess: (draft) => {
      if (!currentDraftId) {
        setCurrentDraftId(draft.id)
        setSearchParams({draftId: String(draft.id)}, {replace: true})
      }
      queryClient.invalidateQueries({queryKey: ['drafts']})
      toast.success('Draft saved')
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const handleSend = () => {
    if (!content.trim()) {
      toast.error('Message content is required')
      return
    }
    if (recipients.length === 0) {
      toast.error('No recipients selected')
      return
    }
    setSendConfirmOpen(true)
  }

  const toggleExclude = (id: number) => {
    setExcludeIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleIndividual = (id: number) => {
    setSelectedIndividualIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const progressPercent = sendProgress
    ? ((sendProgress.sentCount + sendProgress.failedCount + sendProgress.skippedCount) / sendProgress.totalRecipients) *
      100
    : 0

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate(currentDraftId ? '/messages?tab=drafts' : '/messages')}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h2 className="text-2xl font-bold">Compose Message</h2>
      </div>

      {/* Sending progress overlay */}
      {sending && sendProgress && (
        <Card className="border-primary">
          <CardHeader>
            <CardTitle>Sending in progress...</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Progress value={progressPercent} />
            <div className="flex gap-4 text-sm">
              <span>Sent: {sendProgress.sentCount}</span>
              <span>Failed: {sendProgress.failedCount}</span>
              <span>Total: {sendProgress.totalRecipients}</span>
            </div>
            <Button variant="outline" onClick={() => navigate(`/messages/${sendProgress.messageId}`)}>
              View Details
            </Button>
          </CardContent>
        </Card>
      )}

      {!sending && (
        <>
          {/* Recipient selection */}
          <div className="space-y-2">
            <Label>Recipients</Label>
            <Select value={recipientMode} onValueChange={(v) => setRecipientMode(v as 'group' | 'individual')}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="group">Send to Group</SelectItem>
                <SelectItem value="individual">Select Individuals</SelectItem>
              </SelectContent>
            </Select>

            {recipientMode === 'group' && (
              <Select value={selectedGroupId} onValueChange={setSelectedGroupId}>
                <SelectTrigger className="w-72">
                  <SelectValue placeholder="Choose a group..." />
                </SelectTrigger>
                <SelectContent>
                  {groups?.map((g) => (
                    <SelectItem key={g.id} value={String(g.id)}>
                      {g.name} ({g.memberCount})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {recipientMode === 'individual' && allPeople && (
              <div className="space-y-2">
                <SearchInput
                  placeholder="Search people to add..."
                  value={individualSearch}
                  onChange={setIndividualSearch}
                />
                {individualSearch && (
                  <div className="border rounded-md max-h-36 overflow-auto p-2 space-y-1">
                    {(() => {
                      const q = individualSearch.toLowerCase()
                      const results = allPeople.data.filter((p) => {
                        if (selectedIndividualIds.has(p.id)) return false
                        const name = [p.firstName, p.lastName].filter(Boolean).join(' ').toLowerCase()
                        const phone = (p.phoneDisplay || p.phoneNumber || '').toLowerCase()
                        return name.includes(q) || phone.includes(q)
                      })
                      if (results.length === 0) {
                        return (
                          <p className="text-sm text-muted-foreground text-center py-3">No matching people found</p>
                        )
                      }
                      return results.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          className="flex items-center gap-2 w-full px-2 py-1 rounded hover:bg-accent hover:text-accent-foreground cursor-pointer text-sm text-left"
                          onClick={() => {
                            toggleIndividual(p.id)
                            setIndividualSearch('')
                          }}
                        >
                          <span>
                            {[p.firstName, p.lastName].filter(Boolean).join(' ') || (
                              <em className="text-muted-foreground">Unnamed</em>
                            )}
                          </span>
                          <span className="text-muted-foreground ml-auto">{p.phoneDisplay}</span>
                        </button>
                      ))
                    })()}
                  </div>
                )}
                {selectedIndividualIds.size > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {allPeople.data
                      .filter((p) => selectedIndividualIds.has(p.id))
                      .map((p) => (
                        <Badge
                          key={p.id}
                          variant="secondary"
                          className="gap-1 cursor-pointer hover:bg-destructive/20"
                          onClick={() => toggleIndividual(p.id)}
                        >
                          {[p.firstName, p.lastName].filter(Boolean).join(' ') || 'Unnamed'}
                          <span className="text-muted-foreground">&times;</span>
                        </Badge>
                      ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Exclusion list for group mode */}
          {recipientMode === 'group' && groupDetail && groupDetail.members.length > 0 && (
            <div className="space-y-2">
              <Label>Exclude from send (optional)</Label>
              <SearchInput
                placeholder="Search members to exclude..."
                value={excludeSearch}
                onChange={setExcludeSearch}
              />
              {excludeSearch && (
                <div className="border rounded-md max-h-36 overflow-auto p-2 space-y-1">
                  {(() => {
                    const q = excludeSearch.toLowerCase()
                    const results = groupDetail.members.filter((m) => {
                      if (excludeIds.has(m.id)) return false
                      const name = [m.firstName, m.lastName].filter(Boolean).join(' ').toLowerCase()
                      const phone = (m.phoneDisplay || m.phoneNumber || '').toLowerCase()
                      return name.includes(q) || phone.includes(q)
                    })
                    if (results.length === 0) {
                      return <p className="text-sm text-muted-foreground text-center py-3">No matching members found</p>
                    }
                    return results.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        className="flex items-center gap-2 w-full px-2 py-1 rounded hover:bg-accent hover:text-accent-foreground cursor-pointer text-sm text-left"
                        onClick={() => {
                          toggleExclude(m.id)
                          setExcludeSearch('')
                        }}
                      >
                        <span>
                          {[m.firstName, m.lastName].filter(Boolean).join(' ') || (
                            <em className="text-muted-foreground">Unnamed</em>
                          )}
                        </span>
                        <span className="text-muted-foreground ml-auto">{m.phoneDisplay}</span>
                      </button>
                    ))
                  })()}
                </div>
              )}
              {excludeIds.size > 0 && (
                <div className="flex flex-wrap gap-2">
                  {groupDetail.members
                    .filter((m) => excludeIds.has(m.id))
                    .map((m) => (
                      <Badge
                        key={m.id}
                        variant="secondary"
                        className="gap-1 cursor-pointer hover:bg-destructive/20"
                        onClick={() => toggleExclude(m.id)}
                      >
                        {[m.firstName, m.lastName].filter(Boolean).join(' ') || 'Unnamed'}
                        <span className="text-muted-foreground">&times;</span>
                      </Badge>
                    ))}
                </div>
              )}
            </div>
          )}

          <Separator />

          {/* Message editor */}
          <div className="space-y-2">
            <Label>Message</Label>
            <div className="flex gap-2 mb-2">
              <Button variant="outline" size="sm" onClick={() => setContent((c) => c + '{{firstName}}')}>
                {'{{firstName}}'}
              </Button>
              <Button variant="outline" size="sm" onClick={() => setContent((c) => c + '{{lastName}}')}>
                {'{{lastName}}'}
              </Button>
              <Button variant="outline" size="sm" onClick={() => setContent((c) => c + '{{fullName}}')}>
                {'{{fullName}}'}
              </Button>
            </div>
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={5}
              placeholder="Type your message here. Use template variables for personalization..."
            />
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span>{charCount} characters</span>
              {charCount > 160 && <span className="text-orange-500">{Math.ceil(charCount / 160)} segments</span>}
            </div>
          </div>

          {/* Preview */}
          {content && previewPerson && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Eye className="h-4 w-4" />
                  Preview (for {previewPerson.firstName || 'first recipient'})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap">{renderedPreview}</p>
              </CardContent>
            </Card>
          )}

          {/* Schedule date */}
          <div className="space-y-2">
            <Label>Schedule Date (optional)</Label>
            <DateTimePicker value={scheduledAt} onChange={setScheduledAt} />
          </div>

          {/* Batch settings */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Batch Size</Label>
              <Input type="number" min={1} value={batchSize} onChange={(e) => setBatchSize(Number(e.target.value))} />
            </div>
            <div>
              <Label>Delay Between Batches (ms)</Label>
              <Input
                type="number"
                min={1000}
                step={1000}
                value={batchDelayMs}
                onChange={(e) => setBatchDelayMs(Number(e.target.value))}
              />
            </div>
          </div>

          {/* Summary & send */}
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-sm font-medium">
                Sending to <Badge variant="secondary">{recipients.length}</Badge> of{' '}
                <Badge variant="outline">{allRecipientIds.length}</Badge> people
              </p>
              {excludeIds.size > 0 && <p className="text-sm text-muted-foreground">{excludeIds.size} excluded</p>}
            </div>
            <div className="flex gap-2">
              {currentDraftId && (
                <Button variant="outline" size="lg" onClick={() => setDeleteConfirmOpen(true)}>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </Button>
              )}
              <Button
                variant="outline"
                size="lg"
                onClick={() => saveDraftMutation.mutate()}
                disabled={saveDraftMutation.isPending}
              >
                <Save className="h-4 w-4 mr-2" />
                {saveDraftMutation.isPending ? 'Saving...' : 'Save Draft'}
              </Button>
              <Button
                size="lg"
                onClick={handleSend}
                disabled={sendMutation.isPending || recipients.length === 0 || !content.trim()}
              >
                <Send className="h-4 w-4 mr-2" />
                {sendMutation.isPending ? 'Starting...' : 'Send Message'}
              </Button>
            </div>
          </div>
        </>
      )}
      <ConfirmDialog
        open={sendConfirmOpen}
        onOpenChange={setSendConfirmOpen}
        title={`Send to ${recipients.length} recipient${recipients.length !== 1 ? 's' : ''}?`}
        confirmLabel="Send"
        loading={sendMutation.isPending}
        onConfirm={() => {
          setSendConfirmOpen(false)
          sendMutation.mutate()
        }}
      >
        <div className="space-y-3 text-sm">
          {recipientMode === 'group' && groupDetail && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Group</span>
              <span className="font-medium">{groupDetail.name}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-muted-foreground">Recipients</span>
            <span className="font-medium">
              {recipients.length} of {allRecipientIds.length}
            </span>
          </div>
          {excludeIds.size > 0 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Excluded</span>
              <span className="font-medium">{excludeIds.size}</span>
            </div>
          )}
          {charCount > 160 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Segments</span>
              <span className="font-medium text-orange-500">{Math.ceil(charCount / 160)}</span>
            </div>
          )}
          <Separator />
          <div>
            <span className="text-muted-foreground">Preview</span>
            <p className="mt-1 bg-muted rounded-md p-3 whitespace-pre-wrap text-sm">{renderedPreview || content}</p>
          </div>
        </div>
      </ConfirmDialog>
      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title="Delete this draft?"
        description="This will permanently delete this draft. This action cannot be undone."
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={() => {
          if (!currentDraftId) return
          deleteDrafts([currentDraftId]).then(() => {
            queryClient.invalidateQueries({queryKey: ['drafts']})
            toast.success('Draft deleted')
            navigate('/messages?tab=drafts')
          })
        }}
      />
    </div>
  )
}
