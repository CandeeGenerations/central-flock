import {ConfirmDialog} from '@/components/confirm-dialog'
import {Badge} from '@/components/ui/badge'
import {Button} from '@/components/ui/button'
import {Checkbox} from '@/components/ui/checkbox'
import {Input} from '@/components/ui/input'
import {SearchInput} from '@/components/ui/search-input'
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from '@/components/ui/table'
import {useSetToggle} from '@/hooks/use-set-toggle'
import {
  createGlobalVariable,
  deleteGlobalVariables,
  deleteTemplates,
  fetchGlobalVariables,
  fetchTemplates,
  updateGlobalVariable,
} from '@/lib/api'
import type {GlobalVariable, TemplateVariable} from '@/lib/api'
import {formatDateTime} from '@/lib/date'
import {queryKeys} from '@/lib/query-keys'
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'
import {ArrowDown, ArrowUp, ArrowUpDown, Calendar, Check, Pencil, Plus, Trash2, Type, X} from 'lucide-react'
import {useMemo, useState} from 'react'
import {Link, useNavigate} from 'react-router-dom'
import {toast} from 'sonner'

export function TemplatesPage() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<'templates' | 'variables'>('templates')
  const [search, setSearch] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [sort, setSort] = useState<'name' | 'updatedAt'>('name')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  const {data: templates, isLoading} = useQuery({
    queryKey: queryKeys.templates(search || undefined),
    queryFn: () => fetchTemplates({search: search || undefined}),
  })

  const sortedTemplates = useMemo(() => {
    if (!templates) return undefined
    return [...templates].sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1
      if (sort === 'name') return dir * a.name.localeCompare(b.name)
      return dir * a.updatedAt.localeCompare(b.updatedAt)
    })
  }, [templates, sort, sortDir])

  const {data: globalVariables} = useQuery({
    queryKey: queryKeys.globalVariables(),
    queryFn: () => fetchGlobalVariables(),
  })

  const deleteMutation = useMutation({
    mutationFn: () => deleteTemplates([...selectedIds]),
    onSuccess: (data) => {
      queryClient.invalidateQueries({queryKey: queryKeys.templates()})
      toast.success(`Deleted ${data.deleted} template${data.deleted !== 1 ? 's' : ''}`)
      setSelectedIds(new Set())
      setConfirmOpen(false)
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to delete templates')
    },
  })

  const toggleSelect = useSetToggle(setSelectedIds)

  const toggleAll = () => {
    if (!templates) return
    if (selectedIds.size === templates.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(templates.map((t) => t.id)))
    }
  }

  const parseVariables = (json: string | null): TemplateVariable[] => {
    if (!json) return []
    try {
      return JSON.parse(json)
    } catch {
      return []
    }
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Templates</h2>
      </div>

      {/* Tab toggle */}
      <div className="flex gap-1 border-b">
        <button
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 cursor-pointer ${
            activeTab === 'templates'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
          onClick={() => setActiveTab('templates')}
        >
          Templates
          {templates && templates.length > 0 && (
            <Badge variant="secondary" className="text-xs">
              {templates.length}
            </Badge>
          )}
        </button>
        <button
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 cursor-pointer ${
            activeTab === 'variables'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
          onClick={() => setActiveTab('variables')}
        >
          Variables
          {globalVariables && globalVariables.length > 0 && (
            <Badge variant="secondary" className="text-xs">
              {globalVariables.length}
            </Badge>
          )}
        </button>
      </div>

      {activeTab === 'templates' && (
        <>
          <div className="flex items-center justify-between">
            <SearchInput
              placeholder="Search templates..."
              value={search}
              onChange={setSearch}
              containerClassName="max-w-sm"
            />
            <div className="flex gap-2">
              {selectedIds.size > 0 && (
                <Button variant="destructive" onClick={() => setConfirmOpen(true)}>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete ({selectedIds.size})
                </Button>
              )}
              <Link to="/templates/new">
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Template
                </Button>
              </Link>
            </div>
          </div>

          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading...</div>
          ) : (
            <div className="border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        checked={templates && templates.length > 0 && selectedIds.size === templates.length}
                        onCheckedChange={toggleAll}
                      />
                    </TableHead>
                    <TableHead>
                      <button
                        className="flex items-center gap-1 font-bold hover:text-foreground cursor-pointer"
                        onClick={() => {
                          if (sort === 'name') setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
                          else {
                            setSort('name')
                            setSortDir('asc')
                          }
                        }}
                      >
                        Name
                        {sort === 'name' ? (
                          sortDir === 'asc' ? (
                            <ArrowUp className="h-3 w-3" />
                          ) : (
                            <ArrowDown className="h-3 w-3" />
                          )
                        ) : (
                          <ArrowUpDown className="h-3 w-3 opacity-50" />
                        )}
                      </button>
                    </TableHead>
                    <TableHead>Content</TableHead>
                    <TableHead>Variables</TableHead>
                    <TableHead>
                      <button
                        className="flex items-center gap-1 font-bold hover:text-foreground cursor-pointer"
                        onClick={() => {
                          if (sort === 'updatedAt') setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
                          else {
                            setSort('updatedAt')
                            setSortDir('desc')
                          }
                        }}
                      >
                        Last Updated
                        {sort === 'updatedAt' ? (
                          sortDir === 'asc' ? (
                            <ArrowUp className="h-3 w-3" />
                          ) : (
                            <ArrowDown className="h-3 w-3" />
                          )
                        ) : (
                          <ArrowUpDown className="h-3 w-3 opacity-50" />
                        )}
                      </button>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedTemplates?.map((template) => {
                    const vars = parseVariables(template.customVariables)
                    return (
                      <TableRow
                        key={template.id}
                        className="cursor-pointer"
                        onClick={(e) => {
                          if ((e.target as HTMLElement).closest('button')) return
                          navigate(`/templates/${template.id}/edit`)
                        }}
                      >
                        <TableCell>
                          <Checkbox
                            checked={selectedIds.has(template.id)}
                            onCheckedChange={() => toggleSelect(template.id)}
                          />
                        </TableCell>
                        <TableCell className="font-medium">{template.name}</TableCell>
                        <TableCell className="max-w-xs truncate text-muted-foreground">
                          {template.content.substring(0, 80)}
                          {template.content.length > 80 ? '...' : ''}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {vars.map((v) => (
                              <Badge key={v.name} variant="outline" className="gap-1 text-xs">
                                {v.type === 'date' ? (
                                  <Calendar className="h-3 w-3" />
                                ) : (
                                  <Type className="h-3 w-3" />
                                )}
                                {v.name}
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                          {formatDateTime(template.updatedAt)}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                  {templates?.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                        No templates yet.{' '}
                        <Link to="/templates/new" className="underline">
                          Create one
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

      {activeTab === 'variables' && <VariablesTab />}

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`Delete ${selectedIds.size} template${selectedIds.size !== 1 ? 's' : ''}?`}
        description="This will permanently delete the selected templates. This action cannot be undone."
        confirmLabel="Delete"
        variant="destructive"
        loading={deleteMutation.isPending}
        onConfirm={() => deleteMutation.mutate()}
      />
    </div>
  )
}

function VariablesTab() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [newValue, setNewValue] = useState('')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editName, setEditName] = useState('')
  const [editValue, setEditValue] = useState('')

  const {data: variables, isLoading} = useQuery({
    queryKey: queryKeys.globalVariables(search || undefined),
    queryFn: () => fetchGlobalVariables({search: search || undefined}),
  })

  const toggleSelect = useSetToggle(setSelectedIds)

  const toggleAll = () => {
    if (!variables) return
    if (selectedIds.size === variables.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(variables.map((v) => v.id)))
    }
  }

  const createMutation = useMutation({
    mutationFn: () => createGlobalVariable({name: newName.trim(), value: newValue}),
    onSuccess: () => {
      queryClient.invalidateQueries({queryKey: queryKeys.globalVariables()})
      toast.success(`Variable "${newName.trim()}" created`)
      setNewName('')
      setNewValue('')
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to create variable')
    },
  })

  const updateMutation = useMutation({
    mutationFn: (variable: {id: number; name: string; value: string}) =>
      updateGlobalVariable(variable.id, {name: variable.name, value: variable.value}),
    onSuccess: () => {
      queryClient.invalidateQueries({queryKey: queryKeys.globalVariables()})
      toast.success('Variable updated')
      setEditingId(null)
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to update variable')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: () => deleteGlobalVariables([...selectedIds]),
    onSuccess: (data) => {
      queryClient.invalidateQueries({queryKey: queryKeys.globalVariables()})
      toast.success(`Deleted ${data.deleted} variable${data.deleted !== 1 ? 's' : ''}`)
      setSelectedIds(new Set())
      setConfirmOpen(false)
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to delete variables')
    },
  })

  const startEditing = (variable: GlobalVariable) => {
    setEditingId(variable.id)
    setEditName(variable.name)
    setEditValue(variable.value)
  }

  const handleCreate = () => {
    if (!newName.trim()) {
      toast.error('Variable name is required')
      return
    }
    createMutation.mutate()
  }

  const handleUpdate = () => {
    if (editingId === null) return
    if (!editName.trim()) {
      toast.error('Variable name is required')
      return
    }
    updateMutation.mutate({id: editingId, name: editName.trim(), value: editValue})
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <SearchInput
          placeholder="Search variables..."
          value={search}
          onChange={setSearch}
          containerClassName="max-w-sm"
        />
        {selectedIds.size > 0 && (
          <Button variant="destructive" onClick={() => setConfirmOpen(true)}>
            <Trash2 className="h-4 w-4 mr-2" />
            Delete ({selectedIds.size})
          </Button>
        )}
      </div>

      {/* Add new variable */}
      <div className="flex gap-2 items-end">
        <div className="w-48">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="variableName"
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreate()
            }}
          />
        </div>
        <div className="flex-1">
          <Input
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            placeholder="Variable value..."
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreate()
            }}
          />
        </div>
        <Button onClick={handleCreate} disabled={createMutation.isPending}>
          <Plus className="h-4 w-4 mr-2" />
          Add
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">Loading...</div>
      ) : (
        <div className="border rounded-md">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={variables && variables.length > 0 && selectedIds.size === variables.length}
                    onCheckedChange={toggleAll}
                  />
                </TableHead>
                <TableHead className="w-48">Name</TableHead>
                <TableHead>Value</TableHead>
                <TableHead className="w-44">Last Updated</TableHead>
                <TableHead className="w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {variables?.map((variable) =>
                editingId === variable.id ? (
                  <TableRow key={variable.id}>
                    <TableCell>
                      <Checkbox
                        checked={selectedIds.has(variable.id)}
                        onCheckedChange={() => toggleSelect(variable.id)}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="h-8"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleUpdate()
                          if (e.key === 'Escape') setEditingId(null)
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        className="h-8"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleUpdate()
                          if (e.key === 'Escape') setEditingId(null)
                        }}
                      />
                    </TableCell>
                    <TableCell />
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={handleUpdate}
                          disabled={updateMutation.isPending}
                        >
                          <Check className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditingId(null)}>
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  <TableRow key={variable.id}>
                    <TableCell>
                      <Checkbox
                        checked={selectedIds.has(variable.id)}
                        onCheckedChange={() => toggleSelect(variable.id)}
                      />
                    </TableCell>
                    <TableCell className="font-medium font-mono text-sm">
                      <Badge variant="outline">{`{{${variable.name}}}`}</Badge>
                    </TableCell>
                    <TableCell className="max-w-md truncate text-muted-foreground">{variable.value}</TableCell>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {formatDateTime(variable.updatedAt)}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => startEditing(variable)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ),
              )}
              {variables?.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    No global variables yet. Add one above.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`Delete ${selectedIds.size} variable${selectedIds.size !== 1 ? 's' : ''}?`}
        description="This will permanently delete the selected variables. Templates using them will show unresolved placeholders."
        confirmLabel="Delete"
        variant="destructive"
        loading={deleteMutation.isPending}
        onConfirm={() => deleteMutation.mutate()}
      />
    </div>
  )
}
