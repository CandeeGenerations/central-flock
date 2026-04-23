import {ConfirmDialog} from '@/components/confirm-dialog'
import {MoveItemDialog} from '@/components/notes/move-item-dialog'
import {NewItemDialog} from '@/components/notes/new-item-dialog'
import {Badge} from '@/components/ui/badge'
import {Button} from '@/components/ui/button'
import {Card, CardContent} from '@/components/ui/card'
import {Checkbox} from '@/components/ui/checkbox'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {Pagination} from '@/components/ui/pagination'
import {SearchInput} from '@/components/ui/search-input'
import {PageSpinner} from '@/components/ui/spinner'
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from '@/components/ui/table'
import {Tooltip, TooltipContent, TooltipProvider, TooltipTrigger} from '@/components/ui/tooltip'
import {useDebouncedValue} from '@/hooks/use-debounced-value'
import {useSetToggle} from '@/hooks/use-set-toggle'
import {formatDateTime} from '@/lib/date'
import {
  type NoteTreeItem,
  buildNoteTree,
  countDescendants,
  createNoteItem,
  deleteNoteItems,
  duplicateNote,
  fetchNotesTree,
  filterNoteTree,
  moveNoteItem,
} from '@/lib/notes-api'
import {queryKeys} from '@/lib/query-keys'
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'
import {
  type ColumnDef,
  type ExpandedState,
  flexRender,
  getCoreRowModel,
  getExpandedRowModel,
  useReactTable,
} from '@tanstack/react-table'
import {
  ChevronDown,
  ChevronRight,
  Copy,
  FileText,
  Folder,
  FolderInput,
  MoreHorizontal,
  Plus,
  Trash2,
} from 'lucide-react'
import {useCallback, useEffect, useMemo, useState} from 'react'
import {useNavigate} from 'react-router-dom'
import {toast} from 'sonner'

const PAGE_SIZE = 25

// ---------------------------------------------------------------------------
// Column definitions
// ---------------------------------------------------------------------------
function useColumns(
  selectedIds: Set<number>,
  toggleSelect: (id: number) => void,
  onDelete: (ids: number[]) => void,
  onDuplicate: (id: number) => void,
  onMove: (item: NoteTreeItem) => void,
  allRootIds: number[],
  navigate: ReturnType<typeof useNavigate>,
): ColumnDef<NoteTreeItem>[] {
  const allSelected = allRootIds.length > 0 && allRootIds.every((id) => selectedIds.has(id))

  return useMemo(
    () => [
      // Expander chevron
      {
        id: 'expander',
        header: () => null,
        size: 36,
        cell: ({row}) =>
          row.original.type === 'folder' ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={(e) => {
                e.stopPropagation()
                row.toggleExpanded()
              }}
            >
              {row.getIsExpanded() ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
            </Button>
          ) : (
            <div className="h-8 w-8" />
          ),
      },
      // Checkbox
      {
        id: 'select',
        header: () => (
          <Checkbox
            checked={allSelected}
            onCheckedChange={() => {
              if (allSelected) {
                allRootIds.forEach((id) => toggleSelect(id))
              } else {
                allRootIds.forEach((id) => {
                  if (!selectedIds.has(id)) toggleSelect(id)
                })
              }
            }}
          />
        ),
        size: 36,
        cell: ({row}) => (
          <Checkbox
            checked={selectedIds.has(row.original.id)}
            onCheckedChange={() => toggleSelect(row.original.id)}
            onClick={(e) => e.stopPropagation()}
          />
        ),
      },
      // Name + icon with indentation
      {
        id: 'title',
        accessorKey: 'title',
        header: 'Name',
        cell: ({row}) => (
          <div className="flex items-center gap-2" style={{paddingLeft: `${row.depth * 1.25}rem`}}>
            {row.original.type === 'folder' ? (
              <Folder className="h-4 w-4 text-muted-foreground shrink-0" />
            ) : (
              <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
            )}
            <span className="font-medium truncate">{row.original.title}</span>
            {row.original.type === 'folder' && row.original.subRows && row.original.subRows.length > 0 && (
              <Badge variant="secondary" className="text-xs shrink-0">
                {row.original.subRows.length}
              </Badge>
            )}
          </div>
        ),
      },
      // Excerpt (notes only)
      {
        id: 'excerpt',
        header: 'Preview',
        cell: ({row}) => {
          if (row.original.type === 'folder' || !row.original.excerpt) return null
          return (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="text-muted-foreground text-sm truncate block max-w-xs">
                    {row.original.excerpt.length > 80 ? `${row.original.excerpt.slice(0, 80)}…` : row.original.excerpt}
                  </span>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-sm whitespace-pre-wrap">
                  {row.original.excerpt}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )
        },
      },
      // Updated at
      {
        id: 'updatedAt',
        accessorKey: 'updatedAt',
        header: 'Modified',
        cell: ({row}) => (
          <span className="text-sm text-muted-foreground whitespace-nowrap">
            {formatDateTime(row.original.updatedAt)}
          </span>
        ),
      },
      // Actions
      {
        id: 'actions',
        header: () => null,
        size: 40,
        cell: ({row}) => (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => e.stopPropagation()}>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {row.original.type === 'note' && (
                <DropdownMenuItem onClick={() => navigate(`/notes/note/${row.original.id}`)}>Open</DropdownMenuItem>
              )}
              {row.original.type === 'note' && (
                <DropdownMenuItem onClick={() => navigate(`/notes/note/${row.original.id}/edit`)}>
                  Edit
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation()
                  onDuplicate(row.original.id)
                }}
              >
                <Copy className="h-4 w-4 mr-2" />
                Duplicate
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation()
                  onMove(row.original)
                }}
              >
                <FolderInput className="h-4 w-4 mr-2" />
                Move
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={(e) => {
                  e.stopPropagation()
                  onDelete([row.original.id])
                }}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedIds, allRootIds, allSelected, onMove],
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export function NotesPage() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search, 250)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [pendingDeleteIds, setPendingDeleteIds] = useState<number[]>([])
  const [newDialogOpen, setNewDialogOpen] = useState(false)
  const [newDialogDefaultType, setNewDialogDefaultType] = useState<'folder' | 'note'>('note')
  // Increment to remount NewItemDialog and reset its internal state on each open
  const [newDialogKey, setNewDialogKey] = useState(0)
  const [page, setPage] = useState(1)
  // Move dialog
  const [moveTarget, setMoveTarget] = useState<NoteTreeItem | null>(null)

  // Persist expand state across nav
  const [expanded, setExpanded] = useState<ExpandedState>(() => {
    try {
      return JSON.parse(sessionStorage.getItem('notes:expanded') || '{}')
    } catch {
      return {}
    }
  })
  useEffect(() => {
    sessionStorage.setItem('notes:expanded', JSON.stringify(expanded))
  }, [expanded])

  const toggleSelect = useSetToggle(setSelectedIds)

  const {data: flatItems, isLoading} = useQuery({
    queryKey: queryKeys.notesTree,
    queryFn: fetchNotesTree,
  })

  // Build + filter tree
  const fullTree = useMemo(() => (flatItems ? buildNoteTree(flatItems) : []), [flatItems])
  const filteredTree = useMemo(() => filterNoteTree(fullTree, debouncedSearch), [fullTree, debouncedSearch])

  // Paginate root items only
  const paginatedRoots = useMemo(
    () => filteredTree.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filteredTree, page],
  )

  // All visible root-level IDs for select-all (across search, pre-pagination)
  const allRootIds = useMemo(() => filteredTree.map((i) => i.id), [filteredTree])

  // Mutations
  const createMutation = useMutation({
    mutationFn: (data: {type: 'folder' | 'note'; title: string}) => createNoteItem(data),
    onSuccess: (item) => {
      queryClient.invalidateQueries({queryKey: queryKeys.notesTree})
      toast.success(`${item.type === 'folder' ? 'Folder' : 'Note'} "${item.title}" created`)
      setNewDialogOpen(false)
      if (item.type === 'note') navigate(`/notes/note/${item.id}/edit`)
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed to create'),
  })

  const deleteMutation = useMutation({
    mutationFn: (ids: number[]) => deleteNoteItems(ids),
    onSuccess: (data, ids) => {
      queryClient.invalidateQueries({queryKey: queryKeys.notesTree})
      toast.success(`Deleted ${data.deleted} item${data.deleted !== 1 ? 's' : ''}`)
      setSelectedIds((prev) => {
        const next = new Set(prev)
        ids.forEach((id) => next.delete(id))
        return next
      })
      setConfirmOpen(false)
      setPendingDeleteIds([])
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed to delete'),
  })

  const duplicateMutation = useMutation({
    mutationFn: (id: number) => duplicateNote(id),
    onSuccess: (item) => {
      queryClient.invalidateQueries({queryKey: queryKeys.notesTree})
      toast.success(`${item.type === 'folder' ? 'Folder' : 'Note'} duplicated`)
      if (item.type === 'note') navigate(`/notes/note/${item.id}/edit`)
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed to duplicate'),
  })

  const moveMutation = useMutation({
    mutationFn: ({id, parentId}: {id: number; parentId: number | null}) => moveNoteItem(id, {parentId}),
    onSuccess: () => {
      queryClient.invalidateQueries({queryKey: queryKeys.notesTree})
      toast.success('Moved')
      setMoveTarget(null)
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed to move'),
  })

  // Keyboard shortcuts: ⌘⇧N → new note, ⌘⇧F → new folder
  const openNewDialog = useCallback(
    (type: 'folder' | 'note') => {
      setNewDialogDefaultType(type)
      setNewDialogKey((k) => k + 1)
      setNewDialogOpen(true)
    },
    [setNewDialogDefaultType, setNewDialogKey, setNewDialogOpen],
  )

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'N') {
        e.preventDefault()
        openNewDialog('note')
      } else if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'F') {
        e.preventDefault()
        openNewDialog('folder')
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [openNewDialog])

  function requestDelete(ids: number[]) {
    setPendingDeleteIds(ids)
    setConfirmOpen(true)
  }

  // Descendant count for delete confirmation
  const pendingDeleteDescendantCount = useMemo(() => {
    if (!pendingDeleteIds.length) return 0
    const pendingSet = new Set(pendingDeleteIds)
    const roots = fullTree.filter((i) => pendingSet.has(i.id))
    return countDescendants(roots)
  }, [pendingDeleteIds, fullTree])

  const confirmDescription = useMemo(() => {
    const base =
      pendingDeleteIds.length === 1
        ? 'This will permanently delete the selected item.'
        : `This will permanently delete ${pendingDeleteIds.length} items.`
    if (pendingDeleteDescendantCount > 0) {
      return `${base} ${pendingDeleteDescendantCount} nested item${pendingDeleteDescendantCount !== 1 ? 's' : ''} will also be removed. This cannot be undone.`
    }
    return `${base} This action cannot be undone.`
  }, [pendingDeleteIds, pendingDeleteDescendantCount])

  const columns = useColumns(
    selectedIds,
    toggleSelect,
    requestDelete,
    (id) => duplicateMutation.mutate(id),
    (item) => setMoveTarget(item),
    allRootIds,
    navigate,
  )

  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: paginatedRoots,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    getSubRows: (row) => row.subRows,
    state: {expanded},
    onExpandedChange: setExpanded,
    autoResetExpanded: false,
  })

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <h2 className="text-2xl font-bold">Notes</h2>
      </div>

      <Card size="sm">
        <CardContent>
          <div className="flex items-center justify-between gap-3">
            <SearchInput
              placeholder="Search notes…"
              value={search}
              onChange={(v) => {
                setSearch(v)
                setPage(1)
              }}
              containerClassName="flex-1 sm:max-w-sm"
            />
            <div className="flex flex-wrap gap-2 shrink-0">
              {selectedIds.size > 0 && (
                <Button variant="destructive" onClick={() => requestDelete([...selectedIds])}>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete ({selectedIds.size})
                </Button>
              )}
              <Button variant="outline" onClick={() => openNewDialog('folder')}>
                <Plus className="h-4 w-4 mr-2" />
                New Folder
              </Button>
              <Button onClick={() => openNewDialog('note')}>
                <Plus className="h-4 w-4 mr-2" />
                New Note
              </Button>
            </div>
          </div>
        </CardContent>

        {isLoading ? (
          <CardContent>
            <PageSpinner />
          </CardContent>
        ) : (
          <>
            <div className="overflow-x-auto border-t">
              <Table>
                <TableHeader>
                  {table.getHeaderGroups().map((headerGroup) => (
                    <TableRow key={headerGroup.id}>
                      {headerGroup.headers.map((header) => (
                        <TableHead
                          key={header.id}
                          style={{width: header.column.getSize() !== 150 ? header.column.getSize() : undefined}}
                        >
                          {header.isPlaceholder
                            ? null
                            : flexRender(header.column.columnDef.header, header.getContext())}
                        </TableHead>
                      ))}
                    </TableRow>
                  ))}
                </TableHeader>
                <TableBody>
                  {table.getRowModel().rows.length > 0 ? (
                    table.getRowModel().rows.map((row) => (
                      <TableRow
                        key={row.id}
                        className="cursor-pointer hover:bg-muted/50"
                        data-selected={selectedIds.has(row.original.id) || undefined}
                        onClick={() => {
                          if (row.original.type === 'note') {
                            navigate(`/notes/note/${row.original.id}`)
                          } else {
                            row.toggleExpanded()
                          }
                        }}
                      >
                        {row.getVisibleCells().map((cell) => (
                          <TableCell key={cell.id}>
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">
                        {debouncedSearch
                          ? 'No notes match your search.'
                          : 'No notes yet. Create your first note or folder.'}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            <CardContent>
              <Pagination
                page={page}
                pageSize={PAGE_SIZE}
                total={filteredTree.length}
                onPageChange={setPage}
                noun="items"
              />
            </CardContent>
          </>
        )}
      </Card>

      <NewItemDialog
        key={newDialogKey}
        open={newDialogOpen}
        onOpenChange={setNewDialogOpen}
        defaultType={newDialogDefaultType}
        loading={createMutation.isPending}
        onConfirm={(type, title) => createMutation.mutate({type, title})}
      />

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={(open) => {
          setConfirmOpen(open)
          if (!open) setPendingDeleteIds([])
        }}
        title={`Delete ${pendingDeleteIds.length} item${pendingDeleteIds.length !== 1 ? 's' : ''}?`}
        description={confirmDescription}
        confirmLabel="Delete"
        variant="destructive"
        loading={deleteMutation.isPending}
        onConfirm={() => deleteMutation.mutate(pendingDeleteIds)}
      />

      {moveTarget && (
        <MoveItemDialog
          key={moveTarget.id}
          open={!!moveTarget}
          onOpenChange={(open) => {
            if (!open) setMoveTarget(null)
          }}
          item={moveTarget}
          tree={fullTree}
          loading={moveMutation.isPending}
          onConfirm={(parentId) => moveMutation.mutate({id: moveTarget.id, parentId})}
        />
      )}
    </div>
  )
}
