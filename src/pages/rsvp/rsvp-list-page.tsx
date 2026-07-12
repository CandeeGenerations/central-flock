import {RsvpListCreateDialog} from '@/components/rsvp/rsvp-list-create-dialog'
import {RsvpMergeDialog} from '@/components/rsvp/rsvp-merge-dialog'
import {Button} from '@/components/ui/button'
import {Card, CardContent} from '@/components/ui/card'
import {Checkbox} from '@/components/ui/checkbox'
import {SearchInput} from '@/components/ui/search-input'
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select'
import {PageSpinner} from '@/components/ui/spinner'
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from '@/components/ui/table'
import {usePersistedState} from '@/hooks/use-persisted-state'
import {formatDate} from '@/lib/date'
import {queryKeys} from '@/lib/query-keys'
import {fetchRsvpLists} from '@/lib/rsvp-api'
import {useQuery} from '@tanstack/react-query'
import {GitMerge, Plus} from 'lucide-react'
import {useMemo, useState} from 'react'
import {useNavigate, useSearchParams} from 'react-router-dom'

export function RsvpListPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [search, setSearch] = usePersistedState('rsvp.search', '')
  const [showPast, setShowPast] = usePersistedState('rsvp.showPast', false)
  const [createOpen, setCreateOpen] = useState(searchParams.get('new') === '1')
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [mergeOpen, setMergeOpen] = useState(false)

  const {data, isLoading} = useQuery({
    queryKey: queryKeys.rsvpLists(showPast),
    queryFn: () => fetchRsvpLists(showPast),
  })

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return data || []
    return (data || []).filter((l) => l.name.toLowerCase().includes(q))
  }, [data, search])

  // Prune selection when filters hide previously-selected lists. Sync-during-render
  // pattern (https://react.dev/reference/react/useState#storing-information-from-previous-renders).
  const filteredIdsKey = filtered.map((l) => l.id).join(',')
  const [lastFilteredKey, setLastFilteredKey] = useState(filteredIdsKey)
  if (filteredIdsKey !== lastFilteredKey) {
    setLastFilteredKey(filteredIdsKey)
    if (selectedIds.size > 0) {
      const visible = new Set(filtered.map((l) => l.id))
      let needsPrune = false
      for (const id of selectedIds) if (!visible.has(id)) needsPrune = true
      if (needsPrune) {
        const next = new Set<number>()
        for (const id of selectedIds) if (visible.has(id)) next.add(id)
        setSelectedIds(next)
      }
    }
  }

  const allFilteredSelected = filtered.length > 0 && filtered.every((l) => selectedIds.has(l.id))
  const toggleSelectAll = () => {
    setSelectedIds((prev) => {
      if (allFilteredSelected) {
        const next = new Set(prev)
        for (const l of filtered) next.delete(l.id)
        return next
      }
      const next = new Set(prev)
      for (const l of filtered) next.add(l.id)
      return next
    })
  }

  const selectedLists = useMemo(() => (data || []).filter((l) => selectedIds.has(l.id)), [data, selectedIds])

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-2xl font-bold">RSVPs</h2>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          New RSVP List
        </Button>
      </div>

      <Card size="sm">
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-3 sm:items-center flex-wrap">
            <SearchInput
              placeholder="Search lists..."
              value={search}
              onChange={setSearch}
              containerClassName="sm:max-w-sm"
            />
            <Select value={showPast ? 'all' : 'upcoming'} onValueChange={(v) => setShowPast(v === 'all')}>
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="upcoming">Upcoming</SelectItem>
                <SelectItem value="all">All</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>

        {selectedIds.size >= 2 && (
          <div className="border-t bg-muted/40 px-4 py-2 flex flex-wrap items-center gap-2 sticky top-0 z-10">
            <span className="text-sm font-medium">{selectedIds.size} lists selected</span>
            <Button size="sm" onClick={() => setMergeOpen(true)}>
              <GitMerge className="h-4 w-4 mr-1" />
              Merge lists…
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>
              Clear selection
            </Button>
          </div>
        )}

        {isLoading ? (
          <CardContent>
            <PageSpinner />
          </CardContent>
        ) : (
          <div className="overflow-x-auto border-t">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox checked={allFilteredSelected} onCheckedChange={toggleSelectAll} />
                  </TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Event Date</TableHead>
                  <TableHead className="text-center">Yes</TableHead>
                  <TableHead className="text-center">No</TableHead>
                  <TableHead className="text-center">Maybe</TableHead>
                  <TableHead className="text-center">No Response</TableHead>
                  <TableHead className="text-center">Attend %</TableHead>
                  <TableHead className="text-center">Resp %</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                      {showPast
                        ? 'No RSVP lists yet.'
                        : 'No active RSVP lists. Start one from the Calendar or a Group.'}
                    </TableCell>
                  </TableRow>
                )}
                {filtered.map((l) => (
                  <TableRow
                    key={l.id}
                    className="cursor-pointer hover:bg-muted"
                    onClick={() => navigate(`/rsvp/${l.id}`)}
                  >
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={selectedIds.has(l.id)}
                        onCheckedChange={(checked) => {
                          setSelectedIds((prev) => {
                            const next = new Set(prev)
                            if (checked) next.add(l.id)
                            else next.delete(l.id)
                            return next
                          })
                        }}
                      />
                    </TableCell>
                    <TableCell className="font-medium">{l.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {l.effectiveDate ? formatDate(l.effectiveDate) : '—'}
                    </TableCell>
                    <TableCell className="text-center tabular-nums">{l.counts.yes}</TableCell>
                    <TableCell className="text-center tabular-nums">{l.counts.no}</TableCell>
                    <TableCell className="text-center tabular-nums">{l.counts.maybe}</TableCell>
                    <TableCell className="text-center tabular-nums">{l.counts.no_response}</TableCell>
                    <TableCell className="text-center tabular-nums font-medium">
                      {l.counts.total > 0 ? Math.round((l.counts.yes / l.counts.total) * 100) : 0}%
                    </TableCell>
                    <TableCell className="text-center tabular-nums">
                      {l.counts.total > 0
                        ? Math.round(((l.counts.total - l.counts.no_response) / l.counts.total) * 100)
                        : 0}
                      %
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      <RsvpListCreateDialog
        open={createOpen}
        onOpenChange={(o) => {
          setCreateOpen(o)
          if (!o && searchParams.get('new')) {
            const next = new URLSearchParams(searchParams)
            next.delete('new')
            setSearchParams(next, {replace: true})
          }
        }}
      />

      <RsvpMergeDialog
        open={mergeOpen}
        onOpenChange={setMergeOpen}
        lists={selectedLists}
        onMerged={(targetId) => {
          setMergeOpen(false)
          setSelectedIds(new Set())
          navigate(`/rsvp/${targetId}`)
        }}
      />
    </div>
  )
}
