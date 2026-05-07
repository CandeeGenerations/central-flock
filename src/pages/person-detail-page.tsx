import {ConfirmDialog} from '@/components/confirm-dialog'
import {PersonSpecialsCard} from '@/components/specials/person-specials-card'
import {Badge} from '@/components/ui/badge'
import {Button} from '@/components/ui/button'
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card'
import {Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle} from '@/components/ui/dialog'
import {Input} from '@/components/ui/input'
import {Label} from '@/components/ui/label'
import {SearchInput} from '@/components/ui/search-input'
import {SearchableSelect} from '@/components/ui/searchable-select'
import {InlineSpinner} from '@/components/ui/spinner'
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from '@/components/ui/table'
import {Textarea} from '@/components/ui/textarea'
import {Tooltip, TooltipContent, TooltipProvider, TooltipTrigger} from '@/components/ui/tooltip'
import {useDebouncedValue} from '@/hooks/use-debounced-value'
import {
  type Person,
  addGroupMembers,
  createMacContact,
  deletePerson,
  fetchGroups,
  fetchPerson,
  removeGroupMembers,
  updatePerson,
} from '@/lib/api'
import {formatFullName} from '@/lib/format'
import {queryKeys} from '@/lib/query-keys'
import {cn, maskPhoneDisplay, phoneToE164} from '@/lib/utils'
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'
import {ArrowLeft, Contact, MessageSquare, Save, Trash2, UserMinus, UserPlus, X} from 'lucide-react'
import {useMemo, useRef, useState} from 'react'
import {Link, useNavigate, useParams} from 'react-router-dom'
import {toast} from 'sonner'

export function PersonDetailPage() {
  const {id} = useParams<{id: string}>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<Partial<Person>>({})
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [addGroupOpen, setAddGroupOpen] = useState(false)
  const [selectedGroupIds, setSelectedGroupIds] = useState<Set<number>>(new Set())
  const [groupSearch, setGroupSearch] = useState('')
  const debouncedGroupSearch = useDebouncedValue(groupSearch, 200)
  const [groupHighlight, setGroupHighlight] = useState(-1)
  const groupSearchRef = useRef<HTMLInputElement>(null)
  const [removeAllConfirmOpen, setRemoveAllConfirmOpen] = useState(false)

  const {data: person, isLoading} = useQuery({
    queryKey: queryKeys.person(id!),
    queryFn: () => fetchPerson(Number(id)),
    enabled: !!id,
  })

  const updateMutation = useMutation({
    mutationFn: (data: Partial<Person>) => updatePerson(Number(id), data),
    onSuccess: () => {
      queryClient.invalidateQueries({queryKey: queryKeys.person(id!)})
      queryClient.invalidateQueries({queryKey: queryKeys.people})
      setEditing(false)
      toast.success('Person updated')
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const deleteMutation = useMutation({
    mutationFn: () => deletePerson(Number(id)),
    onSuccess: () => {
      queryClient.invalidateQueries({queryKey: queryKeys.people})
      navigate('/people')
      toast.success('Person deleted')
    },
  })

  const contactMutation = useMutation({
    mutationFn: () => createMacContact(Number(id)),
    onSuccess: () => toast.success('Contact created in macOS Contacts'),
    onError: (err: Error) => toast.error(err.message),
  })

  const {data: allGroups} = useQuery({
    queryKey: queryKeys.groups,
    queryFn: fetchGroups,
    enabled: addGroupOpen,
  })

  const currentGroupIds = useMemo(() => new Set(person?.groups?.map((g) => g.id) || []), [person?.groups])
  const availableGroups = useMemo(
    () => allGroups?.filter((g) => !currentGroupIds.has(g.id)) || [],
    [allGroups, currentGroupIds],
  )

  const groupResults = useMemo(() => {
    const q = debouncedGroupSearch?.toLowerCase()
    return availableGroups.filter((g) => !selectedGroupIds.has(g.id) && (!q || g.name.toLowerCase().includes(q)))
  }, [debouncedGroupSearch, availableGroups, selectedGroupIds])

  const handleGroupKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setGroupHighlight((h) => Math.min(h + 1, groupResults.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setGroupHighlight((h) => Math.max(h - 1, 0))
    } else if (e.key === 'Enter' && groupHighlight >= 0 && groupResults[groupHighlight]) {
      e.preventDefault()
      setSelectedGroupIds((prev) => new Set([...prev, groupResults[groupHighlight].id]))
      setGroupSearch('')
      setGroupHighlight(-1)
    }
  }

  const invalidatePersonMembership = () => {
    queryClient.invalidateQueries({queryKey: queryKeys.person(id!)})
    queryClient.invalidateQueries({queryKey: queryKeys.groups})
    queryClient.invalidateQueries({queryKey: queryKeys.drafts()})
  }

  const addGroupMutation = useMutation({
    mutationFn: (groupIds: number[]) => Promise.all(groupIds.map((gid) => addGroupMembers(gid, [Number(id)]))),
    onSuccess: () => {
      invalidatePersonMembership()
      setAddGroupOpen(false)
      setSelectedGroupIds(new Set())
      setGroupSearch('')
      toast.success('Added to groups')
    },
  })

  const removeGroupMutation = useMutation({
    mutationFn: (groupId: number) => removeGroupMembers(groupId, [Number(id)]),
    onSuccess: () => {
      invalidatePersonMembership()
      toast.success('Removed from group')
    },
  })

  const startEditing = () => {
    if (person) {
      setForm({
        firstName: person.firstName,
        lastName: person.lastName,
        phoneNumber: person.phoneNumber,
        phoneDisplay: person.phoneDisplay,
        status: person.status,
        notes: person.notes,
        birthMonth: person.birthMonth,
        birthDay: person.birthDay,
        birthYear: person.birthYear,
        anniversaryMonth: person.anniversaryMonth,
        anniversaryDay: person.anniversaryDay,
        anniversaryYear: person.anniversaryYear,
      })
      setEditing(true)
    }
  }

  if (isLoading) return <InlineSpinner />
  if (!person) return <div className="p-6">Person not found</div>

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-2xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/people')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h2 className="text-2xl font-bold">{formatFullName(person)}</h2>
        <Badge
          variant={
            person.status === 'active' ? 'default' : person.status === 'do_not_contact' ? 'destructive' : 'secondary'
          }
        >
          {person.status === 'do_not_contact' ? 'do not contact' : person.status}
        </Badge>
      </div>

      <Card>
        <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <CardTitle>Details</CardTitle>
          <div className="flex flex-wrap gap-2">
            {!editing && (
              <Button variant="outline" size="sm" onClick={startEditing}>
                Edit
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => contactMutation.mutate()}
              disabled={contactMutation.isPending}
            >
              <Contact className="h-4 w-4 mr-1" />
              Create Contact
            </Button>
            {person.phoneNumber ? (
              <Link to={`/messages/compose?recipientId=${person.id}`}>
                <Button size="sm">
                  <MessageSquare className="h-4 w-4 mr-1" />
                  Send Message
                </Button>
              </Link>
            ) : (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="outline" size="sm" disabled>
                      <MessageSquare className="h-4 w-4 mr-1" />
                      Send Message
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>No phone number</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {editing ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>First Name</Label>
                  <Input
                    value={form.firstName || ''}
                    onChange={(e) => setForm((f) => ({...f, firstName: e.target.value}))}
                  />
                </div>
                <div>
                  <Label>Last Name</Label>
                  <Input
                    value={form.lastName || ''}
                    onChange={(e) => setForm((f) => ({...f, lastName: e.target.value}))}
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Phone Number</Label>
                  <Input
                    value={form.phoneDisplay || ''}
                    onChange={(e) => {
                      const masked = maskPhoneDisplay(e.target.value)
                      setForm((f) => ({
                        ...f,
                        phoneDisplay: masked,
                        phoneNumber: phoneToE164(masked),
                      }))
                    }}
                    placeholder="(555) 123-4567"
                  />
                  {(() => {
                    const digits = (form.phoneDisplay || '').replace(/\D/g, '')
                    return digits.length > 0 && digits.length !== 10 ? (
                      <p className="text-xs text-destructive mt-1">Must be 10 digits ({digits.length}/10)</p>
                    ) : null
                  })()}
                </div>
                <div>
                  <Label>E.164 Format</Label>
                  <p className="text-sm font-mono mt-1">{form.phoneNumber || '—'}</p>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Status</Label>
                  <SearchableSelect
                    value={form.status || 'active'}
                    onValueChange={(v) => setForm((f) => ({...f, status: v as Person['status']}))}
                    options={[
                      {value: 'active', label: 'Active'},
                      {value: 'inactive', label: 'Inactive'},
                      {value: 'do_not_contact', label: 'Do Not Contact'},
                    ]}
                    searchable={false}
                    className="w-48"
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label>Birth Month</Label>
                  <SearchableSelect
                    value={form.birthMonth ? String(form.birthMonth) : ''}
                    onValueChange={(v) => setForm((f) => ({...f, birthMonth: v ? Number(v) : null}))}
                    options={[
                      {value: '', label: 'None'},
                      ...Array.from({length: 12}, (_, i) => ({
                        value: String(i + 1),
                        label: new Date(2000, i).toLocaleString('default', {month: 'long'}),
                      })),
                    ]}
                    className="w-full"
                  />
                </div>
                <div>
                  <Label>Birth Day</Label>
                  <SearchableSelect
                    value={form.birthDay ? String(form.birthDay) : ''}
                    onValueChange={(v) => setForm((f) => ({...f, birthDay: v ? Number(v) : null}))}
                    options={[
                      {value: '', label: 'None'},
                      ...Array.from({length: 31}, (_, i) => ({value: String(i + 1), label: String(i + 1)})),
                    ]}
                    className="w-full"
                  />
                </div>
                <div>
                  <Label>Birth Year</Label>
                  <Input
                    type="number"
                    value={form.birthYear ?? ''}
                    onChange={(e) =>
                      setForm((f) => ({...f, birthYear: e.target.value ? Number(e.target.value) : null}))
                    }
                    placeholder="Optional"
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label>Anniversary Month</Label>
                  <SearchableSelect
                    value={form.anniversaryMonth ? String(form.anniversaryMonth) : ''}
                    onValueChange={(v) => setForm((f) => ({...f, anniversaryMonth: v ? Number(v) : null}))}
                    options={[
                      {value: '', label: 'None'},
                      ...Array.from({length: 12}, (_, i) => ({
                        value: String(i + 1),
                        label: new Date(2000, i).toLocaleString('default', {month: 'long'}),
                      })),
                    ]}
                    className="w-full"
                  />
                </div>
                <div>
                  <Label>Anniversary Day</Label>
                  <SearchableSelect
                    value={form.anniversaryDay ? String(form.anniversaryDay) : ''}
                    onValueChange={(v) => setForm((f) => ({...f, anniversaryDay: v ? Number(v) : null}))}
                    options={[
                      {value: '', label: 'None'},
                      ...Array.from({length: 31}, (_, i) => ({value: String(i + 1), label: String(i + 1)})),
                    ]}
                    className="w-full"
                  />
                </div>
                <div>
                  <Label>Anniversary Year</Label>
                  <Input
                    type="number"
                    value={form.anniversaryYear ?? ''}
                    onChange={(e) =>
                      setForm((f) => ({...f, anniversaryYear: e.target.value ? Number(e.target.value) : null}))
                    }
                    placeholder="Optional"
                  />
                </div>
              </div>
              <div>
                <Label>Notes</Label>
                <Textarea
                  value={form.notes || ''}
                  onChange={(e) => setForm((f) => ({...f, notes: e.target.value}))}
                  rows={3}
                />
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={() => updateMutation.mutate(form)}
                  disabled={
                    updateMutation.isPending ||
                    ((form.phoneDisplay || '').replace(/\D/g, '').length > 0 &&
                      (form.phoneDisplay || '').replace(/\D/g, '').length !== 10)
                  }
                >
                  <Save className="h-4 w-4 mr-1" />
                  {updateMutation.isPending ? 'Saving...' : 'Save'}
                </Button>
                <Button variant="outline" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
              </div>
            </>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <span className="text-sm text-muted-foreground">First Name</span>
                  <p>{person.firstName || '—'}</p>
                </div>
                <div>
                  <span className="text-sm text-muted-foreground">Last Name</span>
                  <p>{person.lastName || '—'}</p>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <span className="text-sm text-muted-foreground">Phone</span>
                  <p>
                    {person.phoneDisplay || person.phoneNumber || (
                      <span className="text-muted-foreground">No phone</span>
                    )}
                  </p>
                </div>
                <div>
                  <span className="text-sm text-muted-foreground">E.164</span>
                  <p className="font-mono text-sm">{person.phoneNumber || '—'}</p>
                </div>
              </div>
              {(person.birthMonth || person.birthDay || person.anniversaryMonth || person.anniversaryDay) && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {(person.birthMonth || person.birthDay) && (
                    <div>
                      <span className="text-sm text-muted-foreground">Birthday</span>
                      <p>
                        {person.birthMonth && person.birthDay
                          ? `${new Date(2000, person.birthMonth - 1).toLocaleString('default', {month: 'long'})} ${person.birthDay}`
                          : '—'}
                        {person.birthYear && person.birthMonth && person.birthDay
                          ? (() => {
                              const today = new Date()
                              let age = today.getFullYear() - person.birthYear
                              const hadBirthday =
                                today.getMonth() + 1 > person.birthMonth ||
                                (today.getMonth() + 1 === person.birthMonth && today.getDate() >= person.birthDay)
                              if (!hadBirthday) age--
                              return `, ${person.birthYear} (age ${age})`
                            })()
                          : ''}
                      </p>
                    </div>
                  )}
                  {(person.anniversaryMonth || person.anniversaryDay) && (
                    <div>
                      <span className="text-sm text-muted-foreground">Anniversary</span>
                      <p>
                        {person.anniversaryMonth && person.anniversaryDay
                          ? `${new Date(2000, person.anniversaryMonth - 1).toLocaleString('default', {month: 'long'})} ${person.anniversaryDay}`
                          : '—'}
                        {person.anniversaryYear && person.anniversaryMonth && person.anniversaryDay
                          ? (() => {
                              const today = new Date()
                              let years = today.getFullYear() - person.anniversaryYear
                              const hadAnniversary =
                                today.getMonth() + 1 > person.anniversaryMonth ||
                                (today.getMonth() + 1 === person.anniversaryMonth &&
                                  today.getDate() >= person.anniversaryDay)
                              if (!hadAnniversary) years--
                              return `, ${person.anniversaryYear} (${years} ${years === 1 ? 'year' : 'years'})`
                            })()
                          : ''}
                      </p>
                    </div>
                  )}
                </div>
              )}
              {person.notes && (
                <div>
                  <span className="text-sm text-muted-foreground">Notes</span>
                  <p>{person.notes}</p>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Groups */}
      <Card>
        <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <CardTitle>Groups</CardTitle>
          <div className="flex flex-wrap gap-2">
            {person.groups && person.groups.length > 0 && (
              <Button variant="destructive" size="sm" onClick={() => setRemoveAllConfirmOpen(true)}>
                <UserMinus className="h-4 w-4 mr-1" />
                Remove All
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSelectedGroupIds(new Set())
                setGroupSearch('')
                setGroupHighlight(-1)
                setAddGroupOpen(true)
              }}
              disabled={!person.phoneNumber}
              title={!person.phoneNumber ? 'No phone number' : undefined}
            >
              <UserPlus className="h-4 w-4 mr-1" />
              Add to Group
            </Button>
          </div>
        </CardHeader>
        {person.groups && person.groups.length > 0 ? (
          <div className="overflow-x-auto border-t">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead className="w-16">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...person.groups]
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map((g) => (
                    <TableRow
                      key={g.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => navigate(`/groups/${g.id}`)}
                    >
                      <TableCell className="font-medium">{g.name}</TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeGroupMutation.mutate(g.id)}
                          title={`Remove from ${g.name}`}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <CardContent>
            <p className="text-muted-foreground text-sm">Not a member of any groups</p>
          </CardContent>
        )}
      </Card>

      <PersonSpecialsCard personId={Number(id)} />

      {/* Add to Group Dialog */}
      <Dialog open={addGroupOpen} onOpenChange={setAddGroupOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add to Groups</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <SearchInput
              ref={groupSearchRef}
              placeholder="Search groups to add..."
              value={groupSearch}
              onChange={(v) => {
                setGroupSearch(v)
                setGroupHighlight(-1)
              }}
              onKeyDown={handleGroupKeyDown}
              hideShortcut
            />
            <div className="rounded-xl overflow-hidden bg-popover/70 backdrop-blur-2xl backdrop-saturate-150 shadow-lg ring-1 ring-foreground/5 dark:ring-foreground/10">
              <div className="max-h-36 overflow-auto p-1.5">
                {groupResults.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-3">
                    {debouncedGroupSearch ? 'No matching groups found' : 'All groups selected'}
                  </p>
                ) : (
                  groupResults.map((g, i) => (
                    <button
                      key={g.id}
                      ref={i === groupHighlight ? (el) => el?.scrollIntoView({block: 'nearest'}) : undefined}
                      type="button"
                      className={cn(
                        'flex items-center gap-2.5 w-full px-3 py-2 rounded-lg cursor-pointer text-sm font-medium text-left',
                        i === groupHighlight ? 'bg-foreground/10' : 'hover:bg-foreground/10',
                      )}
                      onClick={() => {
                        setSelectedGroupIds((prev) => new Set([...prev, g.id]))
                        setGroupSearch('')
                        setGroupHighlight(-1)
                        groupSearchRef.current?.focus()
                      }}
                    >
                      <span>{g.name}</span>
                      {g.memberCount != null && (
                        <span className="text-muted-foreground ml-auto">
                          {g.memberCount} member{g.memberCount !== 1 ? 's' : ''}
                        </span>
                      )}
                    </button>
                  ))
                )}
              </div>
            </div>
            {selectedGroupIds.size > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {availableGroups
                  .filter((g) => selectedGroupIds.has(g.id))
                  .map((g) => (
                    <Badge
                      key={g.id}
                      className="gap-1 cursor-pointer bg-teal-100 text-teal-800 hover:bg-teal-200 dark:bg-teal-900 dark:text-teal-200 dark:hover:bg-teal-800 border-0"
                      onClick={() =>
                        setSelectedGroupIds((prev) => {
                          const next = new Set(prev)
                          next.delete(g.id)
                          return next
                        })
                      }
                    >
                      {g.name}
                      <X className="h-3 w-3 ml-0.5" />
                    </Badge>
                  ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddGroupOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={selectedGroupIds.size === 0 || addGroupMutation.isPending}
              onClick={() => addGroupMutation.mutate([...selectedGroupIds])}
            >
              Add to {selectedGroupIds.size} Group
              {selectedGroupIds.size !== 1 ? 's' : ''}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete */}
      <div className="pt-4">
        <Button variant="destructive" onClick={() => setDeleteConfirmOpen(true)}>
          <Trash2 className="h-4 w-4 mr-1" />
          Delete Person
        </Button>
      </div>
      <ConfirmDialog
        open={removeAllConfirmOpen}
        onOpenChange={setRemoveAllConfirmOpen}
        title={`Remove from all ${person.groups?.length || 0} groups?`}
        description="This will remove this person from every group they belong to."
        confirmLabel="Remove All"
        variant="destructive"
        onConfirm={() => {
          if (!person.groups) return
          Promise.all(person.groups.map((g) => removeGroupMembers(g.id, [Number(id)]))).then(() => {
            invalidatePersonMembership()
            setRemoveAllConfirmOpen(false)
            toast.success('Removed from all groups')
          })
        }}
      />
      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title="Permanently delete this person?"
        description="This action cannot be undone."
        confirmLabel="Delete"
        variant="destructive"
        loading={deleteMutation.isPending}
        onConfirm={() => deleteMutation.mutate()}
      />
    </div>
  )
}
