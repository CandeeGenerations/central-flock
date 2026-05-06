import {ConfirmDialog} from '@/components/confirm-dialog'
import {Badge} from '@/components/ui/badge'
import {Button} from '@/components/ui/button'
import {Calendar} from '@/components/ui/calendar'
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card'
import {DateTimePicker} from '@/components/ui/date-time-picker'
import {Input} from '@/components/ui/input'
import {Label} from '@/components/ui/label'
import {Popover, PopoverContent, PopoverTrigger} from '@/components/ui/popover'
import {SearchInput} from '@/components/ui/search-input'
import {SearchableSelect} from '@/components/ui/searchable-select'
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select'
import {Separator} from '@/components/ui/separator'
import {Textarea} from '@/components/ui/textarea'
import {useDebouncedValue} from '@/hooks/use-debounced-value'
import {useSetToggle} from '@/hooks/use-set-toggle'
import {
  createDraft,
  deleteDrafts,
  fetchDraft,
  fetchGlobalVariables,
  fetchGroup,
  fetchGroups,
  fetchMessage,
  fetchPeople,
  fetchTemplates,
  sendMessage,
  updateDraft,
  updateMessage,
} from '@/lib/api'
import type {Draft, TemplateVariable} from '@/lib/api'
import {BATCH_DEFAULTS} from '@/lib/constants'
import {formatFullName, renderTemplate} from '@/lib/format'
import {queryKeys} from '@/lib/query-keys'
import {cn} from '@/lib/utils'
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'
import {format} from 'date-fns'
import {CalendarIcon, ChevronDown, ChevronRight, Globe, Save, Send, Trash2, Type, Users, X, Zap} from 'lucide-react'
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
  const editMessageId = searchParams.get('editMessageId')
  const presetGroupId = searchParams.get('groupId') || (dupState?.groupId ? String(dupState.groupId) : '')
  const presetRecipientId = searchParams.get('recipientId')
  const presetPersonIds = (searchParams.get('personIds') || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map(Number)
    .filter((n) => Number.isFinite(n))

  const [recipientMode, setRecipientMode] = useState<'group' | 'individual'>(
    presetRecipientId || presetPersonIds.length > 0 ? 'individual' : 'group',
  )
  const [selectedGroupId, setSelectedGroupId] = useState(presetGroupId || '')
  const [content, setContent] = useState(dupState?.content || '')
  const [messageTab, setMessageTab] = useState<'edit' | 'preview'>('edit')
  const [excludeIds, setExcludeIds] = useState<Set<number>>(() => new Set(dupState?.excludeIds || []))
  const [excludeSearch, setExcludeSearch] = useState('')
  const debouncedExcludeSearch = useDebouncedValue(excludeSearch, 250)
  const [excludeHighlight, setExcludeHighlight] = useState(-1)
  const excludeSearchRef = useRef<HTMLInputElement>(null)
  const [batchSize] = useState<number>(BATCH_DEFAULTS.batchSize)
  const [sendConfirmOpen, setSendConfirmOpen] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [batchDelayMs] = useState<number>(BATCH_DEFAULTS.batchDelayMs)
  const [scheduledAt, setScheduledAt] = useState('')
  const [sendTimeMode, setSendTimeMode] = useState<'now' | 'schedule'>('now')
  const [currentDraftId, setCurrentDraftId] = useState<number | null>(draftIdParam ? Number(draftIdParam) : null)
  const [individualSearch, setIndividualSearch] = useState('')
  const debouncedIndividualSearch = useDebouncedValue(individualSearch, 250)
  const [individualHighlight, setIndividualHighlight] = useState(-1)
  const individualSearchRef = useRef<HTMLInputElement>(null)
  const [selectedIndividualIds, setSelectedIndividualIds] = useState<Set<number>>(() => {
    if (presetPersonIds.length > 0) return new Set(presetPersonIds)
    return presetRecipientId ? new Set([Number(presetRecipientId)]) : new Set()
  })

  // Template state
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('')
  const [activeTemplateVars, setActiveTemplateVars] = useState<TemplateVariable[]>([])
  const [customVarValues, setCustomVarValues] = useState<Record<string, string>>({})
  const [dateValues, setDateValues] = useState<Record<string, Date | undefined>>({})
  const [dateFormats, setDateFormats] = useState<Record<string, string>>({})

  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const insertAtCursor = useCallback(
    (text: string) => {
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
    },
    [setContent],
  )

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
  if (draftData && templatesList && loadedDraftId !== draftData.id) {
    setLoadedDraftId(draftData.id)
    setContent(draftData.content || '')
    setRecipientMode(draftData.recipientMode || 'group')
    setSelectedGroupId(draftData.groupId ? String(draftData.groupId) : '')
    setScheduledAt(draftData.scheduledAt || '')
    if (draftData.scheduledAt) setSendTimeMode('schedule')
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

  // Edit mode: fetch existing message and populate form
  const {data: editMessageData} = useQuery({
    queryKey: queryKeys.message(editMessageId!),
    queryFn: () => fetchMessage(Number(editMessageId)),
    enabled: !!editMessageId,
  })

  const [loadedEditMessageId, setLoadedEditMessageId] = useState<number | null>(null)
  if (editMessageData && templatesList && loadedEditMessageId !== editMessageData.id) {
    setLoadedEditMessageId(editMessageData.id)
    setContent(editMessageData.content || '')
    setSelectedGroupId(editMessageData.groupId ? String(editMessageData.groupId) : '')
    setRecipientMode(editMessageData.groupId ? 'group' : 'individual')
    // Convert scheduledAt UTC back to local datetime-local format
    if (editMessageData.scheduledAt) {
      const d = new Date(editMessageData.scheduledAt + (editMessageData.scheduledAt.endsWith('Z') ? '' : 'Z'))
      const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
      setScheduledAt(local)
      setSendTimeMode('schedule')
    }
    // Derive exclude/include from recipients
    const pendingIds = editMessageData.recipients.filter((r) => r.status === 'pending').map((r) => r.personId)
    const skippedIds = editMessageData.recipients.filter((r) => r.status === 'skipped').map((r) => r.personId)
    if (editMessageData.groupId) {
      setExcludeIds(new Set(skippedIds))
    } else {
      setSelectedIndividualIds(new Set(pendingIds))
    }
    // Restore template state
    if (editMessageData.templateState) {
      try {
        const ts = JSON.parse(editMessageData.templateState) as {
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

  const isEditMode = !!editMessageId

  const {data: groups} = useQuery({queryKey: queryKeys.groups, queryFn: fetchGroups})
  const {data: groupDetail} = useQuery({
    queryKey: queryKeys.group(selectedGroupId),
    queryFn: () => fetchGroup(Number(selectedGroupId)),
    enabled: recipientMode === 'group' && !!selectedGroupId,
  })
  const {data: allPeople} = useQuery({
    queryKey: [...queryKeys.people, 'all'],
    queryFn: () => fetchPeople({limit: 1000}),
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

  const groupMemberIds = useMemo(() => new Set(groupDetail?.members.map((m) => m.id) || []), [groupDetail])

  const recipients = useMemo(() => {
    if (recipientMode === 'group' && groupDetail) {
      const groupRecipients = groupDetail.members.filter((m) => !excludeIds.has(m.id))
      if (selectedIndividualIds.size > 0 && allPeople) {
        const extras = allPeople.data.filter((p) => selectedIndividualIds.has(p.id) && !groupMemberIds.has(p.id))
        return [...groupRecipients, ...extras]
      }
      return groupRecipients
    }
    if (recipientMode === 'individual' && allPeople) {
      return allPeople.data.filter((p) => selectedIndividualIds.has(p.id))
    }
    return []
  }, [recipientMode, groupDetail, allPeople, excludeIds, selectedIndividualIds, groupMemberIds])

  const allRecipientIds = useMemo(() => {
    if (recipientMode === 'group' && groupDetail) {
      const ids = groupDetail.members.map((m) => m.id)
      for (const id of selectedIndividualIds) {
        if (!groupMemberIds.has(id)) ids.push(id)
      }
      return ids
    }
    return [...selectedIndividualIds]
  }, [recipientMode, groupDetail, selectedIndividualIds, groupMemberIds])

  const excludeResults = useMemo(() => {
    if (!groupDetail) return []
    const q = debouncedExcludeSearch?.toLowerCase()
    return groupDetail.members.filter((m) => {
      if (excludeIds.has(m.id)) return false
      if (!q) return true
      const name = formatFullName(m, '').toLowerCase()
      const phone = (m.phoneDisplay || m.phoneNumber || '').toLowerCase()
      return name.includes(q) || phone.includes(q)
    })
  }, [debouncedExcludeSearch, groupDetail, excludeIds])

  const handleExcludeKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!excludeResults.length) return
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setExcludeHighlight((i) => Math.min(i + 1, excludeResults.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setExcludeHighlight((i) => Math.max(i - 1, 0))
      } else if (e.key === 'Enter' && excludeHighlight >= 0 && excludeHighlight < excludeResults.length) {
        e.preventDefault()
        setExcludeIds((prev) => new Set([...prev, excludeResults[excludeHighlight].id]))
        setExcludeSearch('')
        setExcludeHighlight(-1)
        excludeSearchRef.current?.focus()
      }
    },
    [excludeResults, excludeHighlight, setExcludeHighlight, setExcludeIds, setExcludeSearch],
  )

  const individualResults = useMemo(() => {
    if (!allPeople) return []
    const q = debouncedIndividualSearch?.toLowerCase()
    return allPeople.data.filter((p) => {
      if (!p.phoneNumber) return false
      if (selectedIndividualIds.has(p.id)) return false
      if (recipientMode === 'group' && groupMemberIds.has(p.id)) return false
      if (!q) return true
      const name = formatFullName(p, '').toLowerCase()
      const phone = (p.phoneDisplay || p.phoneNumber || '').toLowerCase()
      return name.includes(q) || phone.includes(q)
    })
  }, [debouncedIndividualSearch, allPeople, selectedIndividualIds, recipientMode, groupMemberIds])

  const handleIndividualKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!individualResults.length) return
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setIndividualHighlight((i) => Math.min(i + 1, individualResults.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setIndividualHighlight((i) => Math.max(i - 1, 0))
      } else if (e.key === 'Enter' && individualHighlight >= 0 && individualHighlight < individualResults.length) {
        e.preventDefault()
        setSelectedIndividualIds((prev) => new Set([...prev, individualResults[individualHighlight].id]))
        setIndividualSearch('')
        setIndividualHighlight(-1)
        individualSearchRef.current?.focus()
      }
    },
    [individualResults, individualHighlight, setIndividualHighlight, setSelectedIndividualIds, setIndividualSearch],
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

  const buildTemplateState = (): string | undefined => {
    if (!selectedTemplateId || selectedTemplateId === 'none') return undefined
    const dateIsoValues: Record<string, string> = {}
    for (const [key, date] of Object.entries(dateValues)) {
      if (date) dateIsoValues[key] = date.toISOString()
    }
    return JSON.stringify({
      templateId: Number(selectedTemplateId),
      customVarValues,
      dateValues: dateIsoValues,
      dateFormats,
    })
  }

  const sendMutation = useMutation({
    mutationFn: () => {
      const cvv = Object.keys(resolvedCustomVarValues).length > 0 ? resolvedCustomVarValues : undefined
      const payload = {
        content,
        recipientIds: allRecipientIds,
        excludeIds: [...excludeIds],
        groupId: recipientMode === 'group' ? Number(selectedGroupId) : undefined,
        batchSize,
        batchDelayMs,
        customVarValues: cvv,
        scheduledAt: scheduledAt || undefined,
        templateState: buildTemplateState(),
      }
      if (isEditMode) {
        return updateMessage(Number(editMessageId), payload)
      }
      return sendMessage(payload)
    },
    onSuccess: async (data) => {
      if (isEditMode) {
        queryClient.invalidateQueries({queryKey: queryKeys.messages()})
        queryClient.invalidateQueries({queryKey: queryKeys.message(editMessageId!)})
        if (data.scheduled) {
          toast.success('Message updated')
          navigate('/messages?tab=scheduled')
        } else {
          toast.success('Message updated and sending')
          navigate(`/messages/${data.messageId}`)
        }
        return
      }
      // Auto-delete draft after successful send
      if (currentDraftId) {
        try {
          await deleteDrafts([currentDraftId])
          queryClient.invalidateQueries({queryKey: queryKeys.drafts()})
        } catch {
          /* ignore */
        }
      }
      await queryClient.resetQueries({queryKey: queryKeys.messages()})
      if (data.scheduled) {
        toast.success('Message scheduled')
        navigate('/messages?tab=scheduled')
        return
      }
      toast.success('Message sending')
      navigate(`/messages/${data.messageId}`)
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
      selectedIndividualIds: selectedIndividualIds.size > 0 ? JSON.stringify([...selectedIndividualIds]) : null,
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
      queryClient.setQueryData(queryKeys.draft(draft.id), (old: Draft | undefined) =>
        old ? {...old, ...draft} : draft,
      )
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

  return (
    <div className="p-4 md:p-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <X className="h-4 w-4" />
        </Button>
        <h2 className="text-xl font-semibold">{isEditMode ? 'Edit Scheduled Message' : 'Compose Message'}</h2>
      </div>

      {/* Two-column layout: form + phone preview */}
      <div className="flex gap-8">
        {/* Left: Form */}
        <div className="flex-1 min-w-0 space-y-4 max-w-3xl">
          {/* === TO Section === */}
          <Card>
            <CardHeader>
              <CardTitle>To</CardTitle>
              <p className="text-sm text-muted-foreground">
                {recipients.length > 0
                  ? `This message will be sent to ${recipients.length} contact${recipients.length !== 1 ? 's' : ''}.`
                  : 'Select recipients for this message.'}
              </p>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Select value={recipientMode} onValueChange={(v) => setRecipientMode(v as 'group' | 'individual')}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="group">Send to Group</SelectItem>
                      <SelectItem value="individual">Select Individuals</SelectItem>
                    </SelectContent>
                  </Select>
                  {recipientMode === 'group' && (
                    <SearchableSelect
                      value={selectedGroupId}
                      onValueChange={setSelectedGroupId}
                      options={groups?.map((g) => ({value: String(g.id), label: `${g.name} (${g.memberCount})`})) || []}
                      placeholder="Choose a group..."
                      className="w-full"
                    />
                  )}
                </div>

                {/* Add individuals search */}
                {allPeople && (
                  <VariableDropdown
                    label={recipientMode === 'group' ? 'Add people outside this group' : 'Add people'}
                    count={selectedIndividualIds.size}
                  >
                    <div className="space-y-2">
                      <SearchInput
                        ref={individualSearchRef}
                        placeholder="Search people to add..."
                        value={individualSearch}
                        onChange={(v) => {
                          setIndividualSearch(v)
                          setIndividualHighlight(-1)
                        }}
                        onKeyDown={handleIndividualKeyDown}
                        hideShortcut
                      />
                      <div className="rounded-xl overflow-hidden bg-popover/70 backdrop-blur-2xl backdrop-saturate-150 shadow-lg ring-1 ring-foreground/5 dark:ring-foreground/10">
                        <div className="max-h-48 overflow-auto p-1.5">
                          {individualResults.length === 0 ? (
                            <p className="text-sm text-muted-foreground text-center py-3">
                              {debouncedIndividualSearch ? 'No matching people found' : 'All people selected'}
                            </p>
                          ) : (
                            individualResults.map((p, i) => (
                              <button
                                key={p.id}
                                ref={
                                  i === individualHighlight ? (el) => el?.scrollIntoView({block: 'nearest'}) : undefined
                                }
                                type="button"
                                className={cn(
                                  'flex items-center gap-2.5 w-full px-3 py-2 rounded-lg cursor-pointer text-sm font-medium text-left',
                                  i === individualHighlight ? 'bg-foreground/10' : 'hover:bg-foreground/10',
                                )}
                                onClick={() => {
                                  setSelectedIndividualIds((prev) => new Set([...prev, p.id]))
                                  setIndividualSearch('')
                                  setIndividualHighlight(-1)
                                  individualSearchRef.current?.focus()
                                }}
                              >
                                <span>{formatFullName(p, '') || <em className="opacity-50">Unnamed</em>}</span>
                                <span className="text-muted-foreground ml-auto">{p.phoneDisplay}</span>
                              </button>
                            ))
                          )}
                        </div>
                      </div>
                      {selectedIndividualIds.size > 0 && allPeople && (
                        <div className="flex flex-wrap gap-1.5">
                          {allPeople.data
                            .filter(
                              (p) =>
                                selectedIndividualIds.has(p.id) &&
                                (recipientMode === 'individual' || !groupMemberIds.has(p.id)),
                            )
                            .map((p) => (
                              <Badge
                                key={p.id}
                                className="gap-1 cursor-pointer bg-teal-100 text-teal-800 hover:bg-teal-200 dark:bg-teal-900 dark:text-teal-200 dark:hover:bg-teal-800 border-0"
                                onClick={() => toggleIndividual(p.id)}
                              >
                                {formatFullName(p)}
                                {p.phoneDisplay && (
                                  <span className="text-teal-600 dark:text-teal-400">- {p.phoneDisplay}</span>
                                )}
                                <X className="h-3 w-3 ml-0.5" />
                              </Badge>
                            ))}
                        </div>
                      )}
                    </div>
                  </VariableDropdown>
                )}

                {/* Recipient tags */}
                <div className="flex flex-wrap gap-1.5">
                  {recipientMode === 'group' && groupDetail && (
                    <Badge className="bg-teal-100 text-teal-800 hover:bg-teal-200 dark:bg-teal-900 dark:text-teal-200 dark:hover:bg-teal-800 border-0">
                      <Users className="h-3 w-3 mr-1" />
                      {groupDetail.name} ({groupDetail.members.filter((m) => !excludeIds.has(m.id)).length})
                    </Badge>
                  )}
                  {excludeIds.size > 0 && (
                    <Badge variant="outline" className="text-muted-foreground">
                      {excludeIds.size} excluded
                    </Badge>
                  )}
                </div>

                {/* Exclusion list for group mode */}
                {recipientMode === 'group' && groupDetail && groupDetail.members.length > 0 && (
                  <VariableDropdown label="Exclude from send" count={excludeIds.size}>
                    <div className="space-y-2">
                      <SearchInput
                        ref={excludeSearchRef}
                        placeholder="Search members to exclude..."
                        value={excludeSearch}
                        onChange={(v) => {
                          setExcludeSearch(v)
                          setExcludeHighlight(-1)
                        }}
                        onKeyDown={handleExcludeKeyDown}
                        hideShortcut
                      />
                      <div className="rounded-xl overflow-hidden bg-popover/70 backdrop-blur-2xl backdrop-saturate-150 shadow-lg ring-1 ring-foreground/5 dark:ring-foreground/10">
                        <div className="max-h-48 overflow-auto p-1.5">
                          {excludeResults.length === 0 ? (
                            <p className="text-sm text-muted-foreground text-center py-3">
                              {debouncedExcludeSearch ? 'No matching members found' : 'All members excluded'}
                            </p>
                          ) : (
                            excludeResults.map((m, i) => (
                              <button
                                key={m.id}
                                ref={
                                  i === excludeHighlight ? (el) => el?.scrollIntoView({block: 'nearest'}) : undefined
                                }
                                type="button"
                                className={cn(
                                  'flex items-center gap-2.5 w-full px-3 py-2 rounded-lg cursor-pointer text-sm font-medium text-left',
                                  i === excludeHighlight ? 'bg-foreground/10' : 'hover:bg-foreground/10',
                                )}
                                onClick={() => {
                                  setExcludeIds((prev) => new Set([...prev, m.id]))
                                  setExcludeSearch('')
                                  setExcludeHighlight(-1)
                                  excludeSearchRef.current?.focus()
                                }}
                              >
                                <span>{formatFullName(m, '') || <em className="opacity-50">Unnamed</em>}</span>
                                <span className="text-muted-foreground ml-auto">{m.phoneDisplay}</span>
                              </button>
                            ))
                          )}
                        </div>
                      </div>
                      {excludeIds.size > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {groupDetail.members
                            .filter((m) => excludeIds.has(m.id))
                            .map((m) => (
                              <Badge
                                key={m.id}
                                className="gap-1 cursor-pointer bg-red-100 text-red-800 hover:bg-red-200 dark:bg-red-900 dark:text-red-200 dark:hover:bg-red-800 border-0"
                                onClick={() => toggleExclude(m.id)}
                              >
                                {formatFullName(m)}
                                <X className="h-3 w-3 ml-0.5" />
                              </Badge>
                            ))}
                        </div>
                      )}
                    </div>
                  </VariableDropdown>
                )}
              </div>
            </CardContent>
          </Card>

          {/* === MESSAGE Section === */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <CardTitle>Message</CardTitle>
                  <p className="text-sm text-muted-foreground">Compose your message content.</p>
                </div>
                <div className="flex lg:hidden bg-muted rounded-full p-1 shrink-0">
                  <button
                    type="button"
                    className={cn(
                      'px-3 py-1 text-sm font-medium rounded-full transition-colors',
                      messageTab === 'edit' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground',
                    )}
                    onClick={() => setMessageTab('edit')}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className={cn(
                      'px-3 py-1 text-sm font-medium rounded-full transition-colors',
                      messageTab === 'preview' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground',
                    )}
                    onClick={() => setMessageTab('preview')}
                  >
                    Preview
                  </button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {/* Mobile preview */}
              {messageTab === 'preview' && (
                <div className="lg:hidden space-y-3">
                  <div className="text-sm text-muted-foreground">
                    Previewing for:{' '}
                    <span className="font-medium text-foreground">
                      {previewPerson ? formatFullName(previewPerson, 'First recipient') : 'Recipient'}
                    </span>
                  </div>
                  {content ? (
                    <div className="rounded-2xl bg-muted/30 p-4">
                      <div className="flex justify-start">
                        <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-muted px-4 py-3">
                          <p className="text-sm whitespace-pre-wrap leading-relaxed">{renderedPreview}</p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center h-32 rounded-2xl bg-muted/30 text-sm text-muted-foreground">
                      Write a message to see a preview
                    </div>
                  )}
                  <div className="flex items-center justify-between text-sm text-muted-foreground">
                    <span>{charCount} characters</span>
                    {charCount > 160 && (
                      <span className="text-orange-500">{Math.ceil(charCount / 160)} SMS segments</span>
                    )}
                  </div>
                </div>
              )}

              {/* Edit content: always visible on desktop, hidden on mobile when preview tab active */}
              <div className={cn(messageTab === 'preview' && 'hidden lg:block')}>
                {/* Template selector */}
                {templatesList && templatesList.length > 0 && (
                  <div className="mb-3">
                    <SearchableSelect
                      value={selectedTemplateId}
                      onValueChange={handleTemplateSelect}
                      options={[
                        {value: 'none', label: 'No template'},
                        ...[...templatesList]
                          .sort((a, b) => a.name.localeCompare(b.name))
                          .map((t) => ({
                            value: String(t.id),
                            label: t.name,
                          })),
                      ]}
                      placeholder="Choose a template..."
                      className="w-full"
                    />
                  </div>
                )}

                <Textarea
                  ref={textareaRef}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  rows={8}
                  placeholder="Type your message here. Use template variables for personalization..."
                  className="min-h-48 md:min-h-0 mb-2"
                />

                <div className="flex items-center justify-between text-sm text-muted-foreground mb-3">
                  <span>{charCount} characters</span>
                  {charCount > 160 && (
                    <span className="text-orange-500">{Math.ceil(charCount / 160)} SMS segments</span>
                  )}
                </div>

                {/* Variable insertion */}
                <div className="space-y-2">
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
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                  <Popover>
                                    <PopoverTrigger asChild>
                                      <button
                                        type="button"
                                        className={cn(
                                          'flex w-full items-center gap-1.5 rounded-3xl border border-transparent bg-input/50 px-3 py-2 text-sm whitespace-nowrap transition-[color,box-shadow,background-color] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 h-9 cursor-pointer',
                                          !dateValues[v.name] && 'text-muted-foreground',
                                        )}
                                      >
                                        <CalendarIcon className="h-4 w-4 text-muted-foreground shrink-0" />
                                        {dateValues[v.name]
                                          ? format(dateValues[v.name]!, dateFormats[v.name] || 'MMMM d, yyyy')
                                          : 'Pick a date'}
                                      </button>
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
                                  <Select
                                    value={dateFormats[v.name] || 'MMMM d, yyyy'}
                                    onValueChange={(fmt) => setDateFormats((prev) => ({...prev, [v.name]: fmt}))}
                                  >
                                    <SelectTrigger className="w-full">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {getDateFormatOptions(dateValues[v.name] || new Date()).map((opt) => (
                                        <SelectItem key={opt.format} value={opt.format}>
                                          {opt.label}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
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
                          <Button
                            key={v.name}
                            variant="outline"
                            size="sm"
                            onClick={() => insertAtCursor(`{{${v.name}}}`)}
                          >
                            <Globe className="h-3 w-3 mr-1" />
                            {`{{${v.name}}}`}
                          </Button>
                        ))}
                      </div>
                    </VariableDropdown>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* === SEND TIME Section === */}
          <Card>
            <CardHeader>
              <CardTitle>Send Time</CardTitle>
              <p className="text-sm text-muted-foreground">When do you want to send your message?</p>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3 mb-4">
                <button
                  type="button"
                  className={cn(
                    'flex flex-col items-start gap-1.5 rounded-lg border-2 p-4 text-left transition-colors cursor-pointer',
                    sendTimeMode === 'now'
                      ? 'border-primary bg-primary/5'
                      : 'border-border bg-card hover:border-muted-foreground/30',
                  )}
                  onClick={() => {
                    setSendTimeMode('now')
                    setScheduledAt('')
                  }}
                >
                  <Zap className={cn('h-5 w-5', sendTimeMode === 'now' ? 'text-primary' : 'text-muted-foreground')} />
                  <span className="font-medium text-sm">Send Now</span>
                  <span className="text-xs text-muted-foreground">Send your message immediately.</span>
                </button>
                <button
                  type="button"
                  className={cn(
                    'flex flex-col items-start gap-1.5 rounded-lg border-2 p-4 text-left transition-colors cursor-pointer',
                    sendTimeMode === 'schedule'
                      ? 'border-primary bg-primary/5'
                      : 'border-border bg-card hover:border-muted-foreground/30',
                  )}
                  onClick={() => setSendTimeMode('schedule')}
                >
                  <CalendarIcon
                    className={cn('h-5 w-5', sendTimeMode === 'schedule' ? 'text-primary' : 'text-muted-foreground')}
                  />
                  <span className="font-medium text-sm">Schedule for Later</span>
                  <span className="text-xs text-muted-foreground">Choose a specific date and time.</span>
                </button>
              </div>

              {sendTimeMode === 'schedule' && (
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label>Send Date and Time</Label>
                    <DateTimePicker value={scheduledAt} onChange={setScheduledAt} />
                    {/* eslint-disable-next-line react-hooks/purity */}
                    {scheduledAt && new Date(scheduledAt).getTime() <= Date.now() && (
                      <p className="text-xs text-destructive">Scheduled time must be in the future</p>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Bottom actions */}
          <div className="py-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="space-y-1">
              <p className="text-sm font-medium">
                Sending to <Badge variant="default">{recipients.length}</Badge> of{' '}
                <Badge variant="default">{allRecipientIds.length}</Badge> people
              </p>
              {excludeIds.size > 0 && <p className="text-sm text-muted-foreground">{excludeIds.size} excluded</p>}
            </div>
            <div className="flex items-center gap-2 self-end sm:self-auto">
              {!isEditMode && currentDraftId && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => setDeleteConfirmOpen(true)}
                >
                  <Trash2 className="h-4 w-4 mr-1.5" />
                  Delete
                </Button>
              )}
              {!isEditMode && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => saveDraftMutation.mutate()}
                  disabled={saveDraftMutation.isPending}
                >
                  <Save className="h-4 w-4 mr-1.5" />
                  {saveDraftMutation.isPending ? 'Saving...' : 'Save Draft'}
                </Button>
              )}
              <Button
                size="sm"
                onClick={handleSend}
                disabled={
                  sendMutation.isPending ||
                  recipients.length === 0 ||
                  !content.trim() ||
                  // eslint-disable-next-line react-hooks/purity
                  (sendTimeMode === 'schedule' && !!scheduledAt && new Date(scheduledAt).getTime() <= Date.now())
                }
              >
                <Send className="h-4 w-4 mr-1.5" />
                {sendMutation.isPending
                  ? 'Sending...'
                  : isEditMode
                    ? scheduledAt
                      ? 'Update Schedule'
                      : 'Update & Send'
                    : `${sendTimeMode === 'schedule' && scheduledAt ? 'Schedule' : 'Send'} ${recipients.length} message${recipients.length !== 1 ? 's' : ''}`}
              </Button>
            </div>
          </div>
        </div>

        {/* Right: Phone Preview (desktop only) */}
        <div className="hidden lg:block w-[300px] shrink-0">
          <div className="sticky top-6">
            <div className="text-center mb-3">
              <p className="text-sm font-medium">SMS Preview</p>
              {previewPerson && (
                <p className="text-xs text-muted-foreground">{previewPerson.firstName || 'First recipient'}</p>
              )}
            </div>
            {/* Phone mockup */}
            <div className="relative mx-auto w-[280px]">
              <div className="rounded-[2rem] border-[3px] border-foreground/20 bg-card shadow-xl overflow-hidden">
                {/* Status bar */}
                <div className="flex items-center justify-between px-6 pt-3 pb-1 text-[10px] text-muted-foreground">
                  <span>{format(new Date(), 'h:mm')}</span>
                  <div className="flex items-center gap-1">
                    <div className="flex gap-0.5">
                      <div className="w-1 h-1.5 bg-muted-foreground/60 rounded-sm" />
                      <div className="w-1 h-2 bg-muted-foreground/60 rounded-sm" />
                      <div className="w-1 h-2.5 bg-muted-foreground/60 rounded-sm" />
                      <div className="w-1 h-3 bg-muted-foreground/30 rounded-sm" />
                    </div>
                  </div>
                </div>
                {/* Contact header */}
                <div className="text-center py-3 border-b">
                  <div className="w-8 h-8 rounded-full bg-muted mx-auto mb-1 flex items-center justify-center">
                    <Users className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <p className="text-xs font-medium">
                    {previewPerson ? formatFullName(previewPerson, 'Recipient') : 'Recipient'}
                  </p>
                </div>
                {/* Messages area */}
                <div className="min-h-[320px] max-h-[400px] overflow-auto p-3 bg-muted/30">
                  {content ? (
                    <div className="flex justify-start">
                      <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-muted px-3 py-2">
                        <p className="text-xs whitespace-pre-wrap leading-relaxed">{renderedPreview}</p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center h-[280px]">
                      <p className="text-xs text-muted-foreground">Message preview will appear here</p>
                    </div>
                  )}
                </div>
                {/* Input bar */}
                <div className="flex items-center gap-2 p-2 border-t bg-card">
                  <div className="flex-1 rounded-full bg-muted px-3 py-1.5">
                    <span className="text-[10px] text-muted-foreground">Your message</span>
                  </div>
                  <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center shrink-0">
                    <Send className="h-3 w-3 text-primary-foreground" />
                  </div>
                </div>
                {/* Home indicator */}
                <div className="flex justify-center py-2">
                  <div className="w-24 h-1 bg-foreground/20 rounded-full" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Confirmation dialogs */}
      <ConfirmDialog
        open={sendConfirmOpen}
        onOpenChange={setSendConfirmOpen}
        title={
          sendTimeMode === 'schedule' && scheduledAt
            ? `Schedule for ${recipients.length} recipient${recipients.length !== 1 ? 's' : ''}?`
            : `Send to ${recipients.length} recipient${recipients.length !== 1 ? 's' : ''}?`
        }
        confirmLabel={sendTimeMode === 'schedule' && scheduledAt ? 'Schedule' : 'Send'}
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
          {sendTimeMode === 'schedule' && scheduledAt && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Scheduled For</span>
              <span className="font-medium">{format(new Date(scheduledAt), 'PPP p')}</span>
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
            <p className="mt-1 bg-muted rounded-lg p-3 whitespace-pre-wrap text-sm">{renderedPreview || content}</p>
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
    <div className="rounded-3xl bg-input/50 ring-1 ring-foreground/5 dark:ring-foreground/10 overflow-hidden">
      <button
        type="button"
        className="flex items-center gap-2 w-full px-4 py-2.5 text-sm font-medium hover:bg-foreground/5 transition-colors cursor-pointer"
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
      {open && <div className="mx-2 mt-2 mb-2 rounded-2xl bg-card p-3">{children}</div>}
    </div>
  )
}
