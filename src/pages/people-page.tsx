import {ConfirmDialog} from '@/components/confirm-dialog'
import {Badge} from '@/components/ui/badge'
import {Button} from '@/components/ui/button'
import {Card, CardContent} from '@/components/ui/card'
import {Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger} from '@/components/ui/dialog'
import {Input} from '@/components/ui/input'
import {Label} from '@/components/ui/label'
import {Pagination} from '@/components/ui/pagination'
import {Popover, PopoverContent, PopoverTrigger} from '@/components/ui/popover'
import {SearchInput} from '@/components/ui/search-input'
import {SearchableSelect} from '@/components/ui/searchable-select'
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select'
import {PageSpinner} from '@/components/ui/spinner'
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from '@/components/ui/table'
import {Tooltip, TooltipContent, TooltipProvider, TooltipTrigger} from '@/components/ui/tooltip'
import {useDebouncedValue} from '@/hooks/use-debounced-value'
import {usePersistedState} from '@/hooks/use-persisted-state'
import {
  type Person,
  createPerson,
  deletePerson,
  exportPeopleCSV,
  fetchDuplicates,
  fetchGroups,
  fetchPeople,
  togglePersonStatus,
} from '@/lib/api'
import {formatDate} from '@/lib/date'
import {queryKeys} from '@/lib/query-keys'
import {cn, maskPhoneDisplay, phoneToE164} from '@/lib/utils'
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Ban,
  BookUser,
  Download,
  EllipsisVertical,
  Plus,
  ToggleLeft,
  ToggleRight,
  Trash2,
  Upload,
  Users,
  X,
} from 'lucide-react'
import {useMemo, useRef, useState} from 'react'
import {Link, useNavigate, useSearchParams} from 'react-router-dom'
import {toast} from 'sonner'

export function PeoplePage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [search, setSearch] = usePersistedState('people.search', '')
  const debouncedSearch = useDebouncedValue(search, 250)
  const [statusFilter, setStatusFilter] = usePersistedState('people.statusFilter', 'all')
  const [page, setPage] = usePersistedState('people.page', 1)
  const [searchParams, setSearchParams] = useSearchParams()
  const addFromParam = searchParams.get('add') === '1'
  const [addOpenLocal, setAddOpenLocal] = useState(false)
  const addOpen = addFromParam || addOpenLocal
  const setAddOpen = (open: boolean) => {
    if (open) {
      setSelectedGroupIds(new Set())
      setGroupSearch('')
      setGroupHighlight(-1)
    }
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
  const [duplicatesOpen, setDuplicatesOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null)
  const [sort, setSort] = usePersistedState<'createdAt' | 'firstName' | 'lastName'>('people.sort', 'createdAt')
  const [sortDir, setSortDir] = usePersistedState<'asc' | 'desc'>('people.sortDir', 'desc')
  const [selectedGroupIds, setSelectedGroupIds] = useState<Set<number>>(new Set())
  const [groupSearch, setGroupSearch] = useState('')
  const debouncedGroupSearch = useDebouncedValue(groupSearch, 200)
  const [groupHighlight, setGroupHighlight] = useState(-1)
  const groupSearchRef = useRef<HTMLInputElement>(null)
  const [newPerson, setNewPerson] = useState({
    firstName: '',
    lastName: '',
    phoneNumber: '',
    phoneDisplay: '',
    birthMonth: null as number | null,
    birthDay: null as number | null,
    birthYear: null as number | null,
    anniversaryMonth: null as number | null,
    anniversaryDay: null as number | null,
    anniversaryYear: null as number | null,
  })

  const {data, isLoading} = useQuery({
    queryKey: [...queryKeys.people, debouncedSearch, statusFilter, page, sort, sortDir],
    queryFn: () =>
      fetchPeople({
        search: debouncedSearch || undefined,
        status: statusFilter === 'all' ? undefined : statusFilter,
        page,
        limit: 50,
        sort,
        sortDir,
      }),
  })

  const {data: duplicatesData, isLoading: duplicatesLoading} = useQuery({
    queryKey: queryKeys.duplicates,
    queryFn: fetchDuplicates,
    enabled: duplicatesOpen,
  })

  const {data: groups} = useQuery({
    queryKey: queryKeys.groups,
    queryFn: fetchGroups,
  })

  const groupResults = useMemo(() => {
    if (!groups) return []
    const q = debouncedGroupSearch?.toLowerCase()
    return groups.filter((g) => !selectedGroupIds.has(g.id) && (!q || g.name.toLowerCase().includes(q)))
  }, [debouncedGroupSearch, groups, selectedGroupIds])

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

  const totalDuplicateGroups =
    (duplicatesData?.nameDuplicates.length || 0) + (duplicatesData?.phoneDuplicates.length || 0)

  const createMutation = useMutation({
    mutationFn: (data: Partial<Person> & {groupIds?: number[]}) => createPerson(data),
    onSuccess: () => {
      queryClient.invalidateQueries({queryKey: queryKeys.people})
      queryClient.invalidateQueries({queryKey: queryKeys.groups})
      setAddOpen(false)
      setNewPerson({
        firstName: '',
        lastName: '',
        phoneNumber: '',
        phoneDisplay: '',
        birthMonth: null,
        birthDay: null,
        birthYear: null,
        anniversaryMonth: null,
        anniversaryDay: null,
        anniversaryYear: null,
      })
      setSelectedGroupIds(new Set())
      setGroupSearch('')
      toast.success('Person created')
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const deleteMutation = useMutation({
    mutationFn: deletePerson,
    onSuccess: () => {
      queryClient.invalidateQueries({queryKey: queryKeys.people})
      toast.success('Person deleted')
      setDeleteTarget(null)
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const toggleMutation = useMutation({
    mutationFn: togglePersonStatus,
    onSuccess: () => {
      queryClient.invalidateQueries({queryKey: queryKeys.people})
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
    if (phoneDigits.length > 0 && !phoneValid) {
      toast.error('Phone number must be 10 digits')
      return
    }
    createMutation.mutate({
      firstName: newPerson.firstName || null,
      lastName: newPerson.lastName || null,
      phoneNumber: newPerson.phoneNumber || null,
      phoneDisplay: newPerson.phoneDisplay || newPerson.phoneNumber || null,
      birthMonth: newPerson.birthMonth,
      birthDay: newPerson.birthDay,
      birthYear: newPerson.birthYear,
      anniversaryMonth: newPerson.anniversaryMonth,
      anniversaryDay: newPerson.anniversaryDay,
      anniversaryYear: newPerson.anniversaryYear,
      groupIds: selectedGroupIds.size > 0 ? [...selectedGroupIds] : undefined,
    })
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-2xl font-bold">People</h2>
        <div className="flex gap-2 items-center">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="icon">
                <EllipsisVertical className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent
              className="w-auto gap-0 p-1.5 space-y-0.5 bg-popover/70 backdrop-blur-2xl backdrop-saturate-150"
              align="end"
            >
              <button
                className="hidden md:flex w-full items-center gap-2.5 text-left text-sm font-medium px-3 py-2 rounded-2xl hover:bg-foreground/10 transition-colors cursor-pointer"
                onClick={async () => {
                  try {
                    await exportPeopleCSV()
                    toast.success('CSV exported')
                  } catch {
                    toast.error('Failed to export CSV')
                  }
                }}
              >
                <Download className="h-4 w-4" />
                Export CSV
              </button>
              <button
                className="hidden md:flex w-full items-center gap-2.5 text-left text-sm font-medium px-3 py-2 rounded-2xl hover:bg-foreground/10 transition-colors cursor-pointer"
                onClick={() => navigate('/import')}
              >
                <Upload className="h-4 w-4" />
                Import CSV
              </button>
              <button
                className="flex w-full items-center gap-2.5 text-left text-sm font-medium px-3 py-2 rounded-2xl hover:bg-foreground/10 transition-colors cursor-pointer"
                onClick={() => navigate('/import/contacts')}
              >
                <BookUser className="h-4 w-4" />
                Import from Contacts
              </button>
              <button
                className="flex w-full items-center gap-2.5 text-left text-sm font-medium px-3 py-2 rounded-2xl hover:bg-foreground/10 transition-colors cursor-pointer"
                onClick={() => setDuplicatesOpen(true)}
              >
                <Users className="h-4 w-4" />
                Find Duplicates
              </button>
            </PopoverContent>
          </Popover>
          <Dialog open={duplicatesOpen} onOpenChange={setDuplicatesOpen}>
            <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  Find Duplicates
                  {duplicatesData && (
                    <Badge variant="secondary">
                      {totalDuplicateGroups} group{totalDuplicateGroups !== 1 ? 's' : ''}
                    </Badge>
                  )}
                </DialogTitle>
              </DialogHeader>
              {duplicatesLoading ? (
                <div className="text-center py-8 text-muted-foreground">Scanning for duplicates...</div>
              ) : totalDuplicateGroups === 0 ? (
                <div className="text-center py-8 text-muted-foreground">No duplicates found.</div>
              ) : (
                <div className="space-y-6">
                  {duplicatesData && duplicatesData.nameDuplicates.length > 0 && (
                    <div className="space-y-3">
                      <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                        Name Duplicates ({duplicatesData.nameDuplicates.length})
                      </h3>
                      {duplicatesData.nameDuplicates.map((group, i) => (
                        <div key={i} className="border rounded-lg p-3 space-y-2">
                          <p className="font-medium">{group.name}</p>
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Phone</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="w-16" />
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {group.people.map((p) => (
                                <TableRow key={p.id}>
                                  <TableCell className="text-muted-foreground">
                                    {p.phoneDisplay || p.phoneNumber}
                                  </TableCell>
                                  <TableCell>
                                    <Badge
                                      variant={
                                        p.status === 'active'
                                          ? 'default'
                                          : p.status === 'do_not_contact'
                                            ? 'destructive'
                                            : 'secondary'
                                      }
                                    >
                                      {p.status === 'do_not_contact' ? 'DNC' : p.status}
                                    </Badge>
                                  </TableCell>
                                  <TableCell>
                                    <Link
                                      to={`/people/${p.id}`}
                                      className="text-sm text-primary hover:underline"
                                      onClick={() => setDuplicatesOpen(false)}
                                    >
                                      View
                                    </Link>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      ))}
                    </div>
                  )}
                  {duplicatesData && duplicatesData.phoneDuplicates.length > 0 && (
                    <div className="space-y-3">
                      <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                        Similar Phone Numbers ({duplicatesData.phoneDuplicates.length})
                      </h3>
                      {duplicatesData.phoneDuplicates.map((group, i) => (
                        <div key={i} className="border rounded-lg p-3">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Name</TableHead>
                                <TableHead>Phone</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="w-16" />
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {group.people.map((p) => (
                                <TableRow key={p.id}>
                                  <TableCell className="font-medium">
                                    {[p.firstName, p.lastName].filter(Boolean).join(' ') || '—'}
                                  </TableCell>
                                  <TableCell className="text-muted-foreground">
                                    {p.phoneDisplay || p.phoneNumber}
                                  </TableCell>
                                  <TableCell>
                                    <Badge
                                      variant={
                                        p.status === 'active'
                                          ? 'default'
                                          : p.status === 'do_not_contact'
                                            ? 'destructive'
                                            : 'secondary'
                                      }
                                    >
                                      {p.status === 'do_not_contact' ? 'DNC' : p.status}
                                    </Badge>
                                  </TableCell>
                                  <TableCell>
                                    <Link
                                      to={`/people/${p.id}`}
                                      className="text-sm text-primary hover:underline"
                                      onClick={() => setDuplicatesOpen(false)}
                                    >
                                      View
                                    </Link>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </DialogContent>
          </Dialog>
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Add Person
                <kbd className="ml-2 pointer-events-none text-[10px] font-medium opacity-60 border rounded px-1 py-0.5">
                  ⌘P
                </kbd>
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
                <DialogTitle>Add Person</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label>First Name</Label>
                  <Input
                    value={newPerson.firstName}
                    onChange={(e) => setNewPerson((p) => ({...p, firstName: e.target.value}))}
                  />
                </div>
                <div>
                  <Label>Last Name</Label>
                  <Input
                    value={newPerson.lastName}
                    onChange={(e) => setNewPerson((p) => ({...p, lastName: e.target.value}))}
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
                    <p className="text-xs text-destructive mt-1">Must be 10 digits ({phoneDigits.length}/10)</p>
                  )}
                </div>
                <div>
                  <Label>E.164 Format</Label>
                  <p className="text-sm font-mono mt-1">{newPerson.phoneNumber || '—'}</p>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label>Birth Month</Label>
                    <SearchableSelect
                      value={newPerson.birthMonth ? String(newPerson.birthMonth) : ''}
                      onValueChange={(v) => setNewPerson((p) => ({...p, birthMonth: v ? Number(v) : null}))}
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
                      value={newPerson.birthDay ? String(newPerson.birthDay) : ''}
                      onValueChange={(v) => setNewPerson((p) => ({...p, birthDay: v ? Number(v) : null}))}
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
                      value={newPerson.birthYear ?? ''}
                      onChange={(e) =>
                        setNewPerson((p) => ({...p, birthYear: e.target.value ? Number(e.target.value) : null}))
                      }
                      placeholder="Optional"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label>Anniversary Month</Label>
                    <SearchableSelect
                      value={newPerson.anniversaryMonth ? String(newPerson.anniversaryMonth) : ''}
                      onValueChange={(v) => setNewPerson((p) => ({...p, anniversaryMonth: v ? Number(v) : null}))}
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
                      value={newPerson.anniversaryDay ? String(newPerson.anniversaryDay) : ''}
                      onValueChange={(v) => setNewPerson((p) => ({...p, anniversaryDay: v ? Number(v) : null}))}
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
                      value={newPerson.anniversaryYear ?? ''}
                      onChange={(e) =>
                        setNewPerson((p) => ({...p, anniversaryYear: e.target.value ? Number(e.target.value) : null}))
                      }
                      placeholder="Optional"
                    />
                  </div>
                </div>
                {groups && groups.length > 0 && (
                  <div className="space-y-2">
                    <Label>Groups</Label>
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
                        {groups
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
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setAddOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleAddPerson} disabled={createMutation.isPending}>
                  {createMutation.isPending ? 'Creating...' : 'Create'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Filters + Table */}
      {isLoading ? (
        <PageSpinner />
      ) : (
        <>
          <Card size="sm">
            <CardContent>
              <div className="flex flex-col sm:flex-row gap-3">
                <SearchInput
                  placeholder="Search name or phone..."
                  value={search}
                  onChange={(v) => {
                    setSearch(v)
                    setPage(1)
                  }}
                  onClear={() => setPage(1)}
                  containerClassName="sm:max-w-sm"
                />
                <Select
                  value={statusFilter}
                  onValueChange={(v) => {
                    setStatusFilter(v)
                    setPage(1)
                  }}
                >
                  <SelectTrigger className="w-full sm:w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                    <SelectItem value="do_not_contact">Do Not Contact</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
            <div className="overflow-x-auto border-t">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>
                      <button
                        className="flex items-center gap-1 font-bold hover:text-foreground cursor-pointer"
                        onClick={() => {
                          if (sort === 'firstName') setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
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
                          if (sort === 'lastName') setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
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
                    <TableHead>Birthday</TableHead>
                    <TableHead>Age</TableHead>
                    <TableHead>Anniversary</TableHead>
                    <TableHead>
                      <button
                        className="flex items-center gap-1 font-bold hover:text-foreground cursor-pointer"
                        onClick={() => {
                          if (sort === 'createdAt') setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
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
                    <TableRow
                      key={person.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => navigate(`/people/${person.id}`)}
                    >
                      <TableCell className="font-medium">
                        {person.firstName || <em className="text-muted-foreground">—</em>}
                      </TableCell>
                      <TableCell className="font-medium">
                        {person.lastName || <em className="text-muted-foreground">—</em>}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {person.phoneDisplay || person.phoneNumber || <em>No phone</em>}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            person.status === 'active'
                              ? 'default'
                              : person.status === 'do_not_contact'
                                ? 'destructive'
                                : 'secondary'
                          }
                        >
                          {person.status === 'do_not_contact' ? 'do not contact' : person.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {person.groups?.slice(0, 3).map((g) => (
                            <Badge key={g.id} variant="outline" className="text-xs">
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
                        {person.birthMonth && person.birthDay
                          ? `${new Date(2000, person.birthMonth - 1).toLocaleString('default', {month: 'short'})} ${person.birthDay}${person.birthYear ? `, ${person.birthYear}` : ''}`
                          : '—'}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {person.birthMonth && person.birthDay && person.birthYear
                          ? (() => {
                              const today = new Date()
                              let age = today.getFullYear() - person.birthYear
                              const hadBirthday =
                                today.getMonth() + 1 > person.birthMonth ||
                                (today.getMonth() + 1 === person.birthMonth && today.getDate() >= person.birthDay)
                              if (!hadBirthday) age--
                              return age
                            })()
                          : '—'}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {person.anniversaryMonth && person.anniversaryDay
                          ? `${new Date(2000, person.anniversaryMonth - 1).toLocaleString('default', {month: 'short'})} ${person.anniversaryDay}${person.anniversaryYear ? `, ${person.anniversaryYear}` : ''}`
                          : '—'}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {formatDate(person.createdAt)}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {person.status === 'do_not_contact' ? (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="ghost" size="icon" disabled>
                                    <Ban className="h-4 w-4 text-destructive" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Do Not Contact</TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          ) : (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={(e) => {
                                e.stopPropagation()
                                toggleMutation.mutate(person.id)
                              }}
                              title={person.status === 'active' ? 'Deactivate' : 'Activate'}
                            >
                              {person.status === 'active' ? (
                                <ToggleRight className="h-4 w-4" />
                              ) : (
                                <ToggleLeft className="h-4 w-4" />
                              )}
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={(e) => {
                              e.stopPropagation()
                              setDeleteTarget(person.id)
                            }}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {data?.data.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                        No people found. Try importing from CSV or adding one manually.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
            <CardContent>
              <Pagination page={page} pageSize={50} total={data?.total || 0} onPageChange={setPage} noun="people" />
            </CardContent>
          </Card>
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
