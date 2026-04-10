import {ConfirmDialog} from '@/components/confirm-dialog'
import {Badge} from '@/components/ui/badge'
import {Button} from '@/components/ui/button'
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card'
import {Input} from '@/components/ui/input'
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select'
import {InlineSpinner} from '@/components/ui/spinner'
import {Textarea} from '@/components/ui/textarea'
import {createTemplate, deleteTemplates, fetchGlobalVariables, fetchTemplate, updateTemplate} from '@/lib/api'
import type {TemplateVariable} from '@/lib/api'
import {queryKeys} from '@/lib/query-keys'
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'
import {format} from 'date-fns'
import {Calendar, ChevronDown, ChevronRight, Globe, Save, Send, Trash2, Type, X} from 'lucide-react'
import {type ReactNode, useCallback, useRef, useState} from 'react'
import {useNavigate, useParams} from 'react-router-dom'
import {toast} from 'sonner'

const RESERVED_NAMES = new Set(['firstName', 'lastName', 'fullName'])
const VAR_NAME_REGEX = /^[a-zA-Z][a-zA-Z0-9]*$/

export function TemplateEditPage() {
  const {id} = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const isEdit = !!id

  const [name, setName] = useState('')
  const [content, setContent] = useState('')
  const [customVariables, setCustomVariables] = useState<TemplateVariable[]>([])
  const [newVarName, setNewVarName] = useState('')
  const [newVarType, setNewVarType] = useState<'text' | 'date'>('text')

  // Load existing template
  const [loadedId, setLoadedId] = useState<number | null>(null)
  const {isLoading} = useQuery({
    queryKey: queryKeys.template(Number(id)),
    queryFn: () => fetchTemplate(Number(id)),
    enabled: isEdit,
  })

  // Using the query data callback to populate form
  const {data: templateData} = useQuery({
    queryKey: queryKeys.template(Number(id)),
    queryFn: () => fetchTemplate(Number(id)),
    enabled: isEdit,
  })

  if (templateData && loadedId !== templateData.id) {
    setLoadedId(templateData.id)
    setName(templateData.name)
    setContent(templateData.content)
    if (templateData.customVariables) {
      try {
        setCustomVariables(JSON.parse(templateData.customVariables))
      } catch {
        /* ignore */
      }
    }
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name,
        content,
        customVariables: customVariables.length > 0 ? JSON.stringify(customVariables) : null,
      }
      if (isEdit) {
        return updateTemplate(Number(id), payload)
      }
      return createTemplate(payload)
    },
    onSuccess: (template) => {
      queryClient.invalidateQueries({queryKey: queryKeys.templates()})
      if (isEdit) {
        queryClient.invalidateQueries({queryKey: queryKeys.template(Number(id))})
      }
      toast.success(isEdit ? 'Template updated' : 'Template created')
      if (!isEdit) {
        navigate(`/templates/${template.id}/edit`, {replace: true})
      }
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)

  const deleteMutation = useMutation({
    mutationFn: () => deleteTemplates([Number(id)]),
    onSuccess: () => {
      queryClient.invalidateQueries({queryKey: queryKeys.templates()})
      toast.success('Template deleted')
      navigate('/templates')
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const handleAddVariable = () => {
    const trimmed = newVarName.trim()
    if (!trimmed) return
    if (!VAR_NAME_REGEX.test(trimmed)) {
      toast.error('Variable name must be alphanumeric and start with a letter')
      return
    }
    if (RESERVED_NAMES.has(trimmed)) {
      toast.error(`"${trimmed}" is a reserved variable name`)
      return
    }
    if (customVariables.some((v) => v.name === trimmed)) {
      toast.error(`Variable "${trimmed}" already exists`)
      return
    }
    setCustomVariables([...customVariables, {name: trimmed, type: newVarType}])
    setNewVarName('')
  }

  const removeVariable = (varName: string) => {
    setCustomVariables(customVariables.filter((v) => v.name !== varName))
  }

  const {data: globalVariables} = useQuery({
    queryKey: queryKeys.globalVariables(),
    queryFn: () => fetchGlobalVariables(),
  })

  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const insertVariable = useCallback((varName: string) => {
    const text = `{{${varName}}}`
    const el = textareaRef.current
    if (!el) {
      setContent((c) => c + text)
      return
    }
    const start = el.selectionStart
    const end = el.selectionEnd
    setContent((c) => c.substring(0, start) + text + c.substring(end))
    requestAnimationFrame(() => {
      el.focus()
      const pos = start + text.length
      el.setSelectionRange(pos, pos)
    })
  }, [])

  // Preview rendering
  const renderPreview = () => {
    let preview = content
      .replace(/\{\{firstName\}\}/g, 'John')
      .replace(/\{\{lastName\}\}/g, 'Doe')
      .replace(/\{\{fullName\}\}/g, 'John Doe')

    // Resolve global variables
    if (globalVariables) {
      for (const g of globalVariables) {
        preview = preview.replace(new RegExp(`\\{\\{${g.name}\\}\\}`, 'g'), g.value)
      }
    }

    for (const v of customVariables) {
      const placeholder = v.type === 'date' ? format(new Date(), 'MMMM d, yyyy') : `[${v.name}]`
      preview = preview.replace(new RegExp(`\\{\\{${v.name}\\}\\}`, 'g'), placeholder)
    }
    return preview
  }

  const handleSave = () => {
    if (!name.trim()) {
      toast.error('Template name is required')
      return
    }
    saveMutation.mutate()
  }

  if (isEdit && isLoading) {
    return <InlineSpinner />
  }

  return (
    <div className="p-4 md:p-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <X className="h-4 w-4" />
        </Button>
        <h2 className="text-xl font-semibold">{isEdit ? 'Edit Template' : 'Create Template'}</h2>
      </div>

      {/* Two-column layout: form + phone preview */}
      <div className="flex gap-8">
        {/* Left: Form */}
        <div className="flex-1 min-w-0 space-y-4 max-w-3xl">
          {/* === NAME Section === */}
          <Card>
            <CardHeader>
              <CardTitle>Template Name</CardTitle>
              <p className="text-sm text-muted-foreground">Give your template a descriptive name.</p>
            </CardHeader>
            <CardContent>
              <Input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Event Invitation"
              />
            </CardContent>
          </Card>

          {/* === MESSAGE Section === */}
          <Card>
            <CardHeader>
              <CardTitle>Message Body</CardTitle>
              <p className="text-sm text-muted-foreground">Compose your template message content.</p>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Variable insertion */}
              <div className="space-y-2">
                <VariableDropdown label="Person Variables">
                  <div className="flex flex-wrap gap-2 mt-2">
                    <Button variant="outline" size="sm" onClick={() => insertVariable('firstName')}>
                      {'{{firstName}}'}
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => insertVariable('lastName')}>
                      {'{{lastName}}'}
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => insertVariable('fullName')}>
                      {'{{fullName}}'}
                    </Button>
                  </div>
                </VariableDropdown>

                <VariableDropdown label="Custom Variables" count={customVariables.length} defaultOpen>
                  <div className="space-y-3 mt-2">
                    <div className="flex gap-2 items-end">
                      <div className="flex-1">
                        <Input
                          value={newVarName}
                          onChange={(e) => setNewVarName(e.target.value)}
                          placeholder="variableName"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleAddVariable()
                          }}
                        />
                      </div>
                      <Select value={newVarType} onValueChange={(v) => setNewVarType(v as 'text' | 'date')}>
                        <SelectTrigger className="w-28">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="text">Text</SelectItem>
                          <SelectItem value="date">Date</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button onClick={handleAddVariable}>Add</Button>
                    </div>
                    {customVariables.length > 0 && (
                      <>
                        <div className="flex flex-wrap gap-2">
                          {customVariables.map((v) => (
                            <Badge key={v.name} variant="secondary" className="gap-1 pr-1">
                              {v.type === 'date' ? <Calendar className="h-3 w-3" /> : <Type className="h-3 w-3" />}
                              {v.name}
                              <button
                                type="button"
                                className="ml-1 rounded-full hover:bg-destructive/20 p-0.5 cursor-pointer"
                                onClick={() => removeVariable(v.name)}
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </Badge>
                          ))}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <span className="text-xs text-muted-foreground self-center mr-1">Insert:</span>
                          {customVariables.map((v) => (
                            <Button key={v.name} variant="outline" size="sm" onClick={() => insertVariable(v.name)}>
                              {v.type === 'date' ? (
                                <Calendar className="h-3 w-3 mr-1" />
                              ) : (
                                <Type className="h-3 w-3 mr-1" />
                              )}
                              {`{{${v.name}}}`}
                            </Button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                </VariableDropdown>

                {globalVariables && globalVariables.length > 0 && (
                  <VariableDropdown label="Global Variables" count={globalVariables.length} defaultOpen>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {globalVariables.map((v) => (
                        <Button key={v.name} variant="outline" size="sm" onClick={() => insertVariable(v.name)}>
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
                rows={8}
                placeholder="Type your template message here..."
              />
            </CardContent>
          </Card>

          {/* Bottom actions */}
          <div className="flex items-center justify-between">
            {isEdit ? (
              <Button variant="destructive" size="sm" onClick={() => setConfirmDeleteOpen(true)}>
                <Trash2 className="h-4 w-4 mr-1.5" />
                Delete
              </Button>
            ) : (
              <div />
            )}
            <Button size="sm" onClick={handleSave} disabled={saveMutation.isPending || !name.trim()}>
              <Save className="h-4 w-4 mr-1.5" />
              {saveMutation.isPending ? 'Saving...' : isEdit ? 'Update Template' : 'Create Template'}
            </Button>
          </div>
        </div>

        {/* Right: Phone Preview (desktop only) */}
        <div className="hidden lg:block w-[300px] shrink-0">
          <div className="sticky top-6">
            <div className="text-center mb-3">
              <p className="text-sm font-medium">SMS Preview</p>
              <p className="text-xs text-muted-foreground">John Doe</p>
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
                    <Type className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <p className="text-xs font-medium">John Doe</p>
                </div>
                {/* Messages area */}
                <div className="min-h-[320px] max-h-[400px] overflow-auto p-3 bg-muted/30">
                  {content ? (
                    <div className="flex justify-start">
                      <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-muted px-3 py-2">
                        <p className="text-xs whitespace-pre-wrap leading-relaxed">{renderPreview()}</p>
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

      <ConfirmDialog
        open={confirmDeleteOpen}
        onOpenChange={setConfirmDeleteOpen}
        title="Delete Template"
        description="Are you sure you want to delete this template? This action cannot be undone."
        confirmLabel="Delete"
        variant="destructive"
        loading={deleteMutation.isPending}
        onConfirm={() => deleteMutation.mutate()}
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
