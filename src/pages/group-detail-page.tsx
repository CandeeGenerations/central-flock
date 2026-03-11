import {ConfirmDialog} from '@/components/confirm-dialog'
import {Badge} from '@/components/ui/badge'
import {Button} from '@/components/ui/button'
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card'
import {Checkbox} from '@/components/ui/checkbox'
import {Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle} from '@/components/ui/dialog'
import {Input} from '@/components/ui/input'
import {Label} from '@/components/ui/label'
import {SearchInput} from '@/components/ui/search-input'
import {InlineSpinner} from '@/components/ui/spinner'
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from '@/components/ui/table'
import {useDebouncedValue} from '@/hooks/use-debounced-value'
import {useSetToggle} from '@/hooks/use-set-toggle'
import {
  type Person,
  addGroupMembers,
  deleteGroup,
  exportGroupCSV,
  fetchGroup,
  fetchNonMembers,
  removeGroupMembers,
  updateGroup,
} from '@/lib/api'
import {formatFullName} from '@/lib/format'
import {queryKeys} from '@/lib/query-keys'
import {cn} from '@/lib/utils'
import {useInfiniteQuery, useMutation, useQuery, useQueryClient} from '@tanstack/react-query'
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Download,
  MessageSquare,
  Save,
  Trash2,
  UserMinus,
  UserPlus,
  UserX,
} from 'lucide-react'
import {useCallback, useMemo, useRef, useState} from 'react'
import {Link, useNavigate, useParams} from 'react-router-dom'
import {toast} from 'sonner'

export function GroupDetailPage() {
  const {id} = useParams<{id: string}>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const groupId = Number(id)

  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({name: '', description: ''})
  const [addMembersOpen, setAddMembersOpen] = useState(false)
  const [memberSearch, setMemberSearch] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [highlightIndex, setHighlightIndex] = useState(-1)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [removeInactiveOpen, setRemoveInactiveOpen] = useState(false)
  const [membersPage, setMembersPage] = useState(1)
  const [membersSearch, setMembersSearch] = useState('')
  const debouncedMembersSearch = useDebouncedValue(membersSearch, 250)
  const membersPageSize = 25

  const {data: group, isLoading} = useQuery({
    queryKey: queryKeys.group(id!),
    queryFn: () => fetchGroup(groupId),
    enabled: !!id,
  })

  const debouncedMemberSearch = useDebouncedValue(memberSearch, 250)

  const {
    data: nonMembersData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: queryKeys.nonMembers(id!, debouncedMemberSearch || undefined),
    queryFn: ({pageParam}) =>
      fetchNonMembers(groupId, {
        search: debouncedMemberSearch || undefined,
        page: pageParam,
        limit: 30,
      }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      const totalPages = Math.ceil(lastPage.total / lastPage.limit)
      return lastPage.page < totalPages ? lastPage.page + 1 : undefined
    },
    enabled: addMembersOpen,
  })

  const nonMembers = useMemo(() => nonMembersData?.pages.flatMap((p) => p.data) || [], [nonMembersData])
  const toggleSelected = useSetToggle(setSelectedIds)

  const handleMemberSearchKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (nonMembers.length === 0) return
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setHighlightIndex((i) => (i < nonMembers.length - 1 ? i + 1 : 0))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setHighlightIndex((i) => (i > 0 ? i - 1 : nonMembers.length - 1))
      } else if (e.key === 'Enter' && highlightIndex >= 0 && highlightIndex < nonMembers.length) {
        e.preventDefault()
        toggleSelected(nonMembers[highlightIndex].id)
      }
    },
    [nonMembers, highlightIndex, toggleSelected],
  )

  const observerRef = useRef<IntersectionObserver | null>(null)
  const sentinelRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (observerRef.current) observerRef.current.disconnect()
      if (!node) return
      observerRef.current = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage()
        }
      })
      observerRef.current.observe(node)
    },
    [hasNextPage, isFetchingNextPage, fetchNextPage],
  )

  const invalidateGroupMembership = () => {
    queryClient.invalidateQueries({queryKey: queryKeys.group(id!)})
    queryClient.invalidateQueries({queryKey: queryKeys.groups})
    queryClient.invalidateQueries({queryKey: queryKeys.drafts()})
  }

  const updateMutation = useMutation({
    mutationFn: () => updateGroup(groupId, form),
    onSuccess: () => {
      queryClient.invalidateQueries({queryKey: queryKeys.group(id!)})
      queryClient.invalidateQueries({queryKey: queryKeys.groups})
      setEditing(false)
      toast.success('Group updated')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: () => deleteGroup(groupId),
    onSuccess: () => {
      queryClient.invalidateQueries({queryKey: queryKeys.groups})
      navigate('/groups')
      toast.success('Group deleted')
    },
  })

  const addMembersMutation = useMutation({
    mutationFn: (personIds: number[]) => addGroupMembers(groupId, personIds),
    onSuccess: () => {
      invalidateGroupMembership()
      queryClient.invalidateQueries({queryKey: ['nonMembers']})
      setSelectedIds(new Set())
      setAddMembersOpen(false)
      toast.success('Members added')
    },
  })

  const removeMemberMutation = useMutation({
    mutationFn: (personId: number) => removeGroupMembers(groupId, [personId]),
    onSuccess: () => {
      invalidateGroupMembership()
      toast.success('Member removed')
    },
  })

  const inactiveMembers = group?.members.filter((m: Person) => m.status !== 'active') || []

  const removeInactiveMutation = useMutation({
    mutationFn: () =>
      removeGroupMembers(
        groupId,
        inactiveMembers.map((m: Person) => m.id),
      ),
    onSuccess: () => {
      invalidateGroupMembership()
      setRemoveInactiveOpen(false)
      toast.success(`Removed ${inactiveMembers.length} inactive/DNC member${inactiveMembers.length !== 1 ? 's' : ''}`)
    },
  })

  const startEditing = () => {
    if (group) {
      setForm({name: group.name, description: group.description || ''})
      setEditing(true)
    }
  }

  if (isLoading) return <InlineSpinner />
  if (!group) return <div className="p-6">Group not found</div>

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/groups')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h2 className="text-2xl font-bold">{group.name}</h2>
        <Badge variant="outline">{group.members.length} members</Badge>
      </div>

      {/* Group info */}
      <Card>
        <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <CardTitle>Group Info</CardTitle>
          <div className="flex flex-wrap gap-2">
            {!editing && (
              <Button variant="outline" size="sm" onClick={startEditing}>
                Edit
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                try {
                  await exportGroupCSV(groupId)
                  toast.success('CSV exported')
                } catch {
                  toast.error('Failed to export CSV')
                }
              }}
            >
              <Download className="h-4 w-4 mr-1" />
              Export CSV
            </Button>
            <Link to={`/messages/compose?groupId=${group.id}`}>
              <Button variant="outline" size="sm">
                <MessageSquare className="h-4 w-4 mr-1" />
                Send Message
              </Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          {editing ? (
            <div className="space-y-3">
              <div>
                <Label>Name</Label>
                <Input value={form.name} onChange={(e) => setForm((f) => ({...f, name: e.target.value}))} />
              </div>
              <div>
                <Label>Description</Label>
                <Input
                  value={form.description}
                  onChange={(e) => setForm((f) => ({...f, description: e.target.value}))}
                />
              </div>
              <div className="flex gap-2">
                <Button onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending}>
                  <Save className="h-4 w-4 mr-1" />
                  Save
                </Button>
                <Button variant="outline" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-muted-foreground">{group.description || 'No description'}</p>
          )}
        </CardContent>
      </Card>

      {/* Members */}
      <Card>
        <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <CardTitle>Members</CardTitle>
          <div className="flex flex-wrap gap-2 self-end sm:self-auto">
            {inactiveMembers.length > 0 && (
              <Button variant="outline" size="sm" onClick={() => setRemoveInactiveOpen(true)}>
                <UserX className="h-4 w-4 mr-1" />
                Remove Inactive/DNC ({inactiveMembers.length})
              </Button>
            )}
            <Button size="sm" onClick={() => setAddMembersOpen(true)}>
              <UserPlus className="h-4 w-4 mr-1" />
              Add Members
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <SearchInput
            placeholder="Search members..."
            value={membersSearch}
            onChange={(v) => {
              setMembersSearch(v)
              setMembersPage(1)
            }}
            containerClassName="sm:max-w-sm"
          />
          {(() => {
            const filteredMembers = debouncedMembersSearch
              ? group.members.filter((m: Person) => {
                  const q = debouncedMembersSearch.toLowerCase()
                  return (
                    formatFullName(m).toLowerCase().includes(q) || (m.phoneDisplay || m.phoneNumber || '').includes(q)
                  )
                })
              : group.members
            return (
              <>
                <div className="border rounded-md bg-card overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Phone</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="w-16"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredMembers
                        .slice((membersPage - 1) * membersPageSize, membersPage * membersPageSize)
                        .map((m: Person) => (
                          <TableRow
                            key={m.id}
                            className="cursor-pointer hover:bg-muted/50"
                            onClick={() => navigate(`/people/${m.id}`)}
                          >
                            <TableCell className="font-medium">{formatFullName(m)}</TableCell>
                            <TableCell className="text-muted-foreground">{m.phoneDisplay || m.phoneNumber}</TableCell>
                            <TableCell>
                              <Badge
                                variant={
                                  m.status === 'active'
                                    ? 'default'
                                    : m.status === 'do_not_contact'
                                      ? 'destructive'
                                      : 'secondary'
                                }
                              >
                                {m.status === 'do_not_contact' ? 'do not contact' : m.status}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  removeMemberMutation.mutate(m.id)
                                }}
                                title="Remove from group"
                              >
                                <UserMinus className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      {filteredMembers.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center text-muted-foreground py-6">
                            {group.members.length === 0 ? 'No members' : 'No members match your search.'}
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
                {filteredMembers.length > membersPageSize && (
                  <div className="flex items-center justify-between pt-4">
                    <span className="text-sm text-muted-foreground">
                      Showing {(membersPage - 1) * membersPageSize + 1}–
                      {Math.min(membersPage * membersPageSize, filteredMembers.length)} of {filteredMembers.length}
                    </span>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={membersPage <= 1}
                        onClick={() => setMembersPage((p) => p - 1)}
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={membersPage * membersPageSize >= filteredMembers.length}
                        onClick={() => setMembersPage((p) => p + 1)}
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )
          })()}
        </CardContent>
      </Card>

      {/* Delete */}
      <Button variant="destructive" onClick={() => setDeleteConfirmOpen(true)}>
        <Trash2 className="h-4 w-4 mr-1" />
        Delete Group
      </Button>

      {/* Add members dialog */}
      <Dialog open={addMembersOpen} onOpenChange={setAddMembersOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Add Members to {group.name}</DialogTitle>
          </DialogHeader>
          <SearchInput
            placeholder="Search people..."
            value={memberSearch}
            onChange={(v) => {
              setMemberSearch(v)
              setHighlightIndex(-1)
            }}
            onKeyDown={handleMemberSearchKeyDown}
          />
          <div className="flex-1 overflow-auto space-y-1 min-h-0 max-h-64">
            {nonMembers.map((p, i) => (
              <label
                key={p.id}
                ref={i === highlightIndex ? (el) => el?.scrollIntoView({block: 'nearest'}) : undefined}
                className={cn(
                  'group flex items-center gap-3 px-3 py-2 rounded cursor-pointer',
                  i === highlightIndex
                    ? 'bg-accent text-accent-foreground'
                    : 'hover:bg-accent hover:text-accent-foreground',
                )}
              >
                <Checkbox checked={selectedIds.has(p.id)} onCheckedChange={() => toggleSelected(p.id)} />
                <span className="flex-1">{formatFullName(p)}</span>
                <span className="text-sm group-hover:text-inherit">{p.phoneDisplay}</span>
              </label>
            ))}
            {nonMembers.length === 0 && <p className="text-center text-muted-foreground py-4">No people to add</p>}
            <div ref={sentinelRef} className="h-1" />
            {isFetchingNextPage && <p className="text-center text-muted-foreground text-sm py-2">Loading more...</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddMembersOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={selectedIds.size === 0 || addMembersMutation.isPending}
              onClick={() => addMembersMutation.mutate([...selectedIds])}
            >
              Add {selectedIds.size} Member{selectedIds.size !== 1 ? 's' : ''}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title="Delete this group?"
        description="Members will not be deleted."
        confirmLabel="Delete"
        variant="destructive"
        loading={deleteMutation.isPending}
        onConfirm={() => deleteMutation.mutate()}
      />
      <ConfirmDialog
        open={removeInactiveOpen}
        onOpenChange={setRemoveInactiveOpen}
        title={`Remove ${inactiveMembers.length} inactive/DNC member${inactiveMembers.length !== 1 ? 's' : ''}?`}
        description="They will be removed from this group but not deleted."
        confirmLabel="Remove"
        variant="destructive"
        loading={removeInactiveMutation.isPending}
        onConfirm={() => removeInactiveMutation.mutate()}
      />
    </div>
  )
}
