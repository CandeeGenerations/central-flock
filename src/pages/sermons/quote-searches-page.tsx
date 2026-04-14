import {Card, CardContent} from '@/components/ui/card'
import {Pagination} from '@/components/ui/pagination'
import {SearchInput} from '@/components/ui/search-input'
import {PageSpinner} from '@/components/ui/spinner'
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from '@/components/ui/table'
import {useDebouncedValue} from '@/hooks/use-debounced-value'
import {usePersistedState} from '@/hooks/use-persisted-state'
import {listSearches} from '@/lib/quotes-api'
import {useQuery} from '@tanstack/react-query'
import {useNavigate} from 'react-router-dom'

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', {month: 'short', day: 'numeric', year: 'numeric'})
}

export function QuoteSearchesPage() {
  const navigate = useNavigate()
  const [search, setSearch] = usePersistedState('qsearches.q', '')
  const debouncedSearch = useDebouncedValue(search, 250)
  const [page, setPage] = usePersistedState('qsearches.page', 1)

  const {data, isLoading} = useQuery({
    queryKey: ['quotes', 'searches', 'list', debouncedSearch, page],
    queryFn: () => listSearches({q: debouncedSearch || undefined, page, pageSize: 20}),
  })

  if (isLoading && !data) return <PageSpinner />

  return (
    <div className="p-4 md:p-6 space-y-4">
      <h2 className="text-2xl font-bold">
        Search History
        {data ? <span className="ml-2 text-base font-normal text-muted-foreground">({data.total})</span> : null}
      </h2>
      <Card size="sm">
        <CardContent>
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Filter by topic…"
            containerClassName="w-56"
            onClear={() => setSearch('')}
          />
        </CardContent>
        <div className="overflow-x-auto border-t">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Topic</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Results</TableHead>
                <TableHead>Model</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.searches.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-12">
                    No searches yet.
                  </TableCell>
                </TableRow>
              ) : (
                (data?.searches ?? []).map((s) => (
                  <TableRow
                    key={s.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => navigate(`/sermons/searches/${s.id}`)}
                  >
                    <TableCell className="font-medium">{s.topic}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{fmtDate(s.createdAt)}</TableCell>
                    <TableCell className="text-sm">{s.resultCount}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{s.model}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
        {data && data.total > 20 && (
          <CardContent>
            <Pagination page={page} pageSize={20} total={data.total} onPageChange={setPage} noun="searches" />
          </CardContent>
        )}
      </Card>
    </div>
  )
}
