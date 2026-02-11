import {Badge} from '@/components/ui/badge'
import {Button} from '@/components/ui/button'
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card'
import {Input} from '@/components/ui/input'
import {Label} from '@/components/ui/label'
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select'
import {Textarea} from '@/components/ui/textarea'
import {createTemplate, fetchTemplate, updateTemplate} from '@/lib/api'
import type {TemplateVariable} from '@/lib/api'
import {queryKeys} from '@/lib/query-keys'
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'
import {format} from 'date-fns'
import {ArrowLeft, Calendar, Eye, Save, Type, X} from 'lucide-react'
import {useCallback, useRef, useState} from 'react'
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
        customVariables: customVariables.length > 0 ? JSON.stringify(customVariables) : undefined,
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

    for (const v of customVariables) {
      const placeholder =
        v.type === 'date' ? format(new Date(), 'MMMM d, yyyy') : `[${v.name}]`
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
    return <div className="p-6 text-center text-muted-foreground">Loading...</div>
  }

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/templates')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h2 className="text-2xl font-bold">{isEdit ? 'Edit Template' : 'Create Template'}</h2>
      </div>

      {/* Name */}
      <div className="space-y-2">
        <Label>Template Name</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Event Invitation" />
      </div>

      {/* Variable insert buttons */}
      <div className="space-y-2">
        <Label>Insert Variables</Label>
        <div className="flex flex-wrap gap-2">
          <span className="text-xs text-muted-foreground self-center mr-1">Person:</span>
          <Button variant="outline" size="sm" onClick={() => insertVariable('firstName')}>
            {'{{firstName}}'}
          </Button>
          <Button variant="outline" size="sm" onClick={() => insertVariable('lastName')}>
            {'{{lastName}}'}
          </Button>
          <Button variant="outline" size="sm" onClick={() => insertVariable('fullName')}>
            {'{{fullName}}'}
          </Button>
          {customVariables.length > 0 && (
            <>
              <span className="text-xs text-muted-foreground self-center ml-2 mr-1">Custom:</span>
              {customVariables.map((v) => (
                <Button key={v.name} variant="outline" size="sm" onClick={() => insertVariable(v.name)}>
                  {v.type === 'date' ? <Calendar className="h-3 w-3 mr-1" /> : <Type className="h-3 w-3 mr-1" />}
                  {`{{${v.name}}}`}
                </Button>
              ))}
            </>
          )}
        </div>
      </div>

      {/* Message body */}
      <div className="space-y-2">
        <Label>Message Body</Label>
        <Textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={6}
          placeholder="Type your template message here..."
        />
      </div>

      {/* Custom variables */}
      <div className="space-y-3">
        <Label>Custom Variables</Label>
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
        )}
      </div>

      {/* Preview */}
      {content && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Eye className="h-4 w-4" />
              Preview
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap">{renderPreview()}</p>
          </CardContent>
        </Card>
      )}

      {/* Save */}
      <div className="flex justify-end">
        <Button size="lg" onClick={handleSave} disabled={saveMutation.isPending || !name.trim()}>
          <Save className="h-4 w-4 mr-2" />
          {saveMutation.isPending ? 'Saving...' : isEdit ? 'Update Template' : 'Create Template'}
        </Button>
      </div>
    </div>
  )
}
