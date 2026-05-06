import {ConfirmDialog} from '@/components/confirm-dialog'
import {RsvpAddPersonDialog} from '@/components/rsvp/rsvp-add-person-dialog'
import {RsvpEntryEditModal} from '@/components/rsvp/rsvp-entry-edit-modal'
import {RsvpListEditDialog} from '@/components/rsvp/rsvp-list-edit-dialog'
import {Button} from '@/components/ui/button'
import {Card, CardContent} from '@/components/ui/card'
import {Checkbox} from '@/components/ui/checkbox'
import {MultiSelect} from '@/components/ui/multi-select'
import {SearchInput} from '@/components/ui/search-input'
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select'
import {PageSpinner} from '@/components/ui/spinner'
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from '@/components/ui/table'
import {usePersistedState} from '@/hooks/use-persisted-state'
import {formatDate, formatDateTime} from '@/lib/date'
import {formatFullName} from '@/lib/format'
import {queryKeys} from '@/lib/query-keys'
import {
  type RsvpEntry,
  type RsvpStatus,
  STATUS_LABELS,
  bulkUpdateRsvpEntries,
  deleteRsvpList,
  fetchRsvpList,
  updateRsvpEntry,
} from '@/lib/rsvp-api'
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'
import {ArrowLeft, Pencil, Send, Trash2, UserPlus, X} from 'lucide-react'
import {useMemo, useState} from 'react'
import {useNavigate, useParams} from 'react-router-dom'
import {toast} from 'sonner'

const STATUS_OPTIONS: {value: RsvpStatus; label: string}[] = [
  {value: 'yes', label: 'Yes'},
  {value: 'no', label: 'No'},
  {value: 'maybe', label: 'Maybe'},
  {value: 'no_response', label: 'No Response'},
]

export function RsvpDetailPage() {
  const {id} = useParams<{id: string}>()
  const listId = Number(id)
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [search, setSearch] = usePersistedState(`rsvp.detail.${id}.search`, '')
  const [statusFilters, setStatusFilters] = usePersistedState<string[]>(`rsvp.detail.${id}.statusFilters`, [])
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [editingEntry, setEditingEntry] = useState<RsvpEntry | null>(null)
  const [editListOpen, setEditListOpen] = useState(false)
  const [addPersonOpen, setAddPersonOpen] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [removeConfirmOpen, setRemoveConfirmOpen] = useState(false)

  const {data: list, isLoading} = useQuery({
    queryKey: queryKeys.rsvpList(listId),
    queryFn: () => fetchRsvpList(listId),
    enabled: Number.isFinite(listId),
  })

  const filteredEntries = useMemo(() => {
    if (!list) return []
    const q = search.trim().toLowerCase()
    return list.entries.filter((e) => {
      if (statusFilters.length > 0 && !statusFilters.includes(e.status)) return false
      if (!q) return true
      const fullName = `${e.firstName ?? ''} ${e.lastName ?? ''}`.toLowerCase()
      return fullName.includes(q) || (e.phoneDisplay ?? '').includes(q)
    })
  }, [list, search, statusFilters])

  const updateEntryMutation = useMutation({
    mutationFn: ({entryId, status}: {entryId: number; status: RsvpStatus}) => updateRsvpEntry(entryId, {status}),
    onSuccess: () => {
      queryClient.invalidateQueries({queryKey: queryKeys.rsvpList(listId)})
      queryClient.invalidateQueries({queryKey: ['rsvpLists']})
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const bulkMutation = useMutation({
    mutationFn: (body: {ids: number[]; status?: RsvpStatus; removeFromList?: boolean}) =>
      bulkUpdateRsvpEntries(body.ids, {status: body.status, removeFromList: body.removeFromList}),
    onSuccess: () => {
      queryClient.invalidateQueries({queryKey: queryKeys.rsvpList(listId)})
      queryClient.invalidateQueries({queryKey: ['rsvpLists']})
      queryClient.invalidateQueries({queryKey: ['rsvpNonEntries', String(listId)]})
      setSelectedIds(new Set())
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const deleteListMutation = useMutation({
    mutationFn: () => deleteRsvpList(listId),
    onSuccess: () => {
      queryClient.invalidateQueries({queryKey: ['rsvpLists']})
      toast.success('RSVP list deleted')
      navigate('/rsvp')
    },
    onError: (err: Error) => toast.error(err.message),
  })

  if (isLoading) return <PageSpinner />
  if (!list) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">RSVP list not found.</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate('/rsvp')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to RSVPs
        </Button>
      </div>
    )
  }

  const eventDate = list.effectiveDate
  const eventTime = list.calendarEventId ? null : list.standaloneTime
  const headlineTime =
    list.calendarEventId && list.calendarEventStartDate
      ? (() => {
          try {
            return formatDateTime(list.calendarEventStartDate)
          } catch {
            return null
          }
        })()
      : null
  const responded = list.counts.total - list.counts.no_response
  const responseRate = list.counts.total > 0 ? Math.round((responded / list.counts.total) * 100) : 0

  const audienceIds = filteredEntries.map((e) => e.personId)
  const audienceCount = audienceIds.length

  const handleSendMessage = () => {
    if (audienceCount === 0) return
    const params = new URLSearchParams()
    params.set('mode', 'individual')
    params.set('individualIds', audienceIds.join(','))
    navigate(`/messages/compose?${params.toString()}`)
  }

  const allFilteredSelected = filteredEntries.length > 0 && filteredEntries.every((e) => selectedIds.has(e.id))

  const toggleSelectAll = () => {
    if (allFilteredSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev)
        for (const e of filteredEntries) next.delete(e.id)
        return next
      })
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev)
        for (const e of filteredEntries) next.add(e.id)
        return next
      })
    }
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate('/rsvp')}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            All RSVPs
          </Button>
          <h2 className="text-2xl font-bold">{list.name}</h2>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button onClick={handleSendMessage} disabled={audienceCount === 0}>
            <Send className="h-4 w-4 mr-2" />
            Send Message ({audienceCount})
          </Button>
          <Button variant="outline" onClick={() => setAddPersonOpen(true)}>
            <UserPlus className="h-4 w-4 mr-2" />
            Add Person
          </Button>
          <Button variant="outline" onClick={() => setEditListOpen(true)}>
            <Pencil className="h-4 w-4 mr-2" />
            Edit
          </Button>
          <Button variant="outline" onClick={() => setDeleteConfirmOpen(true)}>
            <Trash2 className="h-4 w-4 mr-2" />
            Delete
          </Button>
        </div>
      </div>

      <Card size="sm">
        <CardContent className="space-y-1">
          <div className="text-sm text-muted-foreground">
            {headlineTime ? headlineTime : eventDate ? formatDate(eventDate) : 'No date set'}
            {eventTime && ` · ${eventTime}`}
            {list.calendarEventLocation && ` · ${list.calendarEventLocation}`}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            <span>
              <span className="font-medium text-emerald-700 dark:text-emerald-400">Yes</span> {list.counts.yes}
            </span>
            <span>
              <span className="font-medium text-rose-700 dark:text-rose-400">No</span> {list.counts.no}
            </span>
            <span>
              <span className="font-medium text-amber-700 dark:text-amber-400">Maybe</span> {list.counts.maybe}
            </span>
            <span>
              <span className="font-medium text-muted-foreground">No Response</span> {list.counts.no_response}
            </span>
            <span>
              <span className="font-medium">Total</span> {list.counts.total}
            </span>
          </div>
          <div className="text-sm">
            <span className="font-medium">Expected attendees:</span> {list.counts.expectedAttendees}
          </div>
          <div className="text-sm">
            <span className="font-medium">Response rate:</span> {responseRate}% ({responded}/{list.counts.total})
          </div>
        </CardContent>
      </Card>

      <Card size="sm">
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
            <SearchInput
              placeholder="Search names..."
              value={search}
              onChange={setSearch}
              containerClassName="sm:max-w-sm"
            />
            <MultiSelect
              value={statusFilters}
              onValueChange={setStatusFilters}
              options={STATUS_OPTIONS.map((o) => ({value: o.value, label: o.label}))}
              allLabel="All Statuses"
              searchable={false}
              className="w-full sm:w-48"
            />
          </div>
        </CardContent>

        {selectedIds.size > 0 && (
          <div className="border-t bg-muted/40 px-4 py-2 flex flex-wrap items-center gap-2 sticky top-0 z-10">
            <span className="text-sm font-medium">{selectedIds.size} selected</span>
            <Select onValueChange={(v) => bulkMutation.mutate({ids: [...selectedIds], status: v as RsvpStatus})}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Set status…" />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={() => setRemoveConfirmOpen(true)}>
              <X className="h-4 w-4 mr-1" />
              Remove
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>
              Clear selection
            </Button>
          </div>
        )}

        <div className="overflow-x-auto border-t">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox checked={allFilteredSelected} onCheckedChange={toggleSelectAll} />
                </TableHead>
                <TableHead>Name</TableHead>
                <TableHead className="w-44">Status</TableHead>
                <TableHead className="w-24 text-center">Headcount</TableHead>
                <TableHead>Note</TableHead>
                <TableHead className="w-40">Responded</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredEntries.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    {list.entries.length === 0
                      ? 'This list has no people yet — add some.'
                      : 'No entries match the current filters.'}
                  </TableCell>
                </TableRow>
              )}
              {filteredEntries.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell>
                    <Checkbox
                      checked={selectedIds.has(entry.id)}
                      onCheckedChange={(checked) => {
                        setSelectedIds((prev) => {
                          const next = new Set(prev)
                          if (checked) next.add(entry.id)
                          else next.delete(entry.id)
                          return next
                        })
                      }}
                    />
                  </TableCell>
                  <TableCell className="font-medium">{formatFullName(entry)}</TableCell>
                  <TableCell>
                    <Select
                      value={entry.status}
                      onValueChange={(v) => updateEntryMutation.mutate({entryId: entry.id, status: v as RsvpStatus})}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STATUS_OPTIONS.map((o) => (
                          <SelectItem key={o.value} value={o.value}>
                            {STATUS_LABELS[o.value]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="text-center tabular-nums">{entry.headcount ?? '—'}</TableCell>
                  <TableCell className="max-w-[20rem] truncate text-sm text-muted-foreground">
                    {entry.note || '—'}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                    {entry.respondedAt ? formatDateTime(entry.respondedAt) : '—'}
                  </TableCell>
                  <TableCell>
                    <button
                      type="button"
                      className="p-1 rounded hover:bg-muted cursor-pointer"
                      onClick={() => setEditingEntry(entry)}
                    >
                      <Pencil className="h-4 w-4 text-muted-foreground" />
                    </button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      <RsvpListEditDialog open={editListOpen} onOpenChange={setEditListOpen} list={list} />
      <RsvpAddPersonDialog open={addPersonOpen} onOpenChange={setAddPersonOpen} listId={listId} />
      <RsvpEntryEditModal
        open={editingEntry !== null}
        onOpenChange={(o) => {
          if (!o) setEditingEntry(null)
        }}
        entry={editingEntry}
        listId={listId}
      />
      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title="Delete RSVP list?"
        description={`This will permanently delete "${list.name}" and all of its entries. This cannot be undone.`}
        variant="destructive"
        confirmLabel="Delete"
        loading={deleteListMutation.isPending}
        onConfirm={() => deleteListMutation.mutate()}
      />
      <ConfirmDialog
        open={removeConfirmOpen}
        onOpenChange={setRemoveConfirmOpen}
        title={`Remove ${selectedIds.size} from list?`}
        description="They will be removed from this RSVP list. The people themselves are not deleted."
        variant="destructive"
        confirmLabel="Remove"
        onConfirm={() => {
          bulkMutation.mutate({ids: [...selectedIds], removeFromList: true})
          setRemoveConfirmOpen(false)
        }}
      />
    </div>
  )
}
