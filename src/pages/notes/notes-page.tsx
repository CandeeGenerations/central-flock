import {NotebookText} from 'lucide-react'

/** Shown in the right pane when no note is selected. */
export function NotesPage() {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[60vh] text-center p-8 select-none">
      <NotebookText className="h-10 w-10 text-muted-foreground/25 mb-4" />
      <h3 className="text-base font-medium text-muted-foreground">No note selected</h3>
      <p className="text-sm text-muted-foreground/60 mt-1">
        Pick a note from the sidebar, or press{' '}
        <kbd className="rounded border border-border px-1 py-0.5 text-xs font-mono">⌘⇧N</kbd> to create one.
      </p>
    </div>
  )
}
