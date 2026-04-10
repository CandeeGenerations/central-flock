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
import {SearchableSelect} from '@/components/ui/searchable-select'
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select'
import {PageSpinner} from '@/components/ui/spinner'
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from '@/components/ui/table'
import {useDebouncedValue} from '@/hooks/use-debounced-value'
import {usePersistedState} from '@/hooks/use-persisted-state'
import {formatDate} from '@/lib/date'
import {
  type Devotion,
  fetchDevotions,
  generateFacebookDescription,
  generatePodcastDescription,
  generatePodcastTitle,
  generateSongDescription,
  generateSongTitle,
  generateYoutubeDescription,
  toggleDevotionField,
  youtubeSearchUrl,
} from '@/lib/devotion-api'
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'
import {ArrowDown, ArrowUp, ArrowUpDown, Camera, Check, EllipsisVertical, Plus, X} from 'lucide-react'
import {Link, useNavigate} from 'react-router-dom'
import {toast} from 'sonner'

const TYPE_STYLES: Record<string, {className: string; label: string}> = {
  original: {className: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200', label: 'Original'},
  favorite: {className: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200', label: 'Favorite'},
  guest: {className: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200', label: 'Guest'},
  revisit: {className: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200', label: 'Revisit'},
}

function TypeBadge({devotion}: {devotion: Devotion}) {
  const style = TYPE_STYLES[devotion.devotionType] || TYPE_STYLES.original
  let label = style.label
  if (devotion.devotionType === 'guest' && devotion.guestSpeaker) {
    label = `${devotion.guestSpeaker}${devotion.guestNumber ? ` #${devotion.guestNumber}` : ''}`
  } else if (devotion.devotionType === 'revisit' && devotion.referencedDevotions) {
    try {
      const nums = JSON.parse(devotion.referencedDevotions) as number[]
      label = `Revisit #${nums.join(', #')}`
    } catch {
      label = 'Revisit'
    }
  }
  return (
    <Badge variant="outline" className={style.className}>
      {label}
    </Badge>
  )
}

function CheckboxCell({checked, onClick}: {checked: boolean; onClick: (e: React.MouseEvent) => void}) {
  return (
    <div
      className="flex items-center justify-center cursor-pointer h-7 w-7 rounded-lg border border-border hover:bg-muted/50 mx-auto"
      onClick={onClick}
    >
      {checked ? <Check className="h-4 w-4 text-green-600" /> : <X className="h-4 w-4 text-red-500" />}
    </div>
  )
}

function CopyMenu({devotion}: {devotion: Devotion}) {
  const copy = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(() => toast.success(`${label} copied`))
  }

  const songTitle = generateSongTitle(devotion)
  const songDesc = generateSongDescription(devotion)
  const ytDesc = devotion.youtubeDescription || generateYoutubeDescription(devotion)
  const fbDesc = generateFacebookDescription(devotion)
  const podDesc = generatePodcastDescription(devotion)
  const podTitle = generatePodcastTitle(devotion)
  const hasSong = songTitle || songDesc

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="p-1 rounded hover:bg-muted cursor-pointer" onClick={(e) => e.stopPropagation()}>
          <EllipsisVertical className="h-4 w-4 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuItem asChild>
          <a href={youtubeSearchUrl(devotion.number)} target="_blank" rel="noopener noreferrer">
            Find on YouTube
          </a>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="font-bold">Copy</DropdownMenuLabel>
        <DropdownMenuItem onClick={() => copy(podTitle, 'Title')}>Title</DropdownMenuItem>
        <DropdownMenuItem onClick={() => copy(ytDesc, 'YouTube description')}>YouTube Description</DropdownMenuItem>
        <DropdownMenuItem onClick={() => copy(fbDesc, 'FB/IG description')}>FB/IG Description</DropdownMenuItem>
        <DropdownMenuItem onClick={() => copy(podDesc, 'Podcast description')}>Podcast Description</DropdownMenuItem>
        {hasSong && <DropdownMenuSeparator />}
        {songTitle && <DropdownMenuItem onClick={() => copy(songTitle, 'Song title')}>Song Title</DropdownMenuItem>}
        {songDesc && (
          <DropdownMenuItem onClick={() => copy(songDesc, 'Song description')}>Song Description</DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function formatMonthLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  return new Date(y, m - 1).toLocaleDateString('en-US', {month: 'long', year: 'numeric'})
}

function getMonthRange(ym: string): {from: string; to: string} {
  const [y, m] = ym.split('-').map(Number)
  const lastDay = new Date(y, m, 0).getDate()
  return {
    from: `${y}-${String(m).padStart(2, '0')}-01`,
    to: `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`,
  }
}

export function DevotionListPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [search, setSearch] = usePersistedState('devotions.search', '')
  const debouncedSearch = useDebouncedValue(search, 250)
  const [typeFilter, setTypeFilter] = usePersistedState('devotions.typeFilter', 'all')
  const [guestFilter, setGuestFilter] = usePersistedState('devotions.guestFilter', 'all')
  const [statusFilter, setStatusFilter] = usePersistedState('devotions.statusFilter', 'all')
  const [monthFilter, setMonthFilter] = usePersistedState('devotions.monthFilter', 'all')
  const [page, setPage] = usePersistedState('devotions.page', 1)

  const {data: draftCountData} = useQuery({
    queryKey: ['scan-draft-count'],
    queryFn: () =>
      fetch('/api/devotions/scan-drafts', {credentials: 'include'}).then((r) => r.json()) as Promise<{id: number}[]>,
  })
  const draftCount = draftCountData?.length || 0

  const {data: availableMonths} = useQuery({
    queryKey: ['devotion-months'],
    queryFn: () => fetch('/api/devotions/months', {credentials: 'include'}).then((r) => r.json()) as Promise<string[]>,
  })
  const monthOptions = [
    {value: 'all', label: 'All Months'},
    ...(availableMonths || []).map((ym: string) => ({value: ym, label: formatMonthLabel(ym)})),
  ]
  const [sort, setSort] = usePersistedState<'date' | 'number'>('devotions.sort', 'date')
  const [sortDir, setSortDir] = usePersistedState<'asc' | 'desc'>('devotions.sortDir', 'desc')

  const monthDates = monthFilter !== 'all' ? getMonthRange(monthFilter) : undefined

  const {data, isLoading} = useQuery({
    queryKey: ['devotions', debouncedSearch, typeFilter, guestFilter, statusFilter, monthFilter, page, sort, sortDir],
    queryFn: () =>
      fetchDevotions({
        search: debouncedSearch || undefined,
        devotionType: typeFilter === 'all' ? undefined : typeFilter,
        guestSpeaker: guestFilter === 'all' ? undefined : guestFilter,
        status: statusFilter === 'all' ? undefined : statusFilter,
        dateFrom: monthDates?.from,
        dateTo: monthDates?.to,
        page,
        limit: 50,
        sort,
        sortDir,
      }),
  })

  const toggleMutation = useMutation({
    mutationFn: ({id, field}: {id: number; field: string}) => toggleDevotionField(id, field),
    onSuccess: () => {
      queryClient.invalidateQueries({queryKey: ['devotions']})
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const handleSort = (column: 'date' | 'number') => {
    if (sort === column) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSort(column)
      setSortDir(column === 'date' ? 'desc' : 'asc')
    }
  }

  const sortIcon = (column: 'date' | 'number') => {
    if (sort !== column) return <ArrowUpDown className="h-3 w-3 opacity-50" />
    return sortDir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-2xl font-bold">Devotions</h2>
        <div className="flex gap-2">
          <Button variant="outline" asChild className="hidden md:inline-flex">
            <Link to="/devotions/scan">
              <Camera className="h-4 w-4 mr-2" />
              Scan Sheet
              {draftCount > 0 && (
                <Badge variant="secondary" className="ml-1.5">
                  {draftCount}
                </Badge>
              )}
            </Link>
          </Button>
          <Button asChild>
            <Link to="/devotions/new">
              <Plus className="h-4 w-4 mr-2" />
              Add Devotion
            </Link>
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card size="sm">
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
            <SearchInput
              placeholder="Search..."
              value={search}
              onChange={(v) => {
                setSearch(v)
                setPage(1)
              }}
              onClear={() => setPage(1)}
              containerClassName="sm:max-w-sm"
            />
            <Select
              value={typeFilter}
              onValueChange={(v) => {
                setTypeFilter(v)
                setPage(1)
              }}
            >
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="original">Original</SelectItem>
                <SelectItem value="favorite">Favorite</SelectItem>
                <SelectItem value="guest">Guest</SelectItem>
                <SelectItem value="revisit">Revisit</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={guestFilter}
              onValueChange={(v) => {
                setGuestFilter(v)
                setPage(1)
              }}
            >
              <SelectTrigger className="w-full sm:w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Speakers</SelectItem>
                <SelectItem value="Tyler">Tyler</SelectItem>
                <SelectItem value="Gabe">Gabe</SelectItem>
                <SelectItem value="Ed">Ed</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={statusFilter}
              onValueChange={(v) => {
                setStatusFilter(v)
                setPage(1)
              }}
            >
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="complete">Complete</SelectItem>
                <SelectItem value="incomplete">Incomplete</SelectItem>
              </SelectContent>
            </Select>
            <SearchableSelect
              value={monthFilter}
              onValueChange={(v) => {
                setMonthFilter(v)
                setPage(1)
              }}
              options={monthOptions}
              className="w-full sm:w-52"
            />
          </div>
        </CardContent>

        {/* Table */}
        {isLoading ? (
          <CardContent>
            <PageSpinner />
          </CardContent>
        ) : (
          <>
            <div className="overflow-x-auto border-t">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>
                      <button
                        className="flex items-center gap-1 font-bold hover:text-foreground cursor-pointer"
                        onClick={() => handleSort('date')}
                      >
                        Date
                        {sortIcon('date')}
                      </button>
                    </TableHead>
                    <TableHead>
                      <button
                        className="flex items-center gap-1 font-bold hover:text-foreground cursor-pointer"
                        onClick={() => handleSort('number')}
                      >
                        #{sortIcon('number')}
                      </button>
                    </TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead>Song</TableHead>
                    <TableHead className="text-center">Produced</TableHead>
                    <TableHead className="text-center">R/V</TableHead>
                    <TableHead className="text-center">YouTube</TableHead>
                    <TableHead className="text-center">FB/IG</TableHead>
                    <TableHead className="text-center">Podcast</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data?.data.map((devotion) => (
                    <TableRow
                      key={devotion.id}
                      className="cursor-pointer hover:bg-muted"
                      onClick={() => navigate(`/devotions/${devotion.id}`)}
                    >
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {formatDate(devotion.date)}
                      </TableCell>
                      <TableCell className="font-medium tabular-nums">
                        #{String(devotion.number).padStart(3, '0')}
                      </TableCell>
                      <TableCell>
                        <TypeBadge devotion={devotion} />
                      </TableCell>
                      <TableCell className="max-w-48 truncate">{devotion.bibleReference || '—'}</TableCell>
                      <TableCell className="max-w-48 truncate text-muted-foreground">
                        {devotion.songName || '—'}
                      </TableCell>
                      <TableCell className="text-center">
                        <CheckboxCell
                          checked={devotion.produced}
                          onClick={(e) => {
                            e.stopPropagation()
                            toggleMutation.mutate({id: devotion.id, field: 'produced'})
                          }}
                        />
                      </TableCell>
                      <TableCell className="text-center">
                        <CheckboxCell
                          checked={devotion.rendered}
                          onClick={(e) => {
                            e.stopPropagation()
                            toggleMutation.mutate({id: devotion.id, field: 'rendered'})
                          }}
                        />
                      </TableCell>
                      <TableCell className="text-center">
                        <CheckboxCell
                          checked={devotion.youtube}
                          onClick={(e) => {
                            e.stopPropagation()
                            toggleMutation.mutate({id: devotion.id, field: 'youtube'})
                          }}
                        />
                      </TableCell>
                      <TableCell className="text-center">
                        <CheckboxCell
                          checked={devotion.facebookInstagram}
                          onClick={(e) => {
                            e.stopPropagation()
                            toggleMutation.mutate({id: devotion.id, field: 'facebookInstagram'})
                          }}
                        />
                      </TableCell>
                      <TableCell className="text-center">
                        <CheckboxCell
                          checked={devotion.podcast}
                          onClick={(e) => {
                            e.stopPropagation()
                            toggleMutation.mutate({id: devotion.id, field: 'podcast'})
                          }}
                        />
                      </TableCell>
                      <TableCell>
                        <CopyMenu devotion={devotion} />
                      </TableCell>
                    </TableRow>
                  ))}
                  {data?.data.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={11} className="text-center text-muted-foreground py-8">
                        No devotions found.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
            <CardContent>
              <Pagination page={page} pageSize={50} total={data?.total || 0} onPageChange={setPage} noun="devotions" />
            </CardContent>
          </>
        )}
      </Card>
    </div>
  )
}
