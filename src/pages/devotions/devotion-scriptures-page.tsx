import {Badge} from '@/components/ui/badge'
import {Button} from '@/components/ui/button'
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card'
import {Dialog, DialogContent, DialogHeader, DialogTitle} from '@/components/ui/dialog'
import {Input} from '@/components/ui/input'
import {PageSpinner} from '@/components/ui/spinner'
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from '@/components/ui/table'
import {useDebouncedValue} from '@/hooks/use-debounced-value'
import {youtubeSearchUrl} from '@/lib/devotion-api'
import {useQuery} from '@tanstack/react-query'
import {BookOpen, ChevronLeft, ChevronRight, ExternalLink, Search} from 'lucide-react'
import {useState} from 'react'
import {Link} from 'react-router-dom'

const TYPE_COLORS: Record<string, string> = {
  original: '#ef4444',
  favorite: '#a855f7',
  guest: '#3b82f6',
  revisit: '#22c55e',
}

const TYPE_LABELS: Record<string, string> = {
  original: 'Original',
  favorite: 'Favorite',
  guest: 'Guest',
  revisit: 'Revisit',
}

interface DuplicateGroup {
  reference: string
  count: number
  devotions: {
    id: number
    number: number
    date: string
    devotionType: string
    guestSpeaker: string | null
    bibleReference: string
  }[]
}

function fetchDuplicateScriptures() {
  return fetch('/api/devotions/scriptures/duplicates', {credentials: 'include'}).then((r) =>
    r.json(),
  ) as Promise<DuplicateGroup[]>
}

function fetchScriptureLookup(search: string) {
  return fetch(`/api/devotions/scriptures/lookup?search=${encodeURIComponent(search)}`, {credentials: 'include'}).then(
    (r) => r.json(),
  ) as Promise<DuplicateGroup[]>
}

export function DevotionScripturesPage() {
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search, 300)
  const [selected, setSelected] = useState<DuplicateGroup | null>(null)

  const {data: duplicates, isLoading: dupsLoading} = useQuery({
    queryKey: ['scripture-duplicates'],
    queryFn: fetchDuplicateScriptures,
  })

  const {data: searchResults, isLoading: searchLoading} = useQuery({
    queryKey: ['scripture-lookup', debouncedSearch],
    queryFn: () => fetchScriptureLookup(debouncedSearch),
    enabled: debouncedSearch.length >= 2,
  })

  const [page, setPage] = useState(1)
  const perPage = 50

  const isSearching = debouncedSearch.length >= 2
  const allData = isSearching ? searchResults : duplicates
  const loading = isSearching ? searchLoading : dupsLoading

  const totalItems = allData?.length || 0
  const totalPages = Math.ceil(totalItems / perPage)
  const safePage = Math.min(page, Math.max(1, totalPages))
  const showData = allData?.slice((safePage - 1) * perPage, safePage * perPage)

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Scripture Lookup</h2>
      </div>

      {/* Search */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-4 w-4" />
            Check if a verse has been used
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
            placeholder="Type a verse to search, e.g. John 3:16, Romans 8, Psalm 23..."
            className="text-base"
          />
          {isSearching && !searchLoading && searchResults?.length === 0 && (
            <p className="text-sm font-medium text-green-600 mt-2">
              This verse hasn't been used yet!
            </p>
          )}
        </CardContent>
      </Card>

      {/* Table */}
      {loading ? (
        <PageSpinner />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="h-4 w-4" />
              {isSearching ? 'Search Results' : 'Duplicate References'}
              {showData && (
                <Badge variant="secondary" className="ml-1">
                  {showData.length}
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!showData?.length ? (
              <p className="text-center text-muted-foreground py-8">
                {isSearching ? 'No matches found.' : 'No duplicate references found.'}
              </p>
            ) : (
              <>
              <div className="border rounded-md overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Reference</TableHead>
                      <TableHead className="text-right">Times Used</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {showData?.map((group) => (
                      <TableRow
                        key={group.reference}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => setSelected(group)}
                      >
                        <TableCell className="font-medium">{group.reference}</TableCell>
                        <TableCell className="text-right">
                          <Badge variant={group.count > 2 ? 'destructive' : 'secondary'}>{group.count}</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <p className="text-sm text-muted-foreground">
                    {(safePage - 1) * perPage + 1}&ndash;{Math.min(safePage * perPage, totalItems)} of {totalItems}
                  </p>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" disabled={safePage <= 1} onClick={() => setPage((p) => p - 1)}>
                      <ChevronLeft className="h-4 w-4 mr-1" />
                      Previous
                    </Button>
                    <Button variant="outline" size="sm" disabled={safePage >= totalPages} onClick={() => setPage((p) => p + 1)}>
                      Next
                      <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                  </div>
                </div>
              )}
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Detail Modal */}
      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{selected?.reference}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            {selected?.devotions.map((d) => (
              <div key={d.id} className="flex items-center gap-3 py-2 border-b last:border-0">
                <Link
                  to={`/devotions/${d.id}`}
                  className="text-primary hover:underline font-medium"
                  onClick={() => setSelected(null)}
                >
                  #{d.number}
                </Link>
                <span className="text-sm text-muted-foreground">{d.date}</span>
                <Badge
                  variant="outline"
                  className="text-xs"
                  style={{borderColor: TYPE_COLORS[d.devotionType], color: TYPE_COLORS[d.devotionType]}}
                >
                  {TYPE_LABELS[d.devotionType] || d.devotionType}
                  {d.guestSpeaker ? ` - ${d.guestSpeaker}` : ''}
                </Badge>
                <span className="text-xs text-muted-foreground truncate flex-1">{d.bibleReference}</span>
                <a
                  href={youtubeSearchUrl(d.number)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground hover:text-foreground shrink-0"
                  onClick={(e) => e.stopPropagation()}
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
