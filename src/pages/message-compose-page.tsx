import {ConfirmDialog} from '@/components/confirm-dialog'
import {Badge} from '@/components/ui/badge'
import {Button} from '@/components/ui/button'
import {Calendar} from '@/components/ui/calendar'
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card'
import {DateTimePicker} from '@/components/ui/date-time-picker'
import {Input} from '@/components/ui/input'
import {Label} from '@/components/ui/label'
import {Popover, PopoverContent, PopoverTrigger} from '@/components/ui/popover'
import {Progress} from '@/components/ui/progress'
import {SearchInput} from '@/components/ui/search-input'
import {SearchableSelect} from '@/components/ui/searchable-select'
import {Separator} from '@/components/ui/separator'
import {Textarea} from '@/components/ui/textarea'
import {useSetToggle} from '@/hooks/use-set-toggle'
import {
  createDraft,
  deleteDrafts,
  fetchDraft,
  fetchGlobalVariables,
  fetchGroup,
  fetchGroups,
  fetchMessageStatus,
  fetchPeople,
  fetchTemplates,
  sendMessage,
  updateDraft,
} from '@/lib/api'
import type {Draft, TemplateVariable} from '@/lib/api'
import {BATCH_DEFAULTS} from '@/lib/constants'
import {formatFullName, renderTemplate} from '@/lib/format'
import {queryKeys} from '@/lib/query-keys'
import {cn} from '@/lib/utils'
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'
import {format} from 'date-fns'
import {ArrowLeft, CalendarIcon, ChevronDown, ChevronRight, Eye, Globe, Save, Send, Trash2, Type} from 'lucide-react'
import {type ReactNode, useCallback, useMemo, useRef, useState} from 'react'
import {useLocation, useNavigate, useSearchParams} from 'react-router-dom'
import {toast} from 'sonner'

const DATE_FORMATS = [
  {format: 'MMMM d'},
  {format: 'MMMM do'},
  {format: 'MMMM d, yyyy'},
  {format: 'M/d/yyyy'},
  {format: 'EEEE, MMMM d'},
  {format: 'EEEE, MMMM do'},
  {format: 'EEEE, MMMM d, yyyy'},
  {format: 'd', suffix: ' (day only)'},
  {format: 'do', suffix: ' (day only)'},
  {format: 'MMMM', suffix: ' (month only)'},
  {format: 'MMM', suffix: ' (month short)'},
  {format: 'yyyy', suffix: ' (year only)'},
]

function getDateFormatOptions(date: Date) {
  return DATE_FORMATS.map(({format: fmt, suffix}: {format: string; suffix?: string}) => ({
    label: format(date, fmt) + (suffix ?? ''),
    format: fmt,
  }))
}

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
  const [excludeHighlight, setExcludeHighlight] = useState(-1)
  const excludeSearchRef = useRef<HTMLInputElement>(null)
  const [batchSize, setBatchSize] = useState<number>(BATCH_DEFAULTS.batchSize)
  const [sendConfirmOpen, setSendConfirmOpen] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [batchDelayMs, setBatchDelayMs] = useState<number>(BATCH_DEFAULTS.batchDelayMs)
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

  // Template state
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('')
  const [activeTemplateVars, setActiveTemplateVars] = useState<TemplateVariable[]>([])
  const [customVarValues, setCustomVarValues] = useState<Record<string, string>>({})
  const [dateValues, setDateValues] = useState<Record<string, Date | undefined>>({})
  const [dateFormats, setDateFormats] = useState<Record<string, string>>({})

  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const insertAtCursor = useCallback((text: string) => {
    const el = textareaRef.current
    if (!el) {
      setContent((c) => c + text)
      return
    }
    const start = el.selectionStart
    const end = el.selectionEnd
    setContent((c) => c.substring(0, start) + text + c.substring(end))
    // Restore cursor position after the inserted text
    requestAnimationFrame(() => {
      el.focus()
      const pos = start + text.length
      el.setSelectionRange(pos, pos)
    })
  }, [])

  const toggleExclude = useSetToggle(setExcludeIds)
  const toggleIndividual = useSetToggle(setSelectedIndividualIds)

  const {data: draftData} = useQuery({
    queryKey: queryKeys.draft(currentDraftId!),
    queryFn: () => fetchDraft(currentDraftId!),
    enabled: !!currentDraftId,
  })
  const {data: templatesList} = useQuery({
    queryKey: queryKeys.templates(),
    queryFn: () => fetchTemplates(),
  })

  // Populate form from loaded draft (render-time state adjustment — React-recommended pattern)
  const [loadedDraftId, setLoadedDraftId] = useState<number | null>(null)
  if (draftData && loadedDraftId !== draftData.id) {
    setLoadedDraftId(draftData.id)
    setContent(draftData.content || '')
    setRecipientMode(draftData.recipientMode || 'group')
    setSelectedGroupId(draftData.groupId ? String(draftData.groupId) : '')
    setBatchSize(draftData.batchSize ?? BATCH_DEFAULTS.batchSize)
    setBatchDelayMs(draftData.batchDelayMs ?? BATCH_DEFAULTS.batchDelayMs)
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
    if (draftData.templateState) {
      try {
        const ts = JSON.parse(draftData.templateState) as {
          templateId: number
          customVarValues: Record<string, string>
          dateValues: Record<string, string>
          dateFormats: Record<string, string>
        }
        setSelectedTemplateId(String(ts.templateId))
        setCustomVarValues(ts.customVarValues || {})
        setDateFormats(ts.dateFormats || {})
        const parsedDates: Record<string, Date | undefined> = {}
        for (const [key, iso] of Object.entries(ts.dateValues || {})) {
          if (iso) parsedDates[key] = new Date(iso)
        }
        setDateValues(parsedDates)
        // Derive activeTemplateVars from the template
        const template = templatesList?.find((t) => t.id === ts.templateId)
        if (template?.customVariables) {
          try {
            setActiveTemplateVars(JSON.parse(template.customVariables))
          } catch {
            /* ignore */
          }
        }
      } catch {
        /* ignore */
      }
    } else {
      setSelectedTemplateId('')
      setActiveTemplateVars([])
      setCustomVarValues({})
      setDateValues({})
      setDateFormats({})
    }
  }

  const {data: groups} = useQuery({queryKey: queryKeys.groups, queryFn: fetchGroups})
  const {data: groupDetail} = useQuery({
    queryKey: queryKeys.group(selectedGroupId),
    queryFn: () => fetchGroup(Number(selectedGroupId)),
    enabled: recipientMode === 'group' && !!selectedGroupId,
  })
  const {data: allPeople} = useQuery({
    queryKey: [...queryKeys.people, 'all'],
    queryFn: () => fetchPeople({limit: 1000}),
    enabled: recipientMode === 'individual',
  })
  const {data: globalVariables} = useQuery({
    queryKey: queryKeys.globalVariables(),
    queryFn: () => fetchGlobalVariables(),
  })

  const handleTemplateSelect = (templateId: string) => {
    setSelectedTemplateId(templateId)
    if (!templateId || templateId === 'none') {
      setActiveTemplateVars([])
      setCustomVarValues({})
      setDateValues({})
      setDateFormats({})
      return
    }
    const template = templatesList?.find((t) => String(t.id) === templateId)
    if (!template) return
    setContent(template.content)
    let vars: TemplateVariable[] = []
    if (template.customVariables) {
      try {
        vars = JSON.parse(template.customVariables)
      } catch {
        /* ignore */
      }
    }
    setActiveTemplateVars(vars)
    setCustomVarValues({})
    setDateValues({})
    const defaultFormats: Record<string, string> = {}
    for (const v of vars) {
      if (v.type === 'date') {
        defaultFormats[v.name] = 'MMMM d, yyyy'
      }
    }
    setDateFormats(defaultFormats)
  }

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

  const excludeResults = useMemo(() => {
    if (!excludeSearch || !groupDetail) return []
    const q = excludeSearch.toLowerCase()
    return groupDetail.members.filter((m) => {
      if (excludeIds.has(m.id)) return false
      const name = formatFullName(m, '').toLowerCase()
      const phone = (m.phoneDisplay || m.phoneNumber || '').toLowerCase()
      return name.includes(q) || phone.includes(q)
    })
  }, [excludeSearch, groupDetail, excludeIds])

  const handleExcludeKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!excludeResults.length) return
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setExcludeHighlight((i) => (i < excludeResults.length - 1 ? i + 1 : 0))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setExcludeHighlight((i) => (i > 0 ? i - 1 : excludeResults.length - 1))
      } else if (e.key === 'Enter' && excludeHighlight >= 0 && excludeHighlight < excludeResults.length) {
        e.preventDefault()
        toggleExclude(excludeResults[excludeHighlight].id)
        setExcludeSearch('')
        setExcludeHighlight(-1)
        excludeSearchRef.current?.focus()
      }
    },
    [excludeResults, excludeHighlight, toggleExclude],
  )

  // Build resolved custom var values for preview and send
  const resolvedCustomVarValues = useMemo(() => {
    const resolved: Record<string, string> = {...customVarValues}
    for (const v of activeTemplateVars) {
      if (v.type === 'date') {
        const date = dateValues[v.name]
        const fmt = dateFormats[v.name] || 'MMMM d, yyyy'
        if (date) {
          resolved[v.name] = format(date, fmt)
        }
      }
    }
    return resolved
  }, [customVarValues, dateValues, dateFormats, activeTemplateVars])

  // Build preview values (with placeholders for empty vars)
  const previewCustomVarValues = useMemo(() => {
    // Start with global variable values
    const preview: Record<string, string> = {}
    if (globalVariables) {
      for (const g of globalVariables) {
        preview[g.name] = g.value
      }
    }
    // Custom vars override globals
    for (const v of activeTemplateVars) {
      if (v.type === 'text') {
        preview[v.name] = customVarValues[v.name] || `[${v.name}]`
      } else if (v.type === 'date') {
        const date = dateValues[v.name]
        const fmt = dateFormats[v.name] || 'MMMM d, yyyy'
        preview[v.name] = date ? format(date, fmt) : `[${v.name}]`
      }
    }
    return preview
  }, [customVarValues, dateValues, dateFormats, activeTemplateVars, globalVariables])

  const previewPerson = recipients[0]
  const renderedPreview = previewPerson
    ? renderTemplate(content, previewPerson, previewCustomVarValues)
    : renderTemplate(content, {firstName: null, lastName: null}, previewCustomVarValues)

  const charCount = content.length

  const sendMutation = useMutation({
    mutationFn: () => {
      const cvv = Object.keys(resolvedCustomVarValues).length > 0 ? resolvedCustomVarValues : undefined
      return sendMessage({
        content,
        recipientIds: allRecipientIds,
        excludeIds: [...excludeIds],
        groupId: recipientMode === 'group' ? Number(selectedGroupId) : undefined,
        batchSize,
        batchDelayMs,
        customVarValues: cvv,
      })
    },
    onSuccess: async (data) => {
      // Auto-delete draft after successful send
      if (currentDraftId) {
        try {
          await deleteDrafts([currentDraftId])
          queryClient.invalidateQueries({queryKey: queryKeys.drafts()})
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

  const getDraftFormData = () => {
    let templateState: string | null = null
    if (selectedTemplateId && selectedTemplateId !== 'none') {
      const dateIsoValues: Record<string, string> = {}
      for (const [key, date] of Object.entries(dateValues)) {
        if (date) dateIsoValues[key] = date.toISOString()
      }
      templateState = JSON.stringify({
        templateId: Number(selectedTemplateId),
        customVarValues,
        dateValues: dateIsoValues,
        dateFormats,
      })
    }
    return {
      content,
      recipientMode,
      groupId: recipientMode === 'group' && selectedGroupId ? Number(selectedGroupId) : null,
      selectedIndividualIds: recipientMode === 'individual' ? JSON.stringify([...selectedIndividualIds]) : null,
      excludeIds: excludeIds.size > 0 ? JSON.stringify([...excludeIds]) : null,
      batchSize,
      batchDelayMs,
      scheduledAt: scheduledAt || null,
      templateState,
    }
  }

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
      queryClient.setQueryData(queryKeys.draft(draft.id), (old: Draft | undefined) => (old ? {...old, ...draft} : draft))
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
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Recipients</Label>
                <SearchableSelect
                  value={recipientMode}
                  onValueChange={(v) => setRecipientMode(v as 'group' | 'individual')}
                  options={[
                    {value: 'group', label: 'Send to Group'},
                    {value: 'individual', label: 'Select Individuals'},
                  ]}
                  className="w-full"
                  searchable={false}
                />
              </div>

              {recipientMode === 'group' && (
                <div>
                  <Label>Group</Label>
                  <SearchableSelect
                    value={selectedGroupId}
                    onValueChange={setSelectedGroupId}
                    options={groups?.map((g) => ({value: String(g.id), label: `${g.name} (${g.memberCount})`})) || []}
                    placeholder="Choose a group..."
                    className="w-full"
                  />
                </div>
              )}
            </div>
          </div>

          {recipientMode === 'individual' && allPeople && (
            <div className="space-y-2">
              <Label>People to send to</Label>
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
                      const name = formatFullName(p, '').toLowerCase()
                      const phone = (p.phoneDisplay || p.phoneNumber || '').toLowerCase()
                      return name.includes(q) || phone.includes(q)
                    })
                    if (results.length === 0) {
                      return <p className="text-sm text-muted-foreground text-center py-3">No matching people found</p>
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
                        <span>{formatFullName(p, '') || <em className="text-muted-foreground">Unnamed</em>}</span>
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
                        {formatFullName(p)}
                        <span className="text-muted-foreground">&times;</span>
                      </Badge>
                    ))}
                </div>
              )}
            </div>
          )}

          {/* Exclusion list for group mode */}
          {recipientMode === 'group' && groupDetail && groupDetail.members.length > 0 && (
            <div className="space-y-2">
              <Label>Exclude from send (optional)</Label>
              <SearchInput
                ref={excludeSearchRef}
                placeholder="Search members to exclude..."
                value={excludeSearch}
                onChange={(v) => {
                  setExcludeSearch(v)
                  setExcludeHighlight(-1)
                }}
                onKeyDown={handleExcludeKeyDown}
              />
              {excludeSearch && (
                <div className="border rounded-md max-h-36 overflow-auto p-2 space-y-1">
                  {excludeResults.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-3">No matching members found</p>
                  ) : (
                    excludeResults.map((m, i) => (
                      <button
                        key={m.id}
                        ref={i === excludeHighlight ? (el) => el?.scrollIntoView({block: 'nearest'}) : undefined}
                        type="button"
                        className={cn(
                          'flex items-center gap-2 w-full px-2 py-1 rounded cursor-pointer text-sm text-left',
                          i === excludeHighlight
                            ? 'bg-accent text-accent-foreground'
                            : 'hover:bg-accent hover:text-accent-foreground',
                        )}
                        onClick={() => {
                          toggleExclude(m.id)
                          setExcludeSearch('')
                          setExcludeHighlight(-1)
                          excludeSearchRef.current?.focus()
                        }}
                      >
                        <span>{formatFullName(m, '') || <em className="text-muted-foreground">Unnamed</em>}</span>
                        <span className="text-muted-foreground ml-auto">{m.phoneDisplay}</span>
                      </button>
                    ))
                  )}
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
                        {formatFullName(m)}
                        <span className="text-muted-foreground">&times;</span>
                      </Badge>
                    ))}
                </div>
              )}
            </div>
          )}

          <Separator />

          {/* Template selector */}
          {templatesList && templatesList.length > 0 && (
            <div className="space-y-2">
              <Label>Template (optional)</Label>
              <SearchableSelect
                value={selectedTemplateId}
                onValueChange={handleTemplateSelect}
                options={[
                  {value: 'none', label: 'No template'},
                  ...[...templatesList].sort((a, b) => a.name.localeCompare(b.name)).map((t) => ({
                    value: String(t.id),
                    label: t.name,
                  })),
                ]}
                placeholder="Choose a template..."
                className="w-full"
              />
            </div>
          )}

          {/* Message editor */}
          <div className="space-y-2">
            <Label>Message</Label>
            <div className="space-y-2 mb-2">
              <VariableDropdown label="Person Variables">
                <div className="flex flex-wrap gap-2 mt-2">
                  <Button variant="outline" size="sm" onClick={() => insertAtCursor('{{firstName}}')}>
                    {'{{firstName}}'}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => insertAtCursor('{{lastName}}')}>
                    {'{{lastName}}'}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => insertAtCursor('{{fullName}}')}>
                    {'{{fullName}}'}
                  </Button>
                </div>
              </VariableDropdown>
              {activeTemplateVars.length > 0 && (
                <VariableDropdown label="Template Variables" count={activeTemplateVars.length} defaultOpen>
                  <div className="space-y-3 mt-2">
                    <div className="flex flex-wrap gap-2">
                      <span className="text-xs text-muted-foreground self-center mr-1">Insert:</span>
                      {activeTemplateVars.map((v) => (
                        <Button
                          key={v.name}
                          variant="outline"
                          size="sm"
                          onClick={() => insertAtCursor(`{{${v.name}}}`)}
                        >
                          {v.type === 'date' ? (
                            <CalendarIcon className="h-3 w-3 mr-1" />
                          ) : (
                            <Type className="h-3 w-3 mr-1" />
                          )}
                          {`{{${v.name}}}`}
                        </Button>
                      ))}
                    </div>
                    <Separator />
                    <div className="grid gap-3">
                      {activeTemplateVars.map((v) => (
                        <div key={v.name} className="space-y-1">
                          <label className="text-sm font-medium flex items-center gap-1.5">
                            {v.type === 'date' ? (
                              <CalendarIcon className="h-3.5 w-3.5" />
                            ) : (
                              <Type className="h-3.5 w-3.5" />
                            )}
                            {v.name}
                          </label>
                          {v.type === 'text' ? (
                            <Input
                              value={customVarValues[v.name] || ''}
                              onChange={(e) => setCustomVarValues((prev) => ({...prev, [v.name]: e.target.value}))}
                              placeholder={`Enter ${v.name}...`}
                            />
                          ) : (
                            <div className="grid grid-cols-2 gap-4">
                              <Popover>
                                <PopoverTrigger asChild>
                                  <Button
                                    variant="outline"
                                    className={cn(
                                      'w-full justify-start text-left font-normal',
                                      !dateValues[v.name] && 'text-muted-foreground',
                                    )}
                                  >
                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                    {dateValues[v.name]
                                      ? format(dateValues[v.name]!, dateFormats[v.name] || 'MMMM d, yyyy')
                                      : 'Pick a date'}
                                  </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0" align="start">
                                  <Calendar
                                    mode="single"
                                    defaultMonth={dateValues[v.name]}
                                    selected={dateValues[v.name]}
                                    onSelect={(date) =>
                                      setDateValues((prev) => ({...prev, [v.name]: date ?? undefined}))
                                    }
                                  />
                                </PopoverContent>
                              </Popover>
                              <SearchableSelect
                                value={dateFormats[v.name] || 'MMMM d, yyyy'}
                                onValueChange={(fmt) => setDateFormats((prev) => ({...prev, [v.name]: fmt}))}
                                options={getDateFormatOptions(dateValues[v.name] || new Date()).map((opt) => ({
                                  value: opt.format,
                                  label: opt.label,
                                }))}
                                className="w-full"
                              />
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </VariableDropdown>
              )}
              {globalVariables && globalVariables.length > 0 && (
                <VariableDropdown label="Global Variables" count={globalVariables.length} defaultOpen>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {globalVariables.map((v) => (
                      <Button key={v.name} variant="outline" size="sm" onClick={() => insertAtCursor(`{{${v.name}}}`)}>
                        <Globe className="h-3 w-3 mr-1" />
                        {`{{${v.name}}}`}
                      </Button>
                    ))}
                  </div>
                </VariableDropdown>
              )}
            </div>
            <Textarea
              ref={textareaRef}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={10}
              placeholder="Type your message here. Use template variables for personalization..."
            />
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span>{charCount} characters</span>
              {charCount > 160 && <span className="text-orange-500">{Math.ceil(charCount / 160)} segments</span>}
            </div>
          </div>

          {/* Preview */}
          {content && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Eye className="h-4 w-4" />
                  Preview {previewPerson ? `(for ${previewPerson.firstName || 'first recipient'})` : ''}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap">{renderedPreview}</p>
              </CardContent>
            </Card>
          )}

          <Separator />

          {/* Batch settings */}
          <div className="grid grid-cols-3 gap-4">
            {/* Schedule date */}
            <div className="space-y-2">
              <Label>Schedule Date (optional)</Label>
              <DateTimePicker value={scheduledAt} onChange={setScheduledAt} />
            </div>
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
            queryClient.invalidateQueries({queryKey: queryKeys.drafts()})
            toast.success('Draft deleted')
            navigate('/messages?tab=drafts')
          })
        }}
      />
    </div>
  )
}

function VariableDropdown({
  label,
  count,
  defaultOpen = false,
  children,
}: {
  label: string
  count?: number
  defaultOpen?: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className="border rounded-md">
      <button
        type="button"
        className="flex items-center gap-2 w-full px-3 py-2 text-sm font-medium hover:bg-accent/50 transition-colors cursor-pointer"
        onClick={() => setOpen(!open)}
      >
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        {label}
        {count !== undefined && count > 0 && (
          <Badge variant="secondary" className="text-xs">
            {count}
          </Badge>
        )}
      </button>
      {open && <div className="px-3 pb-3">{children}</div>}
    </div>
  )
}
