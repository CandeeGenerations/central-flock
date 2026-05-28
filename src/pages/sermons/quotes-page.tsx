import {Badge} from '@/components/ui/badge'
import {Button} from '@/components/ui/button'
import {Card, CardContent} from '@/components/ui/card'
import {Pagination} from '@/components/ui/pagination'
import {SearchInput} from '@/components/ui/search-input'
import {SearchableSelect} from '@/components/ui/searchable-select'
import {PageSpinner} from '@/components/ui/spinner'
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from '@/components/ui/table'
import {Tooltip, TooltipContent, TooltipProvider, TooltipTrigger} from '@/components/ui/tooltip'
import {useDebouncedValue} from '@/hooks/use-debounced-value'
import {usePersistedState} from '@/hooks/use-persisted-state'
import {listAuthors, listQuotes} from '@/lib/quotes-api'
import {useQuery} from '@tanstack/react-query'
import {ArrowDown, ArrowUp, ArrowUpDown, Plus, X} from 'lucide-react'
import {useState} from 'react'
import {useNavigate} from 'react-router-dom'

import {QuoteFormDialog} from './quote-form-dialog'

export function QuotesPage() {
  const navigate = useNavigate()

  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search, 250)
  const [authorFilter, setAuthorFilter] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize] = useState(20)
  const [sortField, setSortField] = usePersistedState<'capturedAt' | 'createdAt'>('quotes.sort', 'capturedAt')
  const [sortDir, setSortDir] = usePersistedState<'asc' | 'desc'>('quotes.dir', 'desc')

  const toggleSort = (field: 'capturedAt' | 'createdAt') => {
    if (sortField === field) {
      setSortDir(sortDir === 'desc' ? 'asc' : 'desc')
    } else {
      setSortField(field)
      setSortDir('desc')
    }
    setPage(1)
  }

  const sortIcon = (field: 'capturedAt' | 'createdAt') => {
    if (sortField !== field) return <ArrowUpDown className="h-3 w-3 ml-1 opacity-40" />
    return sortDir === 'desc' ? <ArrowDown className="h-3 w-3 ml-1" /> : <ArrowUp className="h-3 w-3 ml-1" />
  }

  const [addOpen, setAddOpen] = useState(false)

  const hasFilters = !!debouncedSearch || !!authorFilter

  const {data, isLoading} = useQuery({
    queryKey: ['quotes', 'list', debouncedSearch, authorFilter, page, pageSize, sortField, sortDir],
    queryFn: () =>
      listQuotes({
        q: debouncedSearch || undefined,
        author: authorFilter || undefined,
        page,
        pageSize,
        sort: sortField,
        dir: sortDir,
      }),
  })

  const {data: authors} = useQuery({
    queryKey: ['quotes', 'authors'],
    queryFn: listAuthors,
  })

  const clearFilters = () => {
    setSearch('')
    setAuthorFilter('')
    setPage(1)
  }

  if (isLoading && !data) return <PageSpinner />

  return (
    <TooltipProvider>
      <div className="p-4 md:p-6 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-2xl font-bold">
            Quotes
            {data ? <span className="ml-2 text-base font-normal text-muted-foreground">({data.total})</span> : null}
          </h2>
          <Button onClick={() => setAddOpen(true)} size="sm">
            <Plus className="h-4 w-4 mr-1" /> Add Quote
          </Button>
        </div>
        <Card size="sm">
          <CardContent>
            <div className="flex flex-wrap gap-2 items-center">
              <SearchInput
                value={search}
                onChange={setSearch}
                placeholder="Search quotes…"
                containerClassName="w-56"
                onClear={() => setSearch('')}
              />
              <SearchableSelect
                value={authorFilter}
                onValueChange={(v) => {
                  setAuthorFilter(v)
                  setPage(1)
                }}
                options={[{value: '', label: 'All authors'}, ...(authors ?? []).map((a) => ({value: a, label: a}))]}
                placeholder="All authors"
                className="w-48"
              />
              {hasFilters && (
                <Button variant="ghost" size="sm" onClick={clearFilters}>
                  <X className="h-3.5 w-3.5 mr-1" /> Clear filters
                </Button>
              )}
            </div>
          </CardContent>
          <div className="overflow-x-auto border-t">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Summary</TableHead>
                  <TableHead>Author</TableHead>
                  <TableHead
                    className="cursor-pointer select-none whitespace-nowrap"
                    onClick={() => toggleSort('capturedAt')}
                  >
                    <span className="flex items-center">Quote Date {sortIcon('capturedAt')}</span>
                  </TableHead>
                  <TableHead
                    className="cursor-pointer select-none whitespace-nowrap"
                    onClick={() => toggleSort('createdAt')}
                  >
                    <span className="flex items-center">Date Added {sortIcon('createdAt')}</span>
                  </TableHead>
                  <TableHead>Tags</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.quotes.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-12">
                      {hasFilters ? (
                        <>
                          No quotes match.{' '}
                          <button onClick={clearFilters} className="underline">
                            Clear filters
                          </button>
                        </>
                      ) : (
                        <>
                          No quotes yet.{' '}
                          <button onClick={() => setAddOpen(true)} className="underline">
                            Add one
                          </button>
                        </>
                      )}
                    </TableCell>
                  </TableRow>
                ) : (
                  (data?.quotes ?? []).map((q) => (
                    <TableRow
                      key={q.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => navigate(`/sermons/quotes/${q.id}`)}
                    >
                      <TableCell className="max-w-xs text-sm">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="truncate cursor-default">{q.summary.slice(0, 120)}</div>
                          </TooltipTrigger>
                          <TooltipContent side="bottom" align="start" className="max-w-sm">
                            {q.summary}
                          </TooltipContent>
                        </Tooltip>
                      </TableCell>
                      <TableCell className="text-sm">{q.author}</TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{q.dateDisplay}</TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {q.createdAt
                          ? new Date(q.createdAt).toLocaleString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                              hour: 'numeric',
                              minute: '2-digit',
                            })
                          : '—'}
                      </TableCell>
                      <TableCell>
                        {q.tags.length === 0 ? null : (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="flex flex-wrap gap-1 cursor-default">
                                {q.tags.slice(0, 2).map((tag) => (
                                  <Badge key={tag} variant="secondary" className="text-xs">
                                    {tag}
                                  </Badge>
                                ))}
                                {q.tags.length > 2 && (
                                  <Badge variant="outline" className="text-xs">
                                    +{q.tags.length - 2}
                                  </Badge>
                                )}
                              </div>
                            </TooltipTrigger>
                            <TooltipContent>{q.tags.join(', ')}</TooltipContent>
                          </Tooltip>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          {data && data.total > pageSize && (
            <CardContent>
              <Pagination page={page} pageSize={pageSize} total={data.total} onPageChange={setPage} noun="quotes" />
            </CardContent>
          )}
        </Card>

        <QuoteFormDialog open={addOpen} onOpenChange={setAddOpen} />
      </div>
    </TooltipProvider>
  )
}
