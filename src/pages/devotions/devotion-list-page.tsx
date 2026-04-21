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
import {MultiSelect} from '@/components/ui/multi-select'
import {Pagination} from '@/components/ui/pagination'
import {SearchInput} from '@/components/ui/search-input'
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
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Camera,
  Check,
  EllipsisVertical,
  Flag,
  Plus,
  X,
} from 'lucide-react'
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
    <div className="flex items-center gap-1.5">
      <Badge variant="outline" className={style.className}>
        {label}
      </Badge>
      {devotion.devotionType === 'revisit' && devotion.chainAuditStatus === 'issues' && (
        <span title="Chain has potential issues">
          <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
        </span>
      )}
      {devotion.devotionType === 'revisit' && devotion.chainAuditStatus === 'ok' && (
        <span title="Chain is complete">
          <Check className="h-3.5 w-3.5 text-green-600" />
        </span>
      )}
    </div>
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

function FlagCell({flagged, onClick}: {flagged: boolean; onClick: (e: React.MouseEvent) => void}) {
  return (
    <div
      className="flex items-center justify-center cursor-pointer h-7 w-7 rounded-lg border border-border hover:bg-muted/50 mx-auto"
      onClick={onClick}
    >
      <Flag className={`h-4 w-4 ${flagged ? 'text-red-500 fill-red-500' : 'text-muted-foreground'}`} />
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

export function DevotionListPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [search, setSearch] = usePersistedState('devotions.search', '')
  const debouncedSearch = useDebouncedValue(search, 250)
  const [typeFilters, setTypeFilters] = usePersistedState<string[]>('devotions.typeFilters', [])
  const [guestFilters, setGuestFilters] = usePersistedState<string[]>('devotions.guestFilters', [])
  const [statusFilter, setStatusFilter] = usePersistedState('devotions.statusFilter', 'all')
  const [pipelineFilters, setPipelineFilters] = usePersistedState<string[]>('devotions.pipelineFilters', [])
  const [flaggedFilter, setFlaggedFilter] = usePersistedState('devotions.flaggedFilter', 'all')
  const [monthFilters, setMonthFilters] = usePersistedState<string[]>('devotions.monthFilters', [])
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
  const monthOptions = (availableMonths || []).map((ym: string) => ({value: ym, label: formatMonthLabel(ym)}))
  const [sort, setSort] = usePersistedState<'date' | 'number'>('devotions.sort', 'date')
  const [sortDir, setSortDir] = usePersistedState<'asc' | 'desc'>('devotions.sortDir', 'desc')

  const {data, isLoading} = useQuery({
    queryKey: [
      'devotions',
      debouncedSearch,
      typeFilters.join(','),
      guestFilters.join(','),
      statusFilter,
      pipelineFilters.join(','),
      flaggedFilter,
      monthFilters.join(','),
      page,
      sort,
      sortDir,
    ],
    queryFn: () =>
      fetchDevotions({
        search: debouncedSearch || undefined,
        devotionType: typeFilters.length > 0 ? typeFilters.join(',') : undefined,
        guestSpeaker: guestFilters.length > 0 ? guestFilters.join(',') : undefined,
        status: statusFilter === 'all' ? undefined : statusFilter,
        pipelineMissing: pipelineFilters.length > 0 ? pipelineFilters.join(',') : undefined,
        flagged: flaggedFilter === 'flagged' ? 'true' : undefined,
        chainIssues: flaggedFilter === 'audit' ? 'true' : undefined,
        months: monthFilters.length > 0 ? monthFilters.join(',') : undefined,
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
            <MultiSelect
              value={typeFilters}
              onValueChange={(v) => {
                setTypeFilters(v)
                setPage(1)
              }}
              options={[
                {value: 'original', label: 'Original'},
                {value: 'favorite', label: 'Favorite'},
                {value: 'guest', label: 'Guest'},
                {value: 'revisit', label: 'Revisit'},
              ]}
              allLabel="All Types"
              searchable={false}
              className="w-full sm:w-40"
            />
            <MultiSelect
              value={guestFilters}
              onValueChange={(v) => {
                setGuestFilters(v)
                setPage(1)
              }}
              options={[
                {value: 'Tyler', label: 'Tyler'},
                {value: 'Gabe', label: 'Gabe'},
                {value: 'Ed', label: 'Ed'},
              ]}
              allLabel="All Speakers"
              searchable={false}
              className="w-full sm:w-44"
            />
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
            <MultiSelect
              value={pipelineFilters}
              onValueChange={(v) => {
                setPipelineFilters(v)
                setPage(1)
              }}
              options={[
                {value: 'produced', label: 'Produced'},
                {value: 'rendered', label: 'Rendered'},
                {value: 'youtube', label: 'YouTube'},
                {value: 'facebookInstagram', label: 'FB/IG'},
                {value: 'podcast', label: 'Podcast'},
              ]}
              allLabel="All Pipeline"
              placeholder="Missing Step"
              searchable={false}
              className="w-full sm:w-44"
            />
            <Select
              value={flaggedFilter}
              onValueChange={(v) => {
                setFlaggedFilter(v)
                setPage(1)
              }}
            >
              <SelectTrigger className="w-full sm:w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Flags</SelectItem>
                <SelectItem value="flagged">Flagged only</SelectItem>
                <SelectItem value="audit">Audit issues only</SelectItem>
              </SelectContent>
            </Select>
            <MultiSelect
              value={monthFilters}
              onValueChange={(v) => {
                setMonthFilters(v)
                setPage(1)
              }}
              options={monthOptions}
              allLabel="All Months"
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
                    <TableHead className="w-10 text-center">
                      <Flag className="h-3.5 w-3.5 text-muted-foreground mx-auto" />
                    </TableHead>
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
                      <TableCell className="text-center">
                        <FlagCell
                          flagged={devotion.flagged}
                          onClick={(e) => {
                            e.stopPropagation()
                            toggleMutation.mutate({id: devotion.id, field: 'flagged'})
                          }}
                        />
                      </TableCell>
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
                      <TableCell colSpan={12} className="text-center text-muted-foreground py-8">
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
