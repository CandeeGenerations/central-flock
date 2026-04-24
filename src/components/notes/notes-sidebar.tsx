import {ConfirmDialog} from '@/components/confirm-dialog'
import {MoveItemDialog} from '@/components/notes/move-item-dialog'
import {NewItemDialog} from '@/components/notes/new-item-dialog'
import {Button} from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {Input} from '@/components/ui/input'
import {useDebouncedValue} from '@/hooks/use-debounced-value'
import {
  type NoteTreeItem,
  buildNoteTree,
  createNoteItem,
  deleteNoteItems,
  duplicateNote,
  fetchNotesTree,
  filterNoteTree,
  moveNoteItem,
} from '@/lib/notes-api'
import {queryKeys} from '@/lib/query-keys'
import {cn} from '@/lib/utils'
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'
import {
  ChevronRight,
  Copy,
  FileText,
  Folder,
  FolderInput,
  FolderPlus,
  MoreHorizontal,
  NotebookText,
  Plus,
  Search,
  Trash2,
} from 'lucide-react'
import {useCallback, useEffect, useMemo, useState} from 'react'
import {useLocation, useNavigate} from 'react-router-dom'
import {toast} from 'sonner'

// ---------------------------------------------------------------------------
// SidebarItem — recursive tree node
// ---------------------------------------------------------------------------

interface SidebarItemProps {
  item: NoteTreeItem
  depth: number
  collapsedIds: Set<number>
  activeNoteId: number | null
  onToggleCollapse: (id: number) => void
  onNewNoteIn: (parentId: number) => void
  onDuplicate: (item: NoteTreeItem) => void
  onMove: (item: NoteTreeItem) => void
  onDelete: (item: NoteTreeItem) => void
}

function SidebarItem({
  item,
  depth,
  collapsedIds,
  activeNoteId,
  onToggleCollapse,
  onNewNoteIn,
  onDuplicate,
  onMove,
  onDelete,
}: SidebarItemProps) {
  const navigate = useNavigate()
  const isFolder = item.type === 'folder'
  const isExpanded = isFolder && !collapsedIds.has(item.id)
  const isActive = !isFolder && item.id === activeNoteId

  function handleClick() {
    if (isFolder) onToggleCollapse(item.id)
    else navigate(`/notes/note/${item.id}`)
  }

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        className={cn(
          'group flex items-center gap-1 rounded-md py-1 px-1 text-sm cursor-pointer select-none outline-none',
          'focus-visible:ring-2 focus-visible:ring-sidebar-ring',
          isActive
            ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
            : 'text-sidebar-foreground hover:bg-sidebar-accent/50',
        )}
        style={{paddingLeft: `${0.25 + depth * 1}rem`}}
        onClick={handleClick}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            handleClick()
          }
        }}
      >
        {/* Chevron / spacer */}
        {isFolder ? (
          <ChevronRight
            className={cn(
              'h-3.5 w-3.5 shrink-0 text-sidebar-foreground/50 transition-transform duration-150',
              isExpanded && 'rotate-90',
            )}
          />
        ) : (
          <span className="w-3.5 shrink-0" />
        )}

        {/* Icon: emoji (string) or default — guard against non-string values. */}
        {typeof item.icon === 'string' && item.icon ? (
          <span className="text-sm leading-none shrink-0">{item.icon}</span>
        ) : isFolder ? (
          <Folder className="h-3.5 w-3.5 shrink-0 text-sidebar-foreground/60" />
        ) : (
          <FileText className="h-3.5 w-3.5 shrink-0 text-sidebar-foreground/60" />
        )}

        {/* Title */}
        <span className="flex-1 truncate">{item.title}</span>

        {/* Child count */}
        {isFolder && !!item.subRows?.length && (
          <span className="text-[11px] text-sidebar-foreground/40 shrink-0 tabular-nums mr-0.5">
            {item.subRows.length}
          </span>
        )}

        {/* Actions — visible on hover */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5 opacity-0 group-hover:opacity-100 shrink-0"
              onClick={(e) => e.stopPropagation()}
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            {!isFolder && (
              <>
                <DropdownMenuItem onClick={() => navigate(`/notes/note/${item.id}`)}>Open</DropdownMenuItem>
              </>
            )}
            {isFolder && (
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation()
                  onNewNoteIn(item.id)
                }}
              >
                <Plus className="h-4 w-4 mr-2" />
                New note inside
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation()
                onDuplicate(item)
              }}
            >
              <Copy className="h-4 w-4 mr-2" />
              Duplicate
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation()
                onMove(item)
              }}
            >
              <FolderInput className="h-4 w-4 mr-2" />
              Move
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="focus:bg-destructive/10!"
              style={{color: 'var(--destructive)'}}
              onClick={(e) => {
                e.stopPropagation()
                onDelete(item)
              }}
            >
              <Trash2 className="h-4 w-4 mr-2" style={{stroke: 'var(--destructive)'}} />
              <span style={{color: 'var(--destructive)'}}>Delete</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Recursive children */}
      {isExpanded &&
        item.subRows?.map((child) => (
          <SidebarItem
            key={child.id}
            item={child}
            depth={depth + 1}
            collapsedIds={collapsedIds}
            activeNoteId={activeNoteId}
            onToggleCollapse={onToggleCollapse}
            onNewNoteIn={onNewNoteIn}
            onDuplicate={onDuplicate}
            onMove={onMove}
            onDelete={onDelete}
          />
        ))}
    </>
  )
}

// ---------------------------------------------------------------------------
// NotesSidebar — main sidebar component
// ---------------------------------------------------------------------------

export function NotesSidebar() {
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()

  // Derive active note id from the current URL
  const noteIdMatch = /^\/notes\/note\/(\d+)/.exec(location.pathname)
  const activeNoteId = noteIdMatch ? Number(noteIdMatch[1]) : null

  // Collapsed folder IDs — empty set = all expanded
  const [collapsedIds, setCollapsedIds] = useState<Set<number>>(() => {
    try {
      const saved = sessionStorage.getItem('notes:sidebar:collapsed')
      return saved ? new Set<number>(JSON.parse(saved) as number[]) : new Set()
    } catch {
      return new Set()
    }
  })

  function toggleCollapsed(id: number) {
    setCollapsedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      sessionStorage.setItem('notes:sidebar:collapsed', JSON.stringify([...next]))
      return next
    })
  }

  // Search
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search, 200)

  // New item dialog state
  const [newDialogOpen, setNewDialogOpen] = useState(false)
  const [newDialogKey, setNewDialogKey] = useState(0)
  const [newDialogDefaultType, setNewDialogDefaultType] = useState<'folder' | 'note'>('note')
  const [newDialogParentId, setNewDialogParentId] = useState<number | null>(null)

  // Move / delete targets
  const [moveTarget, setMoveTarget] = useState<NoteTreeItem | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<NoteTreeItem | null>(null)

  // Data
  const {data: flatItems} = useQuery({
    queryKey: queryKeys.notesTree,
    queryFn: fetchNotesTree,
  })

  const fullTree = useMemo(() => (flatItems ? buildNoteTree(flatItems) : []), [flatItems])
  const displayTree = useMemo(() => filterNoteTree(fullTree, debouncedSearch), [fullTree, debouncedSearch])

  // Open new dialog helper
  const openNewDialog = useCallback((type: 'folder' | 'note', parentId: number | null = null) => {
    setNewDialogDefaultType(type)
    setNewDialogParentId(parentId)
    setNewDialogKey((k) => k + 1)
    setNewDialogOpen(true)
  }, [])

  // Keyboard shortcuts: ⌘⇧N → new note, ⌘⇧F → new folder
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

  // Mutations
  const createMutation = useMutation({
    mutationFn: (data: {type: 'folder' | 'note'; title: string; parentId?: number | null}) => createNoteItem(data),
    onSuccess: (item) => {
      queryClient.invalidateQueries({queryKey: queryKeys.notesTree})
      setNewDialogOpen(false)
      if (item.type === 'note') navigate(`/notes/note/${item.id}`)
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed to create'),
  })

  const deleteMutation = useMutation({
    mutationFn: (ids: number[]) => deleteNoteItems(ids),
    onSuccess: (_, ids) => {
      queryClient.invalidateQueries({queryKey: queryKeys.notesTree})
      if (activeNoteId && ids.includes(activeNoteId)) navigate('/notes')
      setDeleteTarget(null)
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed to delete'),
  })

  const duplicateMutation = useMutation({
    mutationFn: (id: number) => duplicateNote(id),
    onSuccess: (item) => {
      queryClient.invalidateQueries({queryKey: queryKeys.notesTree})
      toast.success(`${item.type === 'folder' ? 'Folder' : 'Note'} duplicated`)
      if (item.type === 'note') navigate(`/notes/note/${item.id}`)
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

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 pt-3 pb-2 shrink-0">
        <div className="flex items-center gap-2">
          <NotebookText className="h-4 w-4 text-sidebar-foreground/60" />
          <span className="font-semibold text-sm tracking-tight">Notes</span>
        </div>
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent"
            title="New note (⌘⇧N)"
            onClick={() => openNewDialog('note')}
          >
            <Plus className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent"
            title="New folder (⌘⇧F)"
            onClick={() => openNewDialog('folder')}
          >
            <FolderPlus className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="px-2 pb-2 shrink-0">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-sidebar-foreground/40 pointer-events-none" />
          <Input
            placeholder="Search…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-7 pl-7 text-xs bg-sidebar-accent/30 border-sidebar-border placeholder:text-sidebar-foreground/40 focus-visible:ring-1"
          />
        </div>
      </div>

      {/* Tree */}
      <div className="flex-1 overflow-y-auto px-1.5 pb-3 space-y-0.5">
        {displayTree.length === 0 ? (
          <p className="text-xs text-sidebar-foreground/40 text-center py-8 px-3">
            {debouncedSearch ? 'No matches.' : 'No notes yet.\nUse + to create one.'}
          </p>
        ) : (
          displayTree.map((item) => (
            <SidebarItem
              key={item.id}
              item={item}
              depth={0}
              collapsedIds={collapsedIds}
              activeNoteId={activeNoteId}
              onToggleCollapse={toggleCollapsed}
              onNewNoteIn={(parentId) => openNewDialog('note', parentId)}
              onDuplicate={(i) => duplicateMutation.mutate(i.id)}
              onMove={setMoveTarget}
              onDelete={setDeleteTarget}
            />
          ))
        )}
      </div>

      {/* Dialogs */}
      <NewItemDialog
        key={newDialogKey}
        open={newDialogOpen}
        onOpenChange={setNewDialogOpen}
        defaultType={newDialogDefaultType}
        loading={createMutation.isPending}
        onConfirm={(type, title) => createMutation.mutate({type, title, parentId: newDialogParentId})}
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

      {deleteTarget && (
        <ConfirmDialog
          open={!!deleteTarget}
          onOpenChange={(open) => {
            if (!open) setDeleteTarget(null)
          }}
          title="Delete this item?"
          description={`Permanently delete "${deleteTarget.title}"${deleteTarget.type === 'folder' ? ' and all its contents' : ''}? This cannot be undone.`}
          confirmLabel="Delete"
          variant="destructive"
          loading={deleteMutation.isPending}
          onConfirm={() => deleteMutation.mutate([deleteTarget.id])}
        />
      )}
    </div>
  )
}
