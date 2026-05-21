import {Button} from '@/components/ui/button'
import {Checkbox} from '@/components/ui/checkbox'
import {Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle} from '@/components/ui/dialog'
import {Input} from '@/components/ui/input'
import {Label} from '@/components/ui/label'
import {useEffect, useMemo, useState} from 'react'

export interface ExportPdfRecipient {
  // Stable identity used as React key + selection key.
  key: string
  // Display name shown next to the checkbox.
  name: string
}

interface ExportSchedulePdfDialogProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  // Full set of scheduled recipients; user picks which to include.
  recipients: ExportPdfRecipient[]
  onConfirm: (opts: {unhighlightedCopies: number; selectedRecipientKeys: string[]}) => Promise<void> | void
  defaultUnhighlightedCopies?: number
}

export function ExportSchedulePdfDialog({
  open,
  onOpenChange,
  recipients,
  onConfirm,
  defaultUnhighlightedCopies = 3,
}: ExportSchedulePdfDialogProps) {
  const [copies, setCopies] = useState(defaultUnhighlightedCopies)
  const [selected, setSelected] = useState<Set<string>>(() => new Set(recipients.map((r) => r.key)))
  const [busy, setBusy] = useState(false)

  // When the modal opens (or the recipient list changes), reset selection
  // to "everyone." That way a user reopening for a reprint always sees a
  // fresh full list and can prune.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (open) {
      setSelected(new Set(recipients.map((r) => r.key)))
      setCopies(defaultUnhighlightedCopies)
    }
  }, [open, recipients, defaultUnhighlightedCopies])
  /* eslint-enable react-hooks/set-state-in-effect */

  const allSelected = selected.size === recipients.length && recipients.length > 0
  const noneSelected = selected.size === 0
  const total = Math.max(0, copies) + selected.size

  const sorted = useMemo(() => recipients.slice().sort((a, b) => a.name.localeCompare(b.name)), [recipients])

  function toggle(key: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  async function handleConfirm() {
    setBusy(true)
    try {
      await onConfirm({unhighlightedCopies: Math.max(0, copies), selectedRecipientKeys: [...selected]})
      onOpenChange(false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !busy && onOpenChange(v)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Export PDF</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="copies">Unhighlighted copies</Label>
            <Input
              id="copies"
              type="number"
              min={0}
              max={50}
              value={copies}
              onChange={(e) => setCopies(Number(e.target.value) || 0)}
            />
            <p className="text-muted-foreground text-xs">Master copies of the full schedule with no highlighting.</p>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>Highlighted pages (one per person/group)</Label>
              {recipients.length > 0 && (
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground text-xs underline-offset-2 hover:underline"
                  onClick={() => setSelected(allSelected ? new Set() : new Set(recipients.map((r) => r.key)))}
                >
                  {allSelected ? 'Clear all' : 'Select all'}
                </button>
              )}
            </div>
            {recipients.length === 0 ? (
              <p className="text-muted-foreground text-xs">Nothing scheduled yet.</p>
            ) : (
              <div className="bg-muted/30 max-h-56 space-y-1 overflow-auto rounded border p-2">
                {sorted.map((r) => (
                  <label
                    key={r.key}
                    className="hover:bg-muted/50 flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm"
                  >
                    <Checkbox checked={selected.has(r.key)} onCheckedChange={() => toggle(r.key)} />
                    <span className="truncate">{r.name}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="bg-muted/30 rounded border p-2 text-xs">
            Total pages: <strong>{total}</strong>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={busy || (total === 0 && !noneSelected)}>
            {busy ? 'Exporting…' : 'Export'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
