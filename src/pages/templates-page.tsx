import {ConfirmDialog} from '@/components/confirm-dialog'
import {Badge} from '@/components/ui/badge'
import {Button} from '@/components/ui/button'
import {Checkbox} from '@/components/ui/checkbox'
import {SearchInput} from '@/components/ui/search-input'
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from '@/components/ui/table'
import {useSetToggle} from '@/hooks/use-set-toggle'
import {deleteTemplates, fetchTemplates} from '@/lib/api'
import type {TemplateVariable} from '@/lib/api'
import {formatDateTime} from '@/lib/date'
import {queryKeys} from '@/lib/query-keys'
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'
import {Calendar, Plus, Trash2, Type} from 'lucide-react'
import {useState} from 'react'
import {Link, useNavigate} from 'react-router-dom'
import {toast} from 'sonner'

export function TemplatesPage() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [confirmOpen, setConfirmOpen] = useState(false)

  const {data: templates, isLoading} = useQuery({
    queryKey: queryKeys.templates(search || undefined),
    queryFn: () => fetchTemplates({search: search || undefined}),
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

      <SearchInput
        placeholder="Search templates..."
        value={search}
        onChange={setSearch}
        containerClassName="max-w-sm"
      />

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
                <TableHead>Name</TableHead>
                <TableHead>Content</TableHead>
                <TableHead>Variables</TableHead>
                <TableHead>Last Updated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {templates?.map((template) => {
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
                            {v.type === 'date' ? <Calendar className="h-3 w-3" /> : <Type className="h-3 w-3" />}
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
