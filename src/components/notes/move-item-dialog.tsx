import {Button} from '@/components/ui/button'
import {Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle} from '@/components/ui/dialog'
import {type NoteTreeItem} from '@/lib/notes-api'
import {cn} from '@/lib/utils'
import {Folder, Home} from 'lucide-react'
import {useMemo, useState} from 'react'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type FolderOption = {id: number; label: string; depth: number}

/** Walk the tree and collect all folders, excluding the moved item and its subtree. */
function buildFolderOptions(items: NoteTreeItem[], excludeId: number, depth = 0): FolderOption[] {
  const opts: FolderOption[] = []
  for (const item of items) {
    if (item.id === excludeId) continue // skip item + all its descendants
    if (item.type === 'folder') {
      opts.push({id: item.id, label: item.title, depth})
      if (item.subRows?.length) {
        opts.push(...buildFolderOptions(item.subRows, excludeId, depth + 1))
      }
    }
  }
  return opts
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface MoveItemDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The item being moved. Parent passes key={item.id} so state resets on each open. */
  item: NoteTreeItem
  /** Full nested tree used to build the destination list. */
  tree: NoteTreeItem[]
  loading?: boolean
  onConfirm: (parentId: number | null) => void
}

export function MoveItemDialog({open, onOpenChange, item, tree, loading = false, onConfirm}: MoveItemDialogProps) {
  // Init to current parent so user sees where the item lives now
  const [selectedParentId, setSelectedParentId] = useState<number | null>(item.parentId)

  const folderOptions = useMemo(() => buildFolderOptions(tree, item.id), [tree, item.id])

  const isSameLocation = selectedParentId === item.parentId

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="truncate">Move &ldquo;{item.title}&rdquo;</DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground -mt-1">Select a destination folder.</p>

        {/* Destination list */}
        <div className="max-h-64 overflow-y-auto rounded-md border p-1 space-y-0.5">
          {/* Root option */}
          <button
            type="button"
            className={cn(
              'flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm text-left transition-colors',
              selectedParentId === null
                ? 'bg-accent text-accent-foreground font-medium'
                : 'hover:bg-muted text-foreground',
            )}
            onClick={() => setSelectedParentId(null)}
          >
            <Home className="h-4 w-4 shrink-0 text-muted-foreground" />
            Root
          </button>

          {folderOptions.length === 0 && (
            <p className="px-2 py-1.5 text-sm text-muted-foreground italic">No other folders available.</p>
          )}

          {folderOptions.map((opt) => (
            <button
              key={opt.id}
              type="button"
              className={cn(
                'flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm text-left transition-colors',
                selectedParentId === opt.id
                  ? 'bg-accent text-accent-foreground font-medium'
                  : 'hover:bg-muted text-foreground',
              )}
              style={{paddingLeft: `${0.5 + opt.depth * 1.25}rem`}}
              onClick={() => setSelectedParentId(opt.id)}
            >
              <Folder className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="truncate">{opt.label}</span>
            </button>
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={() => onConfirm(selectedParentId)} disabled={isSameLocation || loading}>
            {loading ? 'Moving…' : 'Move here'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
