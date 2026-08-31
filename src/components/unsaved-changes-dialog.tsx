import {Button} from '@/components/ui/button'
import {Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle} from '@/components/ui/dialog'
import {useState} from 'react'
import type {Blocker} from 'react-router-dom'

/**
 * The dialog for a page held by useUnsavedChanges. Saving is the default and
 * the loud button — losing the work is the failure this exists to prevent —
 * with leaving anyway kept as a plain outline next to it.
 */
export function UnsavedChangesDialog({
  blocker,
  onSave,
  what = 'changes',
}: {
  blocker: Blocker
  /** Runs the page's save; the navigation goes through once it resolves. */
  onSave?: () => Promise<unknown>
  /** What is unsaved, in the page's own words — "your edits to this service". */
  what?: string
}) {
  const [saving, setSaving] = useState(false)
  if (blocker.state !== 'blocked') return null

  const saveAndLeave = async () => {
    setSaving(true)
    try {
      await onSave?.()
      blocker.proceed()
    } catch {
      // The page's own mutation already toasted the failure. Stay put: leaving
      // now is exactly the loss this dialog is here to stop.
      setSaving(false)
      blocker.reset()
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && blocker.reset()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Unsaved changes</DialogTitle>
          <DialogDescription>Leaving this page now discards {what}.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => blocker.reset()} disabled={saving}>
            Stay
          </Button>
          <Button variant="outline" onClick={() => blocker.proceed()} disabled={saving}>
            Leave without saving
          </Button>
          {onSave ? (
            <Button onClick={saveAndLeave} disabled={saving}>
              {saving ? 'Saving…' : 'Save and leave'}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
