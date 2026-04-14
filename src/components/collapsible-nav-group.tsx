import {type NavGroup, isChildActive} from '@/lib/nav-config'
import {cn} from '@/lib/utils'
import {ChevronRight} from 'lucide-react'
import {Collapsible as CollapsiblePrimitive} from 'radix-ui'
import {useState} from 'react'
import {NavLink, useLocation} from 'react-router-dom'

interface CollapsibleNavGroupProps {
  group: NavGroup
  onNavClick?: () => void
}

const navLinkClass = ({isActive}: {isActive: boolean}) =>
  cn(
    'flex items-center gap-3 px-3 py-3 md:py-2 rounded-md text-base md:text-sm font-medium transition-colors cursor-pointer',
    isActive
      ? 'bg-sidebar-accent text-sidebar-accent-foreground border border-border shadow-sm dark:border-transparent dark:shadow-none'
      : 'hover:bg-sidebar-accent/50 border border-transparent hover:border-border hover:shadow-sm dark:hover:border-transparent dark:hover:shadow-none',
  )

export function CollapsibleNavGroup({group, onNavClick}: CollapsibleNavGroupProps) {
  const location = useLocation()
  const hasActiveChild = group.children.some((child) => isChildActive(child.to, location.pathname, group.children))
  const [open, setOpen] = useState(false)
  const isOpen = hasActiveChild || open

  // Single-child groups render as a direct link — no dropdown needed
  if (group.children.length === 1) {
    const child = group.children[0]
    return (
      <NavLink to={child.to} onClick={onNavClick} end={child.end} className={navLinkClass}>
        <group.icon className="h-5 w-5 md:h-4 md:w-4 shrink-0" />
        <span className="flex-1">{group.label}</span>
      </NavLink>
    )
  }

  return (
    <CollapsiblePrimitive.Root open={isOpen} onOpenChange={setOpen}>
      <CollapsiblePrimitive.Trigger asChild>
        <button
          className={cn(
            'flex items-center gap-3 px-3 py-3 md:py-2 rounded-md text-base md:text-sm font-medium transition-colors cursor-pointer w-full',
            'hover:bg-sidebar-accent/50 border border-transparent hover:border-border hover:shadow-sm dark:hover:border-transparent dark:hover:shadow-none',
          )}
        >
          <group.icon className="h-5 w-5 md:h-4 md:w-4 shrink-0" />
          <span className="flex-1 text-left">{group.label}</span>
          <ChevronRight className={cn('h-4 w-4 shrink-0 transition-transform duration-200', isOpen && 'rotate-90')} />
        </button>
      </CollapsiblePrimitive.Trigger>
      <CollapsiblePrimitive.Content className="overflow-hidden data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up">
        <div className="pl-4 space-y-1 mt-1">
          {group.children.map((child) => {
            const active = isChildActive(child.to, location.pathname, group.children)
            return (
              <NavLink
                key={child.to}
                to={child.to}
                onClick={onNavClick}
                className={() => navLinkClass({isActive: active})}
              >
                <child.icon className="h-5 w-5 md:h-4 md:w-4" />
                <span className="flex-1">{child.label}</span>
              </NavLink>
            )
          })}
        </div>
      </CollapsiblePrimitive.Content>
    </CollapsiblePrimitive.Root>
  )
}
