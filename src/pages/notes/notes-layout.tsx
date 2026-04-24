import {NotesSidebar} from '@/components/notes/notes-sidebar'
import {Outlet} from 'react-router-dom'

/**
 * Two-pane notes layout: fixed-width tree sidebar on the left, note content on the right.
 * `h-full overflow-hidden` ensures the panes scroll independently rather than the outer
 * `main` element scrolling the entire page as one unit.
 */
export function NotesLayout() {
  return (
    <div className="flex h-full overflow-hidden">
      {/* Left — tree sidebar */}
      <aside className="w-64 shrink-0 border-r border-sidebar-border bg-sidebar text-sidebar-foreground flex flex-col overflow-hidden">
        <NotesSidebar />
      </aside>

      {/* Right — routed content */}
      <div className="flex-1 overflow-auto min-w-0">
        <Outlet />
      </div>
    </div>
  )
}
