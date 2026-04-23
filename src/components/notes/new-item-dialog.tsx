import {Button} from '@/components/ui/button'
import {Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle} from '@/components/ui/dialog'
import {Input} from '@/components/ui/input'
import {Label} from '@/components/ui/label'
import {cn} from '@/lib/utils'
import {FileText, Folder} from 'lucide-react'
import {useEffect, useRef, useState} from 'react'

interface NewItemDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Pre-select a type when opening. Parent must increment `key` on each open for this to reset. */
  defaultType?: 'folder' | 'note'
  loading?: boolean
  onConfirm: (type: 'folder' | 'note', title: string) => void
}

export function NewItemDialog({
  open,
  onOpenChange,
  defaultType = 'note',
  loading = false,
  onConfirm,
}: NewItemDialogProps) {
  // Initialized from defaultType on mount. Parent controls resets by changing the `key` prop.
  const [type, setType] = useState<'folder' | 'note'>(defaultType)
  const [title, setTitle] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  // Focus input when dialog opens (external system — not setState, so useEffect is appropriate here)
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  function handleConfirm() {
    if (!title.trim()) return
    onConfirm(type, title.trim())
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>New {type === 'folder' ? 'Folder' : 'Note'}</DialogTitle>
        </DialogHeader>

        {/* Type selector */}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setType('folder')}
            className={cn(
              'flex-1 flex items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition-colors cursor-pointer',
              type === 'folder'
                ? 'border-primary bg-primary/5 text-primary'
                : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted/50',
            )}
          >
            <Folder className="h-4 w-4" />
            Folder
          </button>
          <button
            type="button"
            onClick={() => setType('note')}
            className={cn(
              'flex-1 flex items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition-colors cursor-pointer',
              type === 'note'
                ? 'border-primary bg-primary/5 text-primary'
                : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted/50',
            )}
          >
            <FileText className="h-4 w-4" />
            Note
          </button>
        </div>

        {/* Title */}
        <div className="space-y-1.5">
          <Label htmlFor="new-item-title">Title</Label>
          <Input
            id="new-item-title"
            ref={inputRef}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={type === 'folder' ? 'Folder name…' : 'Note title…'}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleConfirm()
            }}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={!title.trim() || loading}>
            {loading ? 'Creating…' : `Create ${type === 'folder' ? 'Folder' : 'Note'}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
