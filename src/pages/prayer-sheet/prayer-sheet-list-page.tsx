import {ConfirmDialog} from '@/components/confirm-dialog'
import {PRAYER_SHEET_COLORS} from '@/components/prayer-sheet/color-swatches'
import {PhotoImportDialog} from '@/components/prayer-sheet/photo-import-dialog'
import {Button} from '@/components/ui/button'
import {Card, CardContent} from '@/components/ui/card'
import {DatePicker} from '@/components/ui/date-time-picker'
import {Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle} from '@/components/ui/dialog'
import {Label} from '@/components/ui/label'
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select'
import {PageSpinner} from '@/components/ui/spinner'
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from '@/components/ui/table'
import {
  createPrayerSheetEdition,
  deletePrayerSheetEdition,
  fetchPrayerSheetEditionYears,
  fetchPrayerSheetEditions,
} from '@/lib/api'
import {queryKeys} from '@/lib/query-keys'
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'
import {Camera, Plus, Settings, Trash2} from 'lucide-react'
import {useState} from 'react'
import {Link, useNavigate} from 'react-router-dom'
import {toast} from 'sonner'

function nextSunday(): string {
  const d = new Date()
  const day = d.getDay()
  const diff = day === 0 ? 7 : 7 - day
  d.setDate(d.getDate() + diff)
  return d.toISOString().slice(0, 10)
}

function colorName(hex: string): string {
  return PRAYER_SHEET_COLORS.find((c) => c.value.toLowerCase() === hex.toLowerCase())?.label ?? hex
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString('en-US', {month: 'short', day: 'numeric', year: 'numeric'})
}

export function PrayerSheetListPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [year, setYear] = useState('all')
  const [page, setPage] = useState(1)
  const [createOpen, setCreateOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<{id: number; latestDate: string | null} | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [newDate, setNewDate] = useState(nextSunday())

  const {data: years} = useQuery({
    queryKey: queryKeys.prayerSheetEditionYears,
    queryFn: fetchPrayerSheetEditionYears,
  })

  const {data, isLoading} = useQuery({
    queryKey: queryKeys.prayerSheetEditions(page, year === 'all' ? undefined : Number(year)),
    queryFn: () => fetchPrayerSheetEditions({page, year: year === 'all' ? undefined : Number(year)}),
  })

  const create = useMutation({
    mutationFn: (sundayDate: string) => createPrayerSheetEdition(sundayDate),
    onSuccess: (edition) => {
      queryClient.invalidateQueries({queryKey: queryKeys.prayerSheetEditionYears})
      queryClient.invalidateQueries({queryKey: ['prayerSheetEditions']})
      setCreateOpen(false)
      navigate(`/prayer-sheet/${edition.id}`)
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed to create edition'),
  })

  const remove = useMutation({
    mutationFn: deletePrayerSheetEdition,
    onSuccess: () => {
      queryClient.invalidateQueries({queryKey: ['prayerSheetEditions']})
      queryClient.invalidateQueries({queryKey: queryKeys.prayerSheetEditionYears})
      setDeleteTarget(null)
      toast.success('Edition deleted')
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed to delete'),
  })

  if (isLoading) return <PageSpinner />

  const totalPages = data ? Math.ceil(data.total / data.limit) : 1

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Prayer Sheets</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link to="/schedules/settings/prayer-sheet">
              <Settings className="w-4 h-4 mr-1" />
              Settings
            </Link>
          </Button>
          <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
            <Camera className="w-4 h-4 mr-1" />
            Import Photo
          </Button>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="w-4 h-4 mr-1" />
            New Edition
          </Button>
        </div>
      </div>

      <Card className="gap-0 py-0">
        <CardContent className="p-0">
          <div className="flex items-center gap-3 p-4 border-b">
            <Label className="shrink-0">Year</Label>
            <Select
              value={year}
              onValueChange={(v) => {
                setYear(v)
                setPage(1)
              }}
            >
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All years</SelectItem>
                {(years ?? []).map((y) => (
                  <SelectItem key={y} value={y}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Latest Sunday</TableHead>
                <TableHead>Color</TableHead>
                <TableHead className="text-right">Sundays</TableHead>
                <TableHead className="text-right">Entries</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data?.items ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    No editions yet. Create one to get started.
                  </TableCell>
                </TableRow>
              )}
              {(data?.items ?? []).map((edition) => (
                <TableRow
                  key={edition.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => navigate(`/prayer-sheet/${edition.id}`)}
                >
                  <TableCell className="font-medium">{formatDate(edition.latestDate)}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div
                        className="w-4 h-4 rounded-sm border border-border shrink-0"
                        style={{backgroundColor: edition.themeColor}}
                      />
                      <span className="text-sm text-muted-foreground">{colorName(edition.themeColor)}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">{edition.sundayCount}</TableCell>
                  <TableCell className="text-right">{edition.entryCount}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Delete edition"
                      onClick={(e) => {
                        e.stopPropagation()
                        setDeleteTarget({id: edition.id, latestDate: edition.latestDate})
                      }}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {totalPages > 1 && (
            <div className="flex justify-center gap-2 p-4 border-t">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                Previous
              </Button>
              <span className="flex items-center text-sm text-muted-foreground">
                {page} / {totalPages}
              </span>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
                Next
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <PhotoImportDialog open={importOpen} onOpenChange={setImportOpen} />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={`Delete the ${formatDate(deleteTarget?.latestDate ?? null)} edition?`}
        description="Its Sundays, entries, and imported photo are deleted. This can't be undone."
        confirmLabel="Delete"
        variant="destructive"
        loading={remove.isPending}
        onConfirm={() => deleteTarget && remove.mutate(deleteTarget.id)}
      />

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Prayer Sheet Edition</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Sunday date for this edition</Label>
              <DatePicker value={newDate} onChange={(v) => v && setNewDate(v)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => create.mutate(newDate)} disabled={create.isPending}>
              {create.isPending ? 'Creating…' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
