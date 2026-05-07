import {type NavGroup, isChildActive} from '@/lib/nav-config'
import {cn} from '@/lib/utils'
import {ChevronRight} from 'lucide-react'
import {Collapsible as CollapsiblePrimitive, Popover as PopoverPrimitive} from 'radix-ui'
import {createContext, useContext, useEffect, useRef, useState} from 'react'
import type {ReactNode} from 'react'
import {NavLink, useLocation} from 'react-router-dom'

interface CollapsibleNavGroupProps {
  group: NavGroup
  onNavClick?: () => void
  collapsed?: boolean
}

type NavPopoverCtx = {
  openId: string | null
  requestOpen: (id: string) => void
  scheduleClose: () => void
  cancelClose: () => void
}

const NavPopoverContext = createContext<NavPopoverCtx | null>(null)

export function NavPopoverProvider({children}: {children: ReactNode}) {
  const [openId, setOpenId] = useState<string | null>(null)
  const closeTimer = useRef<number | null>(null)

  const cancelClose = () => {
    if (closeTimer.current !== null) {
      window.clearTimeout(closeTimer.current)
      closeTimer.current = null
    }
  }
  const requestOpen = (id: string) => {
    cancelClose()
    setOpenId(id)
  }
  const scheduleClose = () => {
    cancelClose()
    closeTimer.current = window.setTimeout(() => setOpenId(null), 120)
  }

  useEffect(() => () => cancelClose(), [])

  return (
    <NavPopoverContext.Provider value={{openId, requestOpen, scheduleClose, cancelClose}}>
      {children}
    </NavPopoverContext.Provider>
  )
}

const navLinkClass = ({isActive}: {isActive: boolean}) =>
  cn(
    'flex items-center gap-3 px-3 py-3 md:py-2 rounded-md text-base md:text-sm font-medium transition-colors cursor-pointer',
    isActive
      ? 'bg-sidebar-accent text-sidebar-accent-foreground border border-border shadow-sm dark:border-transparent dark:shadow-none'
      : 'hover:bg-sidebar-accent/50 border border-transparent hover:border-border hover:shadow-sm dark:hover:border-transparent dark:hover:shadow-none',
  )

export function CollapsibleNavGroup({group, onNavClick, collapsed}: CollapsibleNavGroupProps) {
  const location = useLocation()
  const hasActiveChild = group.children.some((child) => isChildActive(child, location.pathname, group.children))
  const popoverCtx = useContext(NavPopoverContext)
  const [localOpen, setLocalOpen] = useState(false)
  const popoverOpen = popoverCtx ? popoverCtx.openId === group.id : localOpen
  const setPopoverOpen = (next: boolean) => {
    if (popoverCtx) {
      if (next) popoverCtx.requestOpen(group.id)
      else popoverCtx.scheduleClose()
    } else {
      setLocalOpen(next)
    }
  }
  const cancelClose = () => popoverCtx?.cancelClose()
  const isOpen = hasActiveChild || localOpen

  if (collapsed) {
    return (
      <PopoverPrimitive.Root open={popoverOpen} onOpenChange={setPopoverOpen}>
        <PopoverPrimitive.Trigger asChild>
          <button
            type="button"
            onMouseEnter={() => setPopoverOpen(true)}
            onMouseLeave={() => setPopoverOpen(false)}
            className={cn(
              'flex items-center justify-center h-10 w-10 mx-auto rounded-md transition-colors cursor-pointer',
              hasActiveChild
                ? 'bg-sidebar-accent text-sidebar-accent-foreground border border-border shadow-sm dark:border-transparent dark:shadow-none'
                : 'hover:bg-sidebar-accent/50 border border-transparent hover:border-border hover:shadow-sm dark:hover:border-transparent dark:hover:shadow-none',
            )}
          >
            <group.icon className="h-5 w-5" />
          </button>
        </PopoverPrimitive.Trigger>
        <PopoverPrimitive.Portal>
          <PopoverPrimitive.Content
            side="right"
            sideOffset={8}
            align="start"
            onOpenAutoFocus={(e) => e.preventDefault()}
            onMouseEnter={cancelClose}
            onMouseLeave={() => setPopoverOpen(false)}
            className="z-50 min-w-[200px] rounded-xl border border-border bg-popover p-2 text-popover-foreground shadow-lg ring-1 ring-foreground/5 dark:ring-foreground/10 data-[side=right]:slide-in-from-left-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95"
          >
            <div className="px-2 py-1 text-xs font-semibold text-muted-foreground">{group.label}</div>
            <div className="space-y-0.5">
              {group.children.map((child) => {
                const active = isChildActive(child, location.pathname, group.children)
                return (
                  <NavLink
                    key={child.to}
                    to={child.to}
                    onClick={() => {
                      setPopoverOpen(false)
                      onNavClick?.()
                    }}
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
          </PopoverPrimitive.Content>
        </PopoverPrimitive.Portal>
      </PopoverPrimitive.Root>
    )
  }

  return (
    <CollapsiblePrimitive.Root open={isOpen} onOpenChange={setLocalOpen}>
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
            const active = isChildActive(child, location.pathname, group.children)
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
