import {
  type DraftItem,
  ScheduleItemsEditor,
  draftToInput,
  itemsToDraft,
} from '@/components/calendar-print/schedule-items-editor'
import {SchedulePreview} from '@/components/calendar-print/schedule-preview'
import {Button} from '@/components/ui/button'
import {Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle} from '@/components/ui/dialog'
import type {NormalScheduleItem, NormalScheduleItemInput} from '@/lib/api'
import {useState} from 'react'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  initialItems: NormalScheduleItem[]
  isSaving: boolean
  onSave: (items: NormalScheduleItemInput[]) => void
  // Per-month override extras (optional)
  showRevert?: boolean
  onRevert?: () => void
}

export function ScheduleEditorDialog({
  open,
  onOpenChange,
  title,
  initialItems,
  isSaving,
  onSave,
  showRevert,
  onRevert,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!max-w-[min(96vw,1100px)] sm:!max-w-[min(96vw,1100px)]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {open && (
          <ScheduleEditorBody
            initialItems={initialItems}
            isSaving={isSaving}
            onSave={onSave}
            onCancel={() => onOpenChange(false)}
            showRevert={showRevert}
            onRevert={onRevert}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function ScheduleEditorBody({
  initialItems,
  isSaving,
  onSave,
  onCancel,
  showRevert,
  onRevert,
}: {
  initialItems: NormalScheduleItem[]
  isSaving: boolean
  onSave: (items: NormalScheduleItemInput[]) => void
  onCancel: () => void
  showRevert?: boolean
  onRevert?: () => void
}) {
  const [draft, setDraft] = useState<DraftItem[]>(() => itemsToDraft(initialItems))
  return (
    <>
      <div className="grid lg:grid-cols-[1fr_360px] gap-4">
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Add / reorder / remove schedule items. Use <code>**text**</code> inside a line for inline bold (e.g. just
            the time). The <code>B</code> checkbox bolds the whole line.
          </p>
          <ScheduleItemsEditor items={draft} onChange={setDraft} />
        </div>
        <div className="space-y-2">
          <div className="text-xs text-muted-foreground">Footer preview</div>
          <SchedulePreview items={draft} />
        </div>
      </div>
      <DialogFooter className="gap-2">
        {showRevert && (
          <Button variant="outline" onClick={onRevert} disabled={isSaving}>
            Revert to default
          </Button>
        )}
        <Button variant="outline" onClick={onCancel} disabled={isSaving}>
          Cancel
        </Button>
        <Button onClick={() => onSave(draftToInput(draft))} disabled={isSaving}>
          Save
        </Button>
      </DialogFooter>
    </>
  )
}
