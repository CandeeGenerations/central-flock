import {Badge} from '@/components/ui/badge'
import {Button} from '@/components/ui/button'
import {Card, CardContent} from '@/components/ui/card'
import {MultiSelect} from '@/components/ui/multi-select'
import {SearchInput} from '@/components/ui/search-input'
import {PageSpinner} from '@/components/ui/spinner'
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from '@/components/ui/table'
import {useDebouncedValue} from '@/hooks/use-debounced-value'
import {usePersistedState} from '@/hooks/use-persisted-state'
import {formatDate} from '@/lib/date'
import {
  SERVICE_TYPE_LABELS,
  SPECIAL_STATUS_LABELS,
  SPECIAL_TYPE_LABELS,
  type ServiceType,
  type Special,
  type SpecialStatus,
  type SpecialType,
  parseGuestPerformers,
  performerDisplayName,
  specialsApi,
} from '@/lib/specials-api'
import {useQuery} from '@tanstack/react-query'
import {FileText, Music, Plus, Video} from 'lucide-react'
import {Link, useNavigate} from 'react-router-dom'

const STATUS_OPTIONS: {value: SpecialStatus; label: string}[] = (
  Object.keys(SPECIAL_STATUS_LABELS) as SpecialStatus[]
).map((v) => ({value: v, label: SPECIAL_STATUS_LABELS[v]}))

const SERVICE_OPTIONS: {value: ServiceType; label: string}[] = (Object.keys(SERVICE_TYPE_LABELS) as ServiceType[]).map(
  (v) => ({value: v, label: SERVICE_TYPE_LABELS[v]}),
)

const TYPE_OPTIONS: {value: SpecialType; label: string}[] = (Object.keys(SPECIAL_TYPE_LABELS) as SpecialType[]).map(
  (v) => ({value: v, label: SPECIAL_TYPE_LABELS[v]}),
)

const STATUS_STYLE: Record<SpecialStatus, string> = {
  needs_review: 'bg-yellow-100 text-yellow-900 dark:bg-yellow-900 dark:text-yellow-100',
  will_perform: 'bg-blue-100 text-blue-900 dark:bg-blue-900 dark:text-blue-100',
  performed: 'bg-green-100 text-green-900 dark:bg-green-900 dark:text-green-100',
}

function formatPerformers(s: Special): string {
  const linked = s.performers.map(performerDisplayName)
  const guests = parseGuestPerformers(s.guestPerformers)
  return [...linked, ...guests.map((g) => `${g} (guest)`)].join(', ') || '—'
}

export function SpecialsListPage() {
  const navigate = useNavigate()
  const [statuses, setStatuses] = usePersistedState<SpecialStatus[]>('specials.filter.status', [])
  const [services, setServices] = usePersistedState<ServiceType[]>('specials.filter.service', [])
  const [types, setTypes] = usePersistedState<SpecialType[]>('specials.filter.type', [])
  const [search, setSearch] = usePersistedState('specials.filter.q', '')
  const debouncedSearch = useDebouncedValue(search, 200)

  const {data, isLoading} = useQuery({
    queryKey: ['specials-list', statuses, services, types, debouncedSearch],
    queryFn: () =>
      specialsApi.list({
        status: statuses.length > 0 ? statuses : undefined,
        serviceType: services.length > 0 ? services : undefined,
        type: types.length > 0 ? types : undefined,
        q: debouncedSearch || undefined,
      }),
  })

  const rows = data ?? []

  return (
    <div className="container mx-auto p-6 space-y-6 max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Music className="h-6 w-6" />
            Specials
          </h1>
          <p className="text-sm text-muted-foreground">Special music performed at services.</p>
        </div>
        <Button onClick={() => navigate('/music/specials/new')}>
          <Plus className="h-4 w-4 mr-1" /> New Special
        </Button>
      </div>

      <Card>
        <CardContent className="pt-6 grid grid-cols-1 md:grid-cols-4 gap-3">
          <SearchInput
            placeholder="Search song or performer..."
            value={search}
            onChange={(v) => setSearch(v)}
            className="md:col-span-1"
          />
          <MultiSelect
            value={statuses}
            onValueChange={(v) => setStatuses(v as SpecialStatus[])}
            options={STATUS_OPTIONS}
            placeholder="Status"
          />
          <MultiSelect
            value={services}
            onValueChange={(v) => setServices(v as ServiceType[])}
            options={SERVICE_OPTIONS}
            placeholder="Service"
          />
          <MultiSelect
            value={types}
            onValueChange={(v) => setTypes(v as SpecialType[])}
            options={TYPE_OPTIONS}
            placeholder="Type"
          />
        </CardContent>
      </Card>

      {isLoading ? (
        <PageSpinner />
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No specials found. Click <span className="font-medium">+ New Special</span> to add one.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Service</TableHead>
                <TableHead>Song</TableHead>
                <TableHead>Performers</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Media</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((s) => (
                <TableRow
                  key={s.id}
                  className="cursor-pointer hover:bg-accent/40"
                  onClick={() => navigate(`/music/specials/${s.id}`)}
                >
                  <TableCell className="whitespace-nowrap">{formatDate(s.date)}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    {SERVICE_TYPE_LABELS[s.serviceType]}
                    {s.serviceLabel ? ` · ${s.serviceLabel}` : ''}
                  </TableCell>
                  <TableCell>
                    <Link to={`/music/specials/${s.id}`} className="hover:underline">
                      {s.songTitle}
                    </Link>
                  </TableCell>
                  <TableCell className="max-w-xs truncate" title={formatPerformers(s)}>
                    {formatPerformers(s)}
                  </TableCell>
                  <TableCell>{SPECIAL_TYPE_LABELS[s.type]}</TableCell>
                  <TableCell>
                    <Badge className={STATUS_STYLE[s.status]}>{SPECIAL_STATUS_LABELS[s.status]}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2 text-muted-foreground">
                      {s.youtubeUrl ? <Video className="h-4 w-4 text-red-600" /> : null}
                      {s.sheetMusicPath ? <FileText className="h-4 w-4 text-blue-600" /> : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  )
}
