import {Tooltip, TooltipContent, TooltipTrigger} from '@/components/ui/tooltip'
import {type NavGroup, isChildActive} from '@/lib/nav-config'
import {cn} from '@/lib/utils'
import {ChevronRight} from 'lucide-react'
import {Collapsible as CollapsiblePrimitive, HoverCard as HoverCardPrimitive} from 'radix-ui'
import {useState} from 'react'
import {NavLink, useLocation, useNavigate} from 'react-router-dom'

interface CollapsibleNavGroupProps {
  group: NavGroup
  onNavClick?: () => void
  collapsed?: boolean
}

const navLinkClass = ({isActive}: {isActive: boolean}) =>
  cn(
    'flex items-center gap-3 px-3 py-3 md:py-2 rounded-md text-base md:text-sm font-medium transition-colors cursor-pointer',
    isActive
      ? 'bg-sidebar-accent text-sidebar-accent-foreground border border-border shadow-sm dark:border-transparent dark:shadow-none'
      : 'hover:bg-sidebar-accent/50 border border-transparent hover:border-border hover:shadow-sm dark:hover:border-transparent dark:hover:shadow-none',
  )

const collapsedIconClass = ({isActive}: {isActive: boolean}) =>
  cn(
    'flex items-center justify-center h-10 w-10 mx-auto rounded-md transition-colors cursor-pointer',
    isActive
      ? 'bg-sidebar-accent text-sidebar-accent-foreground border border-border shadow-sm dark:border-transparent dark:shadow-none'
      : 'hover:bg-sidebar-accent/50 border border-transparent hover:border-border hover:shadow-sm dark:hover:border-transparent dark:hover:shadow-none',
  )

export function CollapsibleNavGroup({group, onNavClick, collapsed}: CollapsibleNavGroupProps) {
  const location = useLocation()
  const navigate = useNavigate()
  const hasActiveChild = group.children.some((child) => isChildActive(child.to, location.pathname, group.children))
  const [open, setOpen] = useState(false)
  const isOpen = hasActiveChild || open

  if (collapsed) {
    if (group.children.length === 1) {
      const child = group.children[0]
      const active = isChildActive(child.to, location.pathname, group.children)
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => {
                navigate(child.to)
                onNavClick?.()
              }}
              className={collapsedIconClass({isActive: active})}
            >
              <group.icon className="h-5 w-5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">{group.label}</TooltipContent>
        </Tooltip>
      )
    }

    return (
      <HoverCardPrimitive.Root openDelay={80} closeDelay={100}>
        <HoverCardPrimitive.Trigger asChild>
          <button
            type="button"
            className={cn(
              'flex items-center justify-center h-10 w-10 mx-auto rounded-md transition-colors cursor-pointer',
              hasActiveChild
                ? 'bg-sidebar-accent text-sidebar-accent-foreground border border-border shadow-sm dark:border-transparent dark:shadow-none'
                : 'hover:bg-sidebar-accent/50 border border-transparent hover:border-border hover:shadow-sm dark:hover:border-transparent dark:hover:shadow-none',
            )}
          >
            <group.icon className="h-5 w-5" />
          </button>
        </HoverCardPrimitive.Trigger>
        <HoverCardPrimitive.Portal>
          <HoverCardPrimitive.Content
            side="right"
            sideOffset={8}
            className="z-50 min-w-[200px] rounded-xl border border-border bg-popover p-2 text-popover-foreground shadow-lg ring-1 ring-foreground/5 dark:ring-foreground/10 data-[side=right]:slide-in-from-left-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95"
          >
            <div className="px-2 py-1 text-xs font-semibold text-muted-foreground">{group.label}</div>
            <div className="space-y-0.5">
              {group.children.map((child) => {
                const active = isChildActive(child.to, location.pathname, group.children)
                return (
                  <NavLink
                    key={child.to}
                    to={child.to}
                    onClick={onNavClick}
                    end={child.end}
                    className={() =>
                      cn(
                        'flex items-center gap-2 px-2 py-1.5 rounded-md text-sm font-medium transition-colors cursor-pointer',
                        active ? 'bg-sidebar-accent text-sidebar-accent-foreground' : 'hover:bg-sidebar-accent/50',
                      )
                    }
                  >
                    <child.icon className="h-4 w-4 shrink-0" />
                    <span>{child.label}</span>
                  </NavLink>
                )
              })}
            </div>
          </HoverCardPrimitive.Content>
        </HoverCardPrimitive.Portal>
      </HoverCardPrimitive.Root>
    )
  }

  // Single-child groups render as a direct button — no dropdown needed
  if (group.children.length === 1) {
    const child = group.children[0]
    const active = isChildActive(child.to, location.pathname, group.children)
    return (
      <button
        type="button"
        onClick={() => {
          navigate(child.to)
          onNavClick?.()
        }}
        className={cn(navLinkClass({isActive: active}), 'w-full')}
      >
        <group.icon className="h-5 w-5 md:h-4 md:w-4 shrink-0" />
        <span className="flex-1 text-left">{group.label}</span>
      </button>
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
      <CollapsiblePrimitive.Content>
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
