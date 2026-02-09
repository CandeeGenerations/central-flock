import {useState} from 'react'
import {usePersistedState} from '@/hooks/use-persisted-state'
import {useQuery, useMutation, useQueryClient} from '@tanstack/react-query'
import {Link} from 'react-router-dom'
import {
  fetchPeople,
  createPerson,
  deletePerson,
  togglePersonStatus,
  type Person,
} from '@/lib/api'
import {Button} from '@/components/ui/button'
import {Input} from '@/components/ui/input'
import {Badge} from '@/components/ui/badge'
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
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog'
import {Label} from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Plus,
  Search,
  Trash2,
  ToggleLeft,
  ToggleRight,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from 'lucide-react'
import {toast} from 'sonner'
import {maskPhoneDisplay, phoneToE164} from '@/lib/utils'
import {ConfirmDialog} from '@/components/confirm-dialog'

export function PeoplePage() {
  const queryClient = useQueryClient()
  const [search, setSearch] = usePersistedState('people.search', '')
  const [statusFilter, setStatusFilter] = usePersistedState(
    'people.statusFilter',
    'all',
  )
  const [page, setPage] = usePersistedState('people.page', 1)
  const [addOpen, setAddOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null)
  const [sort, setSort] = usePersistedState<
    'createdAt' | 'firstName' | 'lastName'
  >('people.sort', 'createdAt')
  const [sortDir, setSortDir] = usePersistedState<'asc' | 'desc'>(
    'people.sortDir',
    'desc',
  )
  const [newPerson, setNewPerson] = useState({
    firstName: '',
    lastName: '',
    phoneNumber: '',
    phoneDisplay: '',
  })

  const {data, isLoading} = useQuery({
    queryKey: ['people', search, statusFilter, page, sort, sortDir],
    queryFn: () =>
      fetchPeople({
        search: search || undefined,
        status: statusFilter === 'all' ? undefined : statusFilter,
        page,
        limit: 50,
        sort,
        sortDir,
      }),
  })

  const createMutation = useMutation({
    mutationFn: (data: Partial<Person>) => createPerson(data),
    onSuccess: () => {
      queryClient.invalidateQueries({queryKey: ['people']})
      setAddOpen(false)
      setNewPerson({
        firstName: '',
        lastName: '',
        phoneNumber: '',
        phoneDisplay: '',
      })
      toast.success('Person created')
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const deleteMutation = useMutation({
    mutationFn: deletePerson,
    onSuccess: () => {
      queryClient.invalidateQueries({queryKey: ['people']})
      toast.success('Person deleted')
      setDeleteTarget(null)
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const toggleMutation = useMutation({
    mutationFn: togglePersonStatus,
    onSuccess: () => {
      queryClient.invalidateQueries({queryKey: ['people']})
    },
  })

  const handlePhoneDisplayChange = (value: string) => {
    const masked = maskPhoneDisplay(value)
    setNewPerson((p) => ({
      ...p,
      phoneDisplay: masked,
      phoneNumber: phoneToE164(masked),
    }))
  }

  const phoneDigits = newPerson.phoneDisplay.replace(/\D/g, '')
  const phoneValid = phoneDigits.length === 10

  const handleAddPerson = () => {
    if (!newPerson.phoneDisplay.trim()) {
      toast.error('Phone number is required')
      return
    }
    if (!phoneValid) {
      toast.error('Phone number must be 10 digits')
      return
    }
    createMutation.mutate({
      firstName: newPerson.firstName || null,
      lastName: newPerson.lastName || null,
      phoneNumber: newPerson.phoneNumber,
      phoneDisplay: newPerson.phoneDisplay || newPerson.phoneNumber,
    })
  }

  const totalPages = data ? Math.ceil(data.total / data.limit) : 1

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">People</h2>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add Person
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Person</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>First Name</Label>
                <Input
                  value={newPerson.firstName}
                  onChange={(e) =>
                    setNewPerson((p) => ({...p, firstName: e.target.value}))
                  }
                />
              </div>
              <div>
                <Label>Last Name</Label>
                <Input
                  value={newPerson.lastName}
                  onChange={(e) =>
                    setNewPerson((p) => ({...p, lastName: e.target.value}))
                  }
                />
              </div>
              <div>
                <Label>Phone Number</Label>
                <Input
                  value={newPerson.phoneDisplay}
                  onChange={(e) => handlePhoneDisplayChange(e.target.value)}
                  placeholder="(555) 123-4567"
                />
                {phoneDigits.length > 0 && !phoneValid && (
                  <p className="text-xs text-destructive mt-1">
                    Must be 10 digits ({phoneDigits.length}/10)
                  </p>
                )}
              </div>
              <div>
                <Label>E.164 Format</Label>
                <Input
                  value={newPerson.phoneNumber}
                  readOnly
                  className="bg-muted"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAddOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleAddPerson}
                disabled={createMutation.isPending}
              >
                {createMutation.isPending ? 'Creating...' : 'Create'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search name or phone..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
            className="pl-9"
          />
        </div>
        <Select
          value={statusFilter}
          onValueChange={(v) => {
            setStatusFilter(v)
            setPage(1)
          }}
        >
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">Loading...</div>
      ) : (
        <>
          <div className="border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    <button
                      className="flex items-center gap-1 font-bold hover:text-foreground cursor-pointer"
                      onClick={() => {
                        if (sort === 'firstName')
                          setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
                        else {
                          setSort('firstName')
                          setSortDir('asc')
                        }
                      }}
                    >
                      First Name
                      {sort === 'firstName' ? (
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
                  <TableHead>
                    <button
                      className="flex items-center gap-1 font-bold hover:text-foreground cursor-pointer"
                      onClick={() => {
                        if (sort === 'lastName')
                          setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
                        else {
                          setSort('lastName')
                          setSortDir('asc')
                        }
                      }}
                    >
                      Last Name
                      {sort === 'lastName' ? (
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
                  <TableHead>Phone</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Groups</TableHead>
                  <TableHead>
                    <button
                      className="flex items-center gap-1 font-bold hover:text-foreground cursor-pointer"
                      onClick={() => {
                        if (sort === 'createdAt')
                          setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
                        else {
                          setSort('createdAt')
                          setSortDir('desc')
                        }
                      }}
                    >
                      Date Added
                      {sort === 'createdAt' ? (
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
                  <TableHead className="w-24">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.data.map((person) => (
                  <TableRow key={person.id}>
                    <TableCell>
                      <Link
                        to={`/people/${person.id}`}
                        className="font-medium hover:underline"
                      >
                        {person.firstName || (
                          <em className="text-muted-foreground">—</em>
                        )}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Link
                        to={`/people/${person.id}`}
                        className="font-medium hover:underline"
                      >
                        {person.lastName || (
                          <em className="text-muted-foreground">—</em>
                        )}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {person.phoneDisplay || person.phoneNumber}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          person.status === 'active' ? 'default' : 'secondary'
                        }
                      >
                        {person.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {person.groups?.slice(0, 3).map((g) => (
                          <Badge
                            key={g.id}
                            variant="outline"
                            className="text-xs"
                          >
                            {g.name}
                          </Badge>
                        ))}
                        {(person.groups?.length || 0) > 3 && (
                          <Badge variant="outline" className="text-xs">
                            +{person.groups!.length - 3}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {new Date(person.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => toggleMutation.mutate(person.id)}
                          title={
                            person.status === 'active'
                              ? 'Deactivate'
                              : 'Activate'
                          }
                        >
                          {person.status === 'active' ? (
                            <ToggleRight className="h-4 w-4" />
                          ) : (
                            <ToggleLeft className="h-4 w-4" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeleteTarget(person.id)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {data?.data.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={7}
                      className="text-center text-muted-foreground py-8"
                    >
                      No people found. Try importing from CSV or adding one
                      manually.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Showing {(page - 1) * 50 + 1}–
                {Math.min(page * 50, data?.total || 0)} of {data?.total} people
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}
      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open: boolean) => {
          if (!open) setDeleteTarget(null)
        }}
        title="Delete this person?"
        description="This action cannot be undone."
        confirmLabel="Delete"
        variant="destructive"
        loading={deleteMutation.isPending}
        onConfirm={() => {
          if (deleteTarget !== null) deleteMutation.mutate(deleteTarget)
        }}
      />
    </div>
  )
}
