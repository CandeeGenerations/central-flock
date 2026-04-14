import {ConfirmDialog} from '@/components/confirm-dialog'
import {Badge} from '@/components/ui/badge'
import {Button} from '@/components/ui/button'
import {Card, CardContent} from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {Pagination} from '@/components/ui/pagination'
import {SearchInput} from '@/components/ui/search-input'
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select'
import {PageSpinner} from '@/components/ui/spinner'
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from '@/components/ui/table'
import {useDebouncedValue} from '@/hooks/use-debounced-value'
import {usePersistedState} from '@/hooks/use-persisted-state'
import {formatDate} from '@/lib/date'
import {
  type GwendolynDevotional,
  type GwendolynStatus,
  buildCopyContent,
  buildCopyTitle,
  deleteGwendolynDevotional,
  fetchGwendolynDevotionals,
} from '@/lib/gwendolyn-devotion-api'
import {queryKeys} from '@/lib/query-keys'
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'
import {EllipsisVertical, Plus, Trash2} from 'lucide-react'
import {useState} from 'react'
import {Link, useNavigate} from 'react-router-dom'
import {toast} from 'sonner'

const STATUS_STYLES: Record<GwendolynStatus, {className: string; label: string}> = {
  received: {className: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200', label: 'Received'},
  producing: {className: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200', label: 'Producing'},
  waiting_for_approval: {
    className: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
    label: 'Waiting for Approval',
  },
  ready_to_upload: {
    className: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
    label: 'Ready to Upload',
  },
  done: {className: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200', label: 'Done'},
}

function StatusBadge({status}: {status: GwendolynStatus}) {
  const style = STATUS_STYLES[status]
  return (
    <Badge variant="outline" className={style.className}>
      {style.label}
    </Badge>
  )
}

function CopyMenu({devotional}: {devotional: GwendolynDevotional}) {
  const copy = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(() => toast.success(`${label} copied`))
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="p-1 rounded hover:bg-muted cursor-pointer" onClick={(e) => e.stopPropagation()}>
          <EllipsisVertical className="h-4 w-4 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuLabel>Copy</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => copy(buildCopyTitle(devotional), 'Title')}>Copy title</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => copy(buildCopyContent(devotional), 'Full post')}>
          Copy full + hashtags
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function GwendolynListPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [search, setSearch] = usePersistedState('gwend-list-search', '')
  const [statusFilter, setStatusFilter] = usePersistedState('gwend-list-status', 'all')
  const [page, setPage] = usePersistedState('gwend-list-page', 1)
  const [deleteId, setDeleteId] = useState<number | null>(null)

  const debouncedSearch = useDebouncedValue(search, 300)

  const {data, isLoading} = useQuery({
    queryKey: queryKeys.gwendolynDevotions(debouncedSearch, statusFilter),
    queryFn: () =>
      fetchGwendolynDevotionals({
        search: debouncedSearch || undefined,
        status: statusFilter !== 'all' ? statusFilter : undefined,
        page,
        limit: 25,
        sort: 'date',
        sortDir: 'desc',
      }),
  })

  const deleteMutation = useMutation({
    mutationFn: deleteGwendolynDevotional,
    onSuccess: () => {
      qc.invalidateQueries({queryKey: queryKeys.gwendolynDevotions()})
      toast.success('Deleted')
      setDeleteId(null)
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Delete failed'),
  })

  const devotionals = data?.data ?? []
  const total = data?.total ?? 0
  const limit = 25

  return (
    <div className="p-4 md:p-6 max-w-6xl space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">Gwendolyn's Devotions</h1>
        <Button asChild size="sm">
          <Link to="/devotions/gwendolyn/new">
            <Plus className="h-4 w-4 mr-1" />
            New
          </Link>
        </Button>
      </div>

      {isLoading ? (
        <PageSpinner />
      ) : (
        <>
          <Card size="sm">
            <CardContent>
              <div className="flex flex-col sm:flex-row gap-3">
                <SearchInput
                  value={search}
                  onChange={(v) => {
                    setSearch(v)
                    setPage(1)
                  }}
                  placeholder="Search title…"
                  containerClassName="sm:max-w-sm"
                />
                <Select
                  value={statusFilter}
                  onValueChange={(v) => {
                    setStatusFilter(v)
                    setPage(1)
                  }}
                >
                  <SelectTrigger className="w-full sm:w-52">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    <SelectItem value="received">Received</SelectItem>
                    <SelectItem value="producing">Producing</SelectItem>
                    <SelectItem value="waiting_for_approval">Waiting for Approval</SelectItem>
                    <SelectItem value="ready_to_upload">Ready to Upload</SelectItem>
                    <SelectItem value="done">Done</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
            <div className="overflow-x-auto border-t">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="w-16" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {devotionals.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                        No devotionals found
                      </TableCell>
                    </TableRow>
                  ) : (
                    devotionals.map((d) => (
                      <TableRow
                        key={d.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => navigate(`/devotions/gwendolyn/${d.id}`)}
                      >
                        <TableCell className="text-sm">{formatDate(d.date)}</TableCell>
                        <TableCell className="font-medium">{d.title}</TableCell>
                        <TableCell>
                          <StatusBadge status={d.status} />
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{formatDate(d.createdAt)}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                            <CopyMenu devotional={d} />
                            <button
                              className="p-1 rounded hover:bg-destructive/10 text-destructive cursor-pointer"
                              onClick={() => setDeleteId(d.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
            {total > 0 && (
              <CardContent>
                <Pagination page={page} pageSize={limit} total={total} onPageChange={setPage} noun="devotionals" />
              </CardContent>
            )}
          </Card>
        </>
      )}

      <ConfirmDialog
        open={deleteId !== null}
        onOpenChange={(open) => !open && setDeleteId(null)}
        title="Delete devotional?"
        description="This action cannot be undone."
        confirmLabel="Delete"
        onConfirm={() => deleteId !== null && deleteMutation.mutate(deleteId)}
        loading={deleteMutation.isPending}
      />
    </div>
  )
}
