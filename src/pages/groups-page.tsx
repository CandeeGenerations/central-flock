import {ConfirmDialog} from '@/components/confirm-dialog'
import {Button} from '@/components/ui/button'
import {Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger} from '@/components/ui/dialog'
import {Input} from '@/components/ui/input'
import {Label} from '@/components/ui/label'
import {SearchInput} from '@/components/ui/search-input'
import {PageSpinner} from '@/components/ui/spinner'
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from '@/components/ui/table'
import {useDebouncedValue} from '@/hooks/use-debounced-value'
import {usePersistedState} from '@/hooks/use-persisted-state'
import {createGroup, deleteGroup, fetchGroups} from '@/lib/api'
import {formatDate} from '@/lib/date'
import {queryKeys} from '@/lib/query-keys'
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'
import {ArrowDown, ArrowUp, ArrowUpDown, MessageSquare, Plus, Trash2} from 'lucide-react'
import {useMemo, useState} from 'react'
import {Link, useNavigate} from 'react-router-dom'
import {toast} from 'sonner'

type SortKey = 'name' | 'memberCount' | 'createdAt'
type SortDir = 'asc' | 'desc'

export function GroupsPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [addOpen, setAddOpen] = useState(false)
  const [newGroup, setNewGroup] = useState({name: '', description: ''})
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search, 250)
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
          <DialogContent>
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

      {/* Search */}
      <SearchInput
        placeholder="Search groups..."
        value={search}
        onChange={setSearch}
        containerClassName="sm:max-w-sm"
      />

      {isLoading ? (
        <PageSpinner />
      ) : (
        <div className="border rounded-md overflow-x-auto">
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
                <TableHead className="w-24">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredGroups.map((group) => (
                <TableRow key={group.id} className="cursor-pointer" onClick={() => navigate(`/groups/${group.id}`)}>
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
                      <Link to={`/messages/compose?groupId=${group.id}`} onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" title="Send message to group">
                          <MessageSquare className="h-4 w-4" />
                        </Button>
                      </Link>
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
