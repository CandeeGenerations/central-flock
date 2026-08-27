import {cn} from '@/lib/utils'
import {Clock, Contact, GraduationCap, Megaphone, Settings} from 'lucide-react'
import {NavLink, Outlet} from 'react-router-dom'

// Mirrors Schedule Settings: a left rail of routed sections, so each pane is a
// URL and the command palette can offer "Attendance Settings → Recorders"
// directly. Sections with more than one job add their own top tabs.
const SECTIONS = [
  {to: 'times', label: 'Service Times', icon: Clock},
  {to: 'recorders', label: 'Recorders', icon: Contact},
  {to: 'departments', label: 'Departments', icon: GraduationCap},
  {to: 'households', label: 'Households', icon: Megaphone},
]

export function AttendanceSettingsLayout() {
  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="mb-6 flex items-center gap-3">
        <Settings className="h-6 w-6" />
        <h2 className="text-2xl font-bold">Ministry Stats Settings</h2>
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
