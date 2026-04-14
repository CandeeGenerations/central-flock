import {ConfirmDialog} from '@/components/confirm-dialog'
import {NurseryWorkerForm} from '@/components/nursery/nursery-worker-form'
import {Badge} from '@/components/ui/badge'
import {Button} from '@/components/ui/button'
import {Card, CardContent} from '@/components/ui/card'
import {Pagination} from '@/components/ui/pagination'
import {SearchInput} from '@/components/ui/search-input'
import {PageSpinner} from '@/components/ui/spinner'
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from '@/components/ui/table'
import {useDebouncedValue} from '@/hooks/use-debounced-value'
import type {NurseryWorker, ServiceType} from '@/lib/nursery-api'
import {
  createNurseryWorker,
  deleteNurseryWorker,
  fetchNurseryWorkers,
  updateNurseryWorker,
  updateWorkerServices,
} from '@/lib/nursery-api'
import {nurseryKeys} from '@/lib/nursery-query-keys'
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'
import {Pencil, Plus, Trash2} from 'lucide-react'
import {useMemo, useState} from 'react'
import {toast} from 'sonner'

const SERVICE_LABELS: Record<ServiceType, string> = {
  sunday_school: 'SS',
  morning: 'AM',
  evening: 'PM',
  wednesday_evening: 'Wed',
}

const PAGE_SIZE = 25

export function NurseryWorkersPage() {
  const queryClient = useQueryClient()
  const [formOpen, setFormOpen] = useState(false)
  const [editingWorker, setEditingWorker] = useState<NurseryWorker | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<NurseryWorker | null>(null)
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search, 250)
  const [page, setPage] = useState(1)

  const {data: workers, isLoading} = useQuery({queryKey: nurseryKeys.workers, queryFn: fetchNurseryWorkers})

  const filtered = useMemo(() => {
    if (!workers) return []
    if (!debouncedSearch) return workers
    const q = debouncedSearch.toLowerCase()
    return workers.filter((w) => w.name.toLowerCase().includes(q))
  }, [workers, debouncedSearch])

  const paginated = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE
    return filtered.slice(start, start + PAGE_SIZE)
  }, [filtered, page])

  const createMutation = useMutation({
    mutationFn: createNurseryWorker,
    onSuccess: () => {
      queryClient.invalidateQueries({queryKey: nurseryKeys.workers})
      setFormOpen(false)
      toast.success('Worker added')
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Failed to create worker'),
  })

  const updateMutation = useMutation({
    mutationFn: async (data: {
      id: number
      name: string
      maxPerMonth: number
      allowMultiplePerDay: boolean
      services: {serviceType: ServiceType; maxPerMonth: number | null}[]
    }) => {
      await updateNurseryWorker(data.id, {
        name: data.name,
        maxPerMonth: data.maxPerMonth,
        allowMultiplePerDay: data.allowMultiplePerDay,
      })
      await updateWorkerServices(data.id, data.services)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({queryKey: nurseryKeys.workers})
      setEditingWorker(null)
      toast.success('Worker updated')
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Failed to update worker'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteNurseryWorker(id),
    onSuccess: () => {
      queryClient.invalidateQueries({queryKey: nurseryKeys.workers})
      setDeleteTarget(null)
      toast.success('Worker deleted')
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Failed to delete worker'),
  })

  const toggleActiveMutation = useMutation({
    mutationFn: ({id, isActive}: {id: number; isActive: boolean}) => updateNurseryWorker(id, {isActive}),
    onSuccess: () => {
      queryClient.invalidateQueries({queryKey: nurseryKeys.workers})
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Failed to update worker'),
  })

  if (isLoading) return <PageSpinner />

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Nursery Workers</h2>
        <Button onClick={() => setFormOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Add Worker
        </Button>
      </div>

      <Card size="sm">
        <CardContent>
          <SearchInput
            placeholder="Search workers..."
            value={search}
            onChange={(v) => {
              setSearch(v)
              setPage(1)
            }}
            onClear={() => setPage(1)}
            containerClassName="sm:max-w-sm"
          />
        </CardContent>
        <div className="overflow-x-auto border-t">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Services</TableHead>
                <TableHead className="text-center">Max/Month</TableHead>
                <TableHead className="text-center">Multi-Day</TableHead>
                <TableHead className="text-center">Active</TableHead>
                <TableHead className="w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginated.map((worker) => (
                <TableRow key={worker.id} className={`hover:bg-muted/50${!worker.isActive ? ' opacity-50' : ''}`}>
                  <TableCell className="font-medium">{worker.name}</TableCell>
                  <TableCell>
                    <div className="flex gap-1 flex-wrap">
                      {worker.services.map((svc) => (
                        <Badge key={svc.serviceType} variant="secondary" className="text-xs">
                          {SERVICE_LABELS[svc.serviceType]}
                          {svc.maxPerMonth ? ` (${svc.maxPerMonth})` : ''}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="text-center">{worker.maxPerMonth}</TableCell>
                  <TableCell className="text-center">{worker.allowMultiplePerDay ? 'Yes' : 'No'}</TableCell>
                  <TableCell className="text-center">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleActiveMutation.mutate({id: worker.id, isActive: !worker.isActive})}
                    >
                      {worker.isActive ? 'Active' : 'Inactive'}
                    </Button>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setEditingWorker(worker)
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(worker)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {paginated.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    {debouncedSearch ? 'No workers match your search.' : 'No workers yet. Add one to get started.'}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        <CardContent>
          <Pagination page={page} pageSize={PAGE_SIZE} total={filtered.length} onPageChange={setPage} noun="workers" />
        </CardContent>
      </Card>

      <NurseryWorkerForm
        open={formOpen}
        onOpenChange={setFormOpen}
        onSave={(data) => createMutation.mutate(data)}
        isPending={createMutation.isPending}
      />

      <NurseryWorkerForm
        key={editingWorker?.id}
        open={!!editingWorker}
        onOpenChange={(v) => !v && setEditingWorker(null)}
        worker={editingWorker}
        onSave={(data) => editingWorker && updateMutation.mutate({id: editingWorker.id, ...data})}
        isPending={updateMutation.isPending}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(v) => !v && setDeleteTarget(null)}
        title="Delete Worker"
        description={`Are you sure you want to delete ${deleteTarget?.name}? This will remove them from any future schedules.`}
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
        loading={deleteMutation.isPending}
      />
    </div>
  )
}
