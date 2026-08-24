import {cn} from '@/lib/utils'
import {NavLink, Outlet} from 'react-router-dom'

// Sunday School holds three unrelated jobs — the defaults a first edition is
// seeded from, the per-year themes, and the 182-row Betty Lukens catalogue.
// Horizontal tabs inside the pane keep each to one job while the rail on the
// left still names the ministry.
const TABS = [
  {to: 'defaults', label: 'Defaults'},
  {to: 'themes', label: 'Yearly Themes'},
  {to: 'lessons', label: 'Lessons'},
]

export function SundaySchoolSettingsSection() {
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
