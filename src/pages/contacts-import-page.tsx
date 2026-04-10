import {Badge} from '@/components/ui/badge'
import {Button} from '@/components/ui/button'
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card'
import {Checkbox} from '@/components/ui/checkbox'
import {Input} from '@/components/ui/input'
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from '@/components/ui/table'
import {Tooltip, TooltipContent, TooltipProvider, TooltipTrigger} from '@/components/ui/tooltip'
import {
  type MacContactMatch,
  dismissContacts,
  fetchDismissedContacts,
  fetchMacContacts,
  importMacContacts,
  undismissContact,
  updatePerson,
} from '@/lib/api'
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'
import {
  ArrowLeft,
  CheckCircle,
  ExternalLink,
  Eye,
  EyeOff,
  Loader2,
  Phone,
  RefreshCw,
  RotateCcw,
  Trash2,
  UserPlus,
} from 'lucide-react'
import {useMemo, useState} from 'react'
import {Link} from 'react-router-dom'
import {toast} from 'sonner'

export function ContactsImportPage() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [skipDuplicates, setSkipDuplicates] = useState(true)
  const [showDismissed, setShowDismissed] = useState(false)
  const [statusFilter, setStatusFilter] = useState<'all' | 'new' | 'exists' | 'differs' | 'importable'>('importable')
  const [importResult, setImportResult] = useState<{created: number; updated: number; skipped: number} | null>(null)

  const {data, isLoading, error} = useQuery({
    queryKey: ['mac-contacts'],
    queryFn: fetchMacContacts,
  })

  const {data: dismissedData} = useQuery({
    queryKey: ['dismissed-contacts'],
    queryFn: fetchDismissedContacts,
    enabled: showDismissed,
  })

  const importMutation = useMutation({
    mutationFn: () => {
      if (!data) throw new Error('No contacts loaded')
      const toImport = data.contacts
        .filter((c) => selected.has(c.id))
        .map((c) => {
          const phone = c.phones[0]
          return {
            firstName: c.firstName,
            lastName: c.lastName,
            phoneNumber: phone?.normalized || '',
            phoneDisplay: phone?.value || '',
          }
        })
        .filter((c) => c.phoneNumber)
      return importMacContacts(toImport, skipDuplicates)
    },
    onSuccess: (result) => {
      setImportResult(result)
      setSelected(new Set())
      queryClient.invalidateQueries({queryKey: ['people']})
      queryClient.invalidateQueries({queryKey: ['mac-contacts']})
      toast.success(`Imported ${result.created} contacts`)
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const dismissMutation = useMutation({
    mutationFn: (contacts: MacContactMatch[]) =>
      dismissContacts(contacts.map((c) => ({contactId: c.id, firstName: c.firstName, lastName: c.lastName}))),
    onSuccess: (_result, contacts) => {
      setSelected((prev) => {
        const next = new Set(prev)
        contacts.forEach((c) => next.delete(c.id))
        return next
      })
      queryClient.invalidateQueries({queryKey: ['mac-contacts']})
      queryClient.invalidateQueries({queryKey: ['dismissed-contacts']})
      toast.success(`Dismissed ${contacts.length} contact${contacts.length !== 1 ? 's' : ''}`)
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const updateMutation = useMutation({
    mutationFn: (contact: MacContactMatch) => {
      if (!contact.existingPersonId) throw new Error('No existing person')
      return updatePerson(contact.existingPersonId, {
        firstName: contact.firstName || null,
        lastName: contact.lastName || null,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({queryKey: ['people']})
      queryClient.invalidateQueries({queryKey: ['mac-contacts']})
      toast.success('Contact updated')
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const undismissMutation = useMutation({
    mutationFn: undismissContact,
    onSuccess: () => {
      queryClient.invalidateQueries({queryKey: ['mac-contacts']})
      queryClient.invalidateQueries({queryKey: ['dismissed-contacts']})
      toast.success('Contact restored')
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const filtered = useMemo(() => {
    if (!data) return []
    return data.contacts.filter((c) => {
      if (statusFilter === 'importable') {
        if (c.matchStatus === 'exists') return false
      } else if (statusFilter !== 'all' && c.matchStatus !== statusFilter) {
        return false
      }
      if (!search) return true
      const q = search.toLowerCase()
      return (
        c.firstName.toLowerCase().includes(q) ||
        c.lastName.toLowerCase().includes(q) ||
        c.phones.some((p) => p.value.includes(q))
      )
    })
  }, [data, search, statusFilter])

  const counts = useMemo(() => {
    if (!data) return {new: 0, exists: 0, differs: 0}
    return {
      new: data.contacts.filter((c) => c.matchStatus === 'new').length,
      exists: data.contacts.filter((c) => c.matchStatus === 'exists').length,
      differs: data.contacts.filter((c) => c.matchStatus === 'differs').length,
    }
  }, [data])

  const selectableContacts = filtered.filter((c) => c.matchStatus !== 'exists')

  const toggleAll = () => {
    if (selected.size === selectableContacts.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(selectableContacts.map((c) => c.id)))
    }
  }

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <span className="ml-3 text-muted-foreground">Loading contacts from macOS...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-4 md:p-6 space-y-4">
        <h2 className="text-2xl font-bold">Import from Contacts</h2>
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <p className="text-destructive">
              Failed to load contacts. Make sure the app has permission to access Contacts in System Settings &gt;
              Privacy &amp; Security &gt; Contacts.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/people" className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h2 className="text-2xl font-bold">Import from Contacts</h2>
      </div>

      {/* Import result */}
      {importResult && (
        <Card className="border-green-500">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-green-600">
              <CheckCircle className="h-5 w-5" />
              Import Complete
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <p className="text-2xl font-bold">{importResult.created}</p>
                <p className="text-sm text-muted-foreground">Created</p>
              </div>
              <div>
                <p className="text-2xl font-bold">{importResult.updated}</p>
                <p className="text-sm text-muted-foreground">Updated</p>
              </div>
              <div>
                <p className="text-2xl font-bold">{importResult.skipped}</p>
                <p className="text-sm text-muted-foreground">Skipped</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats + Filters */}
      <div className="flex flex-wrap gap-2">
        <Button
          variant={statusFilter === 'all' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setStatusFilter('all')}
        >
          All ({data?.total || 0})
        </Button>
        <Button
          variant={statusFilter === 'importable' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setStatusFilter('importable')}
        >
          Importable ({counts.new + counts.differs})
        </Button>
        <Button
          variant={statusFilter === 'new' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setStatusFilter('new')}
          className={
            statusFilter === 'new'
              ? ''
              : 'text-blue-600 border-blue-300 hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-blue-950/20'
          }
        >
          New ({counts.new})
        </Button>
        <Button
          variant={statusFilter === 'differs' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setStatusFilter('differs')}
          className={
            statusFilter === 'differs'
              ? ''
              : 'text-orange-600 border-orange-300 hover:bg-orange-50 hover:text-orange-600 dark:hover:bg-orange-950/20'
          }
        >
          Needs Update ({counts.differs})
        </Button>
        <Button
          variant={statusFilter === 'exists' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setStatusFilter('exists')}
          className={
            statusFilter === 'exists'
              ? ''
              : 'text-green-600 border-green-300 hover:bg-green-50 hover:text-green-600 dark:hover:bg-green-950/20'
          }
        >
          Already Imported ({counts.exists})
        </Button>
      </div>

      {/* Search + actions */}
      <div className="flex flex-col sm:flex-row gap-3">
        <Input
          placeholder="Search contacts..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1"
        />
        <div className="flex gap-2">
          {selected.size > 0 && (
            <>
              <Button
                variant="destructive"
                size="sm"
                className="hover:text-white"
                onClick={() => {
                  const toDismiss = data?.contacts.filter((c) => selected.has(c.id)) || []
                  dismissMutation.mutate(toDismiss)
                }}
                disabled={dismissMutation.isPending}
              >
                <Trash2 className="h-4 w-4 mr-1" />
                Dismiss ({selected.size})
              </Button>
              <Button size="sm" onClick={() => importMutation.mutate()} disabled={importMutation.isPending}>
                <UserPlus className="h-4 w-4 mr-1" />
                {importMutation.isPending ? 'Importing...' : `Import (${selected.size})`}
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Skip duplicates toggle */}
      {selected.size > 0 && (
        <label className="flex items-center gap-2">
          <Checkbox checked={skipDuplicates} onCheckedChange={(v) => setSkipDuplicates(v === true)} />
          <span className="text-sm">Skip contacts that already exist (same phone number)</span>
        </label>
      )}

      {/* Contacts table */}
      <div className="border rounded-lg overflow-auto max-h-[60vh] bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={selectableContacts.length > 0 && selected.size === selectableContacts.length}
                  onCheckedChange={toggleAll}
                />
              </TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                  {search ? 'No contacts match your search' : 'No contacts found'}
                </TableCell>
              </TableRow>
            )}
            {filtered.map((contact) => (
              <TableRow
                key={contact.id}
                className={
                  contact.matchStatus === 'exists'
                    ? 'bg-green-50 dark:bg-green-950/10'
                    : contact.matchStatus === 'differs'
                      ? 'bg-orange-50 dark:bg-orange-950/20'
                      : ''
                }
              >
                <TableCell>
                  {contact.matchStatus !== 'exists' && (
                    <Checkbox checked={selected.has(contact.id)} onCheckedChange={() => toggleOne(contact.id)} />
                  )}
                </TableCell>
                <TableCell>
                  <div>
                    {contact.existingPersonId ? (
                      <Link
                        to={`/people/${contact.existingPersonId}`}
                        className="font-medium text-primary hover:underline inline-flex items-center gap-1"
                      >
                        {contact.firstName} {contact.lastName}
                        <ExternalLink className="h-3 w-3" />
                      </Link>
                    ) : (
                      <span className="font-medium">
                        {contact.firstName} {contact.lastName}
                      </span>
                    )}
                    {contact.differences && (
                      <div className="text-xs mt-1 space-y-0.5">
                        {contact.differences.map((diff) => (
                          <div key={diff.field} className="text-orange-600 dark:text-orange-400">
                            <span className="font-medium">{diff.field === 'firstName' ? 'First' : 'Last'}:</span>{' '}
                            <span className="line-through opacity-60">{diff.existing}</span>{' '}
                            <span>&rarr; {diff.contact}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="space-y-0.5">
                    {contact.phones.map((p, i) => (
                      <div key={i} className="flex items-center gap-1.5 text-sm">
                        <Phone className="h-3 w-3 text-muted-foreground" />
                        <span>{p.value}</span>
                        <span className="text-xs text-muted-foreground">({p.label})</span>
                      </div>
                    ))}
                  </div>
                </TableCell>
                <TableCell>
                  {contact.matchStatus === 'exists' && (
                    <Badge variant="outline" className="border-green-500 text-green-600">
                      Imported
                    </Badge>
                  )}
                  {contact.matchStatus === 'differs' && (
                    <Badge variant="outline" className="border-orange-500 text-orange-600">
                      Differs
                    </Badge>
                  )}
                  {contact.matchStatus === 'new' && (
                    <Badge variant="outline" className="border-blue-500 text-blue-600">
                      New
                    </Badge>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    {contact.matchStatus === 'differs' && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 hover:bg-blue-100 dark:hover:bg-blue-950/30"
                              onClick={() => updateMutation.mutate(contact)}
                              disabled={updateMutation.isPending}
                            >
                              <RefreshCw className="h-4 w-4 text-blue-600" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Update contact in Central Flock</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                    {contact.matchStatus !== 'exists' && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="group/dismiss h-8 w-8 hover:bg-destructive"
                              onClick={() => dismissMutation.mutate([contact])}
                            >
                              <Trash2 className="h-4 w-4 text-muted-foreground group-hover/dismiss:text-white" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Dismiss contact</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Dismissed contacts section */}
      <div className="border-t pt-4">
        <button
          onClick={() => setShowDismissed(!showDismissed)}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          {showDismissed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          {showDismissed ? 'Hide' : 'Show'} dismissed contacts
          {dismissedData && ` (${dismissedData.total})`}
        </button>

        {showDismissed && dismissedData && (
          <div className="mt-3 border rounded-lg overflow-auto max-h-64 bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Dismissed</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {dismissedData.contacts.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-muted-foreground py-4">
                      No dismissed contacts
                    </TableCell>
                  </TableRow>
                )}
                {dismissedData.contacts.map((dc) => (
                  <TableRow key={dc.id}>
                    <TableCell>
                      {dc.firstName} {dc.lastName}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(dc.dismissedAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => undismissMutation.mutate(dc.contactId)}
                            >
                              <RotateCcw className="h-4 w-4 text-muted-foreground" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Restore contact</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  )
}
