import {cn} from '@/lib/utils'
import {NavLink, Outlet} from 'react-router-dom'

// Nursery settings carry two unrelated jobs — the print defaults plus service
// worker counts, and the worker roster itself. Horizontal tabs inside the pane
// keep each to one job, mirroring Workers’ Notes.
const TABS = [
  {to: 'defaults', label: 'Defaults'},
  {to: 'workers', label: 'Workers'},
]

export function NurserySettingsSection() {
  return (
    <div className="space-y-4">
      <div className="flex gap-1 border-b">
        {TABS.map(({to, label}) => (
          <NavLink
            key={to}
            to={to}
            className={({isActive}) =>
              cn(
                '-mb-px border-b-2 px-3 py-2 text-sm transition-colors',
                isActive
                  ? 'border-foreground font-medium'
                  : 'text-muted-foreground hover:text-foreground border-transparent',
              )
            }
          >
            {label}
          </NavLink>
        ))}
      </div>
      <Outlet />
    </div>
  )
}
