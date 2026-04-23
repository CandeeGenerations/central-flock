import type {Breadcrumb} from '@/lib/notes-api'
import {ChevronRight} from 'lucide-react'
import {Link} from 'react-router-dom'

interface NotesBreadcrumbsProps {
  crumbs: Breadcrumb[]
  /** When true, the last crumb is plain text (not a link). Defaults to true. */
  lastIsText?: boolean
}

export function NotesBreadcrumbs({crumbs, lastIsText = true}: NotesBreadcrumbsProps) {
  if (crumbs.length === 0) return null

  return (
    <nav aria-label="breadcrumb" className="flex items-center gap-1 text-sm text-muted-foreground flex-wrap">
      <Link to="/notes" className="hover:text-foreground transition-colors">
        Notes
      </Link>
      {crumbs.map((crumb, i) => {
        const isLast = i === crumbs.length - 1
        const href = crumb.type === 'folder' ? `/notes` : `/notes/note/${crumb.id}`
        return (
          <span key={crumb.id} className="flex items-center gap-1">
            <ChevronRight className="h-3 w-3 shrink-0" />
            {isLast && lastIsText ? (
              <span className="text-foreground font-medium">{crumb.title}</span>
            ) : (
              <Link to={href} className="hover:text-foreground transition-colors">
                {crumb.title}
              </Link>
            )}
          </span>
        )
      })}
    </nav>
  )
}
