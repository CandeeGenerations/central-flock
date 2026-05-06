import {RsvpListCreateDialog} from '@/components/rsvp/rsvp-list-create-dialog'
import {Button} from '@/components/ui/button'
import {Card, CardContent} from '@/components/ui/card'
import {SearchInput} from '@/components/ui/search-input'
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select'
import {PageSpinner} from '@/components/ui/spinner'
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from '@/components/ui/table'
import {usePersistedState} from '@/hooks/use-persisted-state'
import {formatDate} from '@/lib/date'
import {queryKeys} from '@/lib/query-keys'
import {fetchRsvpLists} from '@/lib/rsvp-api'
import {useQuery} from '@tanstack/react-query'
import {Plus} from 'lucide-react'
import {useMemo, useState} from 'react'
import {useNavigate, useSearchParams} from 'react-router-dom'

export function RsvpListPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [search, setSearch] = usePersistedState('rsvp.search', '')
  const [showPast, setShowPast] = usePersistedState('rsvp.showPast', false)
  const [createOpen, setCreateOpen] = useState(searchParams.get('new') === '1')

  const {data, isLoading} = useQuery({
    queryKey: queryKeys.rsvpLists(showPast),
    queryFn: () => fetchRsvpLists(showPast),
  })

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return data || []
    return (data || []).filter((l) => l.name.toLowerCase().includes(q))
  }, [data, search])

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

        {isLoading ? (
          <CardContent>
            <PageSpinner />
          </CardContent>
        ) : (
          <div className="overflow-x-auto border-t">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Event Date</TableHead>
                  <TableHead className="text-center">Yes</TableHead>
                  <TableHead className="text-center">No</TableHead>
                  <TableHead className="text-center">Maybe</TableHead>
                  <TableHead className="text-center">No Response</TableHead>
                  <TableHead className="text-center">Expected</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
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
                    <TableCell className="font-medium">{l.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {l.effectiveDate ? formatDate(l.effectiveDate) : '—'}
                    </TableCell>
                    <TableCell className="text-center tabular-nums">{l.counts.yes}</TableCell>
                    <TableCell className="text-center tabular-nums">{l.counts.no}</TableCell>
                    <TableCell className="text-center tabular-nums">{l.counts.maybe}</TableCell>
                    <TableCell className="text-center tabular-nums">{l.counts.no_response}</TableCell>
                    <TableCell className="text-center tabular-nums font-medium">{l.counts.expectedAttendees}</TableCell>
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
    </div>
  )
}
