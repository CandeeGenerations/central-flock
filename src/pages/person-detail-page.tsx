import {useState} from 'react'
import {useParams, useNavigate, Link} from 'react-router-dom'
import {useQuery, useMutation, useQueryClient} from '@tanstack/react-query'
import {
  fetchPerson,
  updatePerson,
  deletePerson,
  createMacContact,
  fetchGroups,
  addGroupMembers,
  removeGroupMembers,
  type Person,
} from '@/lib/api'
import {Button} from '@/components/ui/button'
import {Input} from '@/components/ui/input'
import {Label} from '@/components/ui/label'
import {Textarea} from '@/components/ui/textarea'
import {Badge} from '@/components/ui/badge'
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {Checkbox} from '@/components/ui/checkbox'
import {
  ArrowLeft,
  Save,
  Trash2,
  Contact,
  MessageSquare,
  UserPlus,
} from 'lucide-react'
import {toast} from 'sonner'
import {maskPhoneDisplay, phoneToE164} from '@/lib/utils'
import {ConfirmDialog} from '@/components/confirm-dialog'

export function PersonDetailPage() {
  const {id} = useParams<{id: string}>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<Partial<Person>>({})
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [addGroupOpen, setAddGroupOpen] = useState(false)
  const [selectedGroupIds, setSelectedGroupIds] = useState<Set<number>>(
    new Set(),
  )

  const {data: person, isLoading} = useQuery({
    queryKey: ['person', id],
    queryFn: () => fetchPerson(Number(id)),
    enabled: !!id,
  })

  const updateMutation = useMutation({
    mutationFn: (data: Partial<Person>) => updatePerson(Number(id), data),
    onSuccess: () => {
      queryClient.invalidateQueries({queryKey: ['person', id]})
      queryClient.invalidateQueries({queryKey: ['people']})
      setEditing(false)
      toast.success('Person updated')
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const deleteMutation = useMutation({
    mutationFn: () => deletePerson(Number(id)),
    onSuccess: () => {
      queryClient.invalidateQueries({queryKey: ['people']})
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
    queryKey: ['groups'],
    queryFn: fetchGroups,
    enabled: addGroupOpen,
  })

  const currentGroupIds = new Set(person?.groups?.map((g) => g.id) || [])
  const availableGroups =
    allGroups?.filter((g) => !currentGroupIds.has(g.id)) || []

  const addGroupMutation = useMutation({
    mutationFn: (groupIds: number[]) =>
      Promise.all(groupIds.map((gid) => addGroupMembers(gid, [Number(id)]))),
    onSuccess: () => {
      queryClient.invalidateQueries({queryKey: ['person', id]})
      queryClient.invalidateQueries({queryKey: ['groups']})
      setAddGroupOpen(false)
      setSelectedGroupIds(new Set())
      toast.success('Added to groups')
    },
  })

  const removeGroupMutation = useMutation({
    mutationFn: (groupId: number) => removeGroupMembers(groupId, [Number(id)]),
    onSuccess: () => {
      queryClient.invalidateQueries({queryKey: ['person', id]})
      queryClient.invalidateQueries({queryKey: ['groups']})
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
        notes: person.notes,
      })
      setEditing(true)
    }
  }

  if (isLoading)
    return <div className="p-6 text-muted-foreground">Loading...</div>
  if (!person) return <div className="p-6">Person not found</div>

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/people')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h2 className="text-2xl font-bold">
          {[person.firstName, person.lastName].filter(Boolean).join(' ') ||
            'Unnamed'}
        </h2>
        <Badge variant={person.status === 'active' ? 'default' : 'secondary'}>
          {person.status}
        </Badge>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Details</CardTitle>
          <div className="flex gap-2">
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
            <Link to={`/messages/compose?recipientId=${person.id}`}>
              <Button variant="outline" size="sm">
                <MessageSquare className="h-4 w-4 mr-1" />
                Send Message
              </Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {editing ? (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>First Name</Label>
                  <Input
                    value={form.firstName || ''}
                    onChange={(e) =>
                      setForm((f) => ({...f, firstName: e.target.value}))
                    }
                  />
                </div>
                <div>
                  <Label>Last Name</Label>
                  <Input
                    value={form.lastName || ''}
                    onChange={(e) =>
                      setForm((f) => ({...f, lastName: e.target.value}))
                    }
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
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
                      <p className="text-xs text-destructive mt-1">
                        Must be 10 digits ({digits.length}/10)
                      </p>
                    ) : null
                  })()}
                </div>
                <div>
                  <Label>E.164 Format</Label>
                  <Input
                    value={form.phoneNumber || ''}
                    readOnly
                    className="bg-muted"
                  />
                </div>
              </div>
              <div>
                <Label>Notes</Label>
                <Textarea
                  value={form.notes || ''}
                  onChange={(e) =>
                    setForm((f) => ({...f, notes: e.target.value}))
                  }
                  rows={3}
                />
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={() => updateMutation.mutate(form)}
                  disabled={
                    updateMutation.isPending ||
                    (form.phoneDisplay || '').replace(/\D/g, '').length !== 10
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
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-sm text-muted-foreground">
                    First Name
                  </span>
                  <p>{person.firstName || '—'}</p>
                </div>
                <div>
                  <span className="text-sm text-muted-foreground">
                    Last Name
                  </span>
                  <p>{person.lastName || '—'}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-sm text-muted-foreground">Phone</span>
                  <p>{person.phoneDisplay || person.phoneNumber}</p>
                </div>
                <div>
                  <span className="text-sm text-muted-foreground">E.164</span>
                  <p className="font-mono text-sm">{person.phoneNumber}</p>
                </div>
              </div>
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
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Groups</CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAddGroupOpen(true)}
          >
            <UserPlus className="h-4 w-4 mr-1" />
            Add to Group
          </Button>
        </CardHeader>
        <CardContent>
          {person.groups && person.groups.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead className="w-16">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {person.groups.map((g) => (
                  <TableRow key={g.id}>
                    <TableCell>
                      <Link
                        to={`/groups/${g.id}`}
                        className="font-medium hover:underline"
                      >
                        {g.name}
                      </Link>
                    </TableCell>
                    <TableCell>
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
          ) : (
            <p className="text-muted-foreground text-sm">
              Not a member of any groups
            </p>
          )}
        </CardContent>
      </Card>

      {/* Add to Group Dialog */}
      <Dialog open={addGroupOpen} onOpenChange={setAddGroupOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add to Groups</DialogTitle>
          </DialogHeader>
          {availableGroups.length > 0 ? (
            <div className="space-y-2 max-h-64 overflow-auto">
              {availableGroups.map((g) => (
                <label
                  key={g.id}
                  className="flex items-center gap-2 p-2 rounded hover:bg-accent hover:text-accent-foreground cursor-pointer"
                >
                  <Checkbox
                    checked={selectedGroupIds.has(g.id)}
                    onCheckedChange={(checked) => {
                      setSelectedGroupIds((prev) => {
                        const next = new Set(prev)
                        if (checked) next.add(g.id)
                        else next.delete(g.id)
                        return next
                      })
                    }}
                  />
                  <span>{g.name}</span>
                </label>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Already a member of all groups.
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddGroupOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={
                selectedGroupIds.size === 0 || addGroupMutation.isPending
              }
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
        <Button
          variant="destructive"
          onClick={() => setDeleteConfirmOpen(true)}
        >
          <Trash2 className="h-4 w-4 mr-1" />
          Delete Person
        </Button>
      </div>
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
