import {ConfirmDialog} from '@/components/confirm-dialog'
import {Button} from '@/components/ui/button'
import {Card, CardContent} from '@/components/ui/card'
import {Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger} from '@/components/ui/dialog'
import {Input} from '@/components/ui/input'
import {Label} from '@/components/ui/label'
import {Pagination} from '@/components/ui/pagination'
import {SearchInput} from '@/components/ui/search-input'
import {PageSpinner} from '@/components/ui/spinner'
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from '@/components/ui/table'
import {Tooltip, TooltipContent, TooltipProvider, TooltipTrigger} from '@/components/ui/tooltip'
import {useDebouncedValue} from '@/hooks/use-debounced-value'
import {usePersistedState} from '@/hooks/use-persisted-state'
import {createGroup, deleteGroup, duplicateGroup, fetchGroups} from '@/lib/api'
import {formatDate} from '@/lib/date'
import {queryKeys} from '@/lib/query-keys'
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'
import {ArrowDown, ArrowUp, ArrowUpDown, Copy, MessageSquare, Plus, Trash2} from 'lucide-react'
import {useMemo, useState} from 'react'
import {Link, useNavigate, useSearchParams} from 'react-router-dom'
import {toast} from 'sonner'

type SortKey = 'name' | 'memberCount' | 'createdAt'
type SortDir = 'asc' | 'desc'

export function GroupsPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const queryClient = useQueryClient()
  const addFromParam = searchParams.get('add') === '1'
  const [addOpenLocal, setAddOpenLocal] = useState(false)
  const addOpen = addFromParam || addOpenLocal
  const setAddOpen = (open: boolean) => {
    setAddOpenLocal(open)
    if (!open && addFromParam) {
      setSearchParams(
        (p) => {
          p.delete('add')
          return p
        },
        {replace: true},
      )
    }
  }
  const [newGroup, setNewGroup] = useState({name: '', description: ''})
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search, 250)
  const [page, setPage] = usePersistedState('groups.page', 1)
  const pageSize = 25
  const [sortKey, setSortKey] = usePersistedState<SortKey>('groups.sortKey', 'name')
  const [sortDir, setSortDir] = usePersistedState<SortDir>('groups.sortDir', 'asc')
  const [deleteTarget, setDeleteTarget] = useState<{
    id: number
    name: string
  } | null>(null)

  const {data: groups, isLoading} = useQuery({
    queryKey: queryKeys.groups,
    queryFn: fetchGroups,
  })

  const filteredGroups = useMemo(() => {
    if (!groups) return []
    let result = groups
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase()
      result = result.filter((g) => g.name.toLowerCase().includes(q) || (g.description || '').toLowerCase().includes(q))
    }
    result = [...result].sort((a, b) => {
      let cmp = 0
      if (sortKey === 'name') cmp = a.name.localeCompare(b.name)
      else if (sortKey === 'memberCount') cmp = (a.memberCount || 0) - (b.memberCount || 0)
      else if (sortKey === 'createdAt') cmp = a.createdAt.localeCompare(b.createdAt)
      return sortDir === 'desc' ? -cmp : cmp
    })
    return result
  }, [groups, debouncedSearch, sortKey, sortDir])

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const sortIcon = (column: SortKey) => {
    if (sortKey !== column) return <ArrowUpDown className="h-3 w-3 ml-1 opacity-50" />
    return sortDir === 'asc' ? <ArrowUp className="h-3 w-3 ml-1" /> : <ArrowDown className="h-3 w-3 ml-1" />
  }

  const createMutation = useMutation({
    mutationFn: () =>
      createGroup({
        name: newGroup.name,
        description: newGroup.description || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({queryKey: queryKeys.groups})
      setAddOpen(false)
      setNewGroup({name: '', description: ''})
      toast.success('Group created')
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const deleteMutation = useMutation({
    mutationFn: deleteGroup,
    onSuccess: () => {
      queryClient.invalidateQueries({queryKey: queryKeys.groups})
      toast.success('Group deleted')
      setDeleteTarget(null)
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const duplicateMutation = useMutation({
    mutationFn: duplicateGroup,
    onSuccess: (group) => {
      queryClient.invalidateQueries({queryKey: queryKeys.groups})
      toast.success(`Group duplicated as "${group.name}"`)
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const paginatedGroups = filteredGroups.slice((page - 1) * pageSize, page * pageSize)

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-2xl font-bold">Groups</h2>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Create Group
            </Button>
          </DialogTrigger>
          <DialogContent
            onOpenAutoFocus={(e) => {
              e.preventDefault()
              const input = (e.target as HTMLElement).querySelector<HTMLInputElement>('input')
              input?.focus()
            }}
          >
            <DialogHeader>
              <DialogTitle>Create Group</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Name</Label>
                <Input value={newGroup.name} onChange={(e) => setNewGroup((g) => ({...g, name: e.target.value}))} />
              </div>
              <div>
                <Label>Description (optional)</Label>
                <Input
                  value={newGroup.description}
                  onChange={(e) => setNewGroup((g) => ({...g, description: e.target.value}))}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAddOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => createMutation.mutate()}
                disabled={createMutation.isPending || !newGroup.name.trim()}
              >
                {createMutation.isPending ? 'Creating...' : 'Create'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <PageSpinner />
      ) : (
        <Card size="sm">
          <CardContent>
            <SearchInput
              placeholder="Search groups..."
              value={search}
              onChange={(v) => {
                setSearch(v)
                setPage(1)
              }}
              containerClassName="sm:max-w-sm"
            />
          </CardContent>
          <div className="overflow-x-auto border-t">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    <button className="flex items-center font-bold cursor-pointer" onClick={() => toggleSort('name')}>
                      Name {sortIcon('name')}
                    </button>
                  </TableHead>
                  <TableHead>
                    <button
                      className="flex items-center font-bold cursor-pointer"
                      onClick={() => toggleSort('memberCount')}
                    >
                      Members {sortIcon('memberCount')}
                    </button>
                  </TableHead>
                  <TableHead>
                    <button
                      className="flex items-center font-bold cursor-pointer"
                      onClick={() => toggleSort('createdAt')}
                    >
                      Created {sortIcon('createdAt')}
                    </button>
                  </TableHead>
                  <TableHead className="w-32">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedGroups.map((group) => (
                  <TableRow
                    key={group.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => navigate(`/groups/${group.id}`)}
                  >
                    <TableCell className="font-medium">
                      {group.name}
                      {group.description && (
                        <span className="text-muted-foreground font-normal"> ({group.description})</span>
                      )}
                    </TableCell>
                    <TableCell>{group.memberCount}</TableCell>
                    <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                      {formatDate(group.createdAt)}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Link to={`/messages/compose?groupId=${group.id}`} onClick={(e) => e.stopPropagation()}>
                                <Button variant="ghost" size="icon">
                                  <MessageSquare className="h-4 w-4" />
                                </Button>
                              </Link>
                            </TooltipTrigger>
                            <TooltipContent>Send message to group</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                disabled={duplicateMutation.isPending}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  duplicateMutation.mutate(group.id)
                                }}
                              >
                                <Copy className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Duplicate group</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => {
                            e.stopPropagation()
                            setDeleteTarget({id: group.id, name: group.name})
                          }}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {filteredGroups.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                      {groups?.length === 0
                        ? 'No groups yet. Create one or import from CSV.'
                        : 'No groups match your search.'}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          <CardContent>
            <Pagination
              page={page}
              pageSize={pageSize}
              total={filteredGroups.length}
              onPageChange={setPage}
              noun="groups"
            />
          </CardContent>
        </Card>
      )}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open: boolean) => {
          if (!open) setDeleteTarget(null)
        }}
        title={`Delete group "${deleteTarget?.name}"?`}
        description="Members will not be deleted."
        confirmLabel="Delete"
        variant="destructive"
        loading={deleteMutation.isPending}
        onConfirm={() => {
          if (deleteTarget) deleteMutation.mutate(deleteTarget.id)
        }}
      />
    </div>
  )
}
