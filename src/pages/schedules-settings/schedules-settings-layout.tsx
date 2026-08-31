import {cn} from '@/lib/utils'
import {Baby, ClipboardList, GraduationCap, ListMusic, Music, Settings, Tent} from 'lucide-react'
import {NavLink, Outlet} from 'react-router-dom'

// A left rail of routed sections. Each pane is a URL, so sections are
// deep-linkable and the back button walks them — which also lets the command
// palette offer "Settings → Sunday School" directly.
const SECTIONS = [
  {to: 'general', label: 'General', icon: Settings},
  {to: 'nursery', label: 'Nursery', icon: Baby},
  {to: 'special-music', label: 'Special Music', icon: Music},
  {to: 'fair-booth', label: 'Fair Booth', icon: Tent},
  {to: 'music', label: 'Music Schedule', icon: ListMusic},
  {to: 'sunday-school', label: 'Workers’ Notes', icon: GraduationCap},
  {to: 'sunday-school-roll', label: 'Sunday School Roll', icon: ClipboardList},
]

export function SchedulesSettingsLayout() {
  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="mb-6 flex items-center gap-3">
        <Settings className="h-6 w-6" />
        <h2 className="text-2xl font-bold">Schedule Settings</h2>
      </div>

      <div className="flex flex-col gap-6 lg:flex-row">
        <nav className="flex shrink-0 gap-1 overflow-x-auto lg:w-52 lg:flex-col lg:overflow-visible">
          {SECTIONS.map(({to, label, icon: Icon}) => (
            <NavLink
              key={to}
              to={to}
              className={({isActive}) =>
                cn(
                  'flex items-center gap-2 rounded-md px-3 py-2 text-sm whitespace-nowrap transition-colors',
                  isActive ? 'bg-muted font-medium' : 'text-muted-foreground hover:bg-muted/50',
                )
              }
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="min-w-0 flex-1">
          <Outlet />
        </div>
      </div>
    </div>
  )
}
