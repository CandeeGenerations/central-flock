import {Button} from '@/components/ui/button'
import {DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger} from '@/components/ui/dropdown-menu'
import {MoreHorizontal} from 'lucide-react'
import type {ComponentType, ReactNode} from 'react'
import {Link} from 'react-router-dom'

export interface HeaderAction {
  label: string
  icon: ComponentType<{className?: string}>
  onClick?: () => void
  to?: string
  disabled?: boolean
}

/**
 * A list page's title row. On a phone the secondary actions fold into a ⋯ menu so
 * the row never runs off screen; from sm up they sit inline before the primary.
 */
export function PageHeader({
  title,
  primary,
  secondary = [],
}: {
  title: ReactNode
  primary?: HeaderAction
  secondary?: HeaderAction[]
}) {
  return (
    <div className="flex items-center gap-2">
      <h2 className="min-w-0 flex-1 truncate text-2xl font-bold">{title}</h2>
      {secondary.map((a) => (
        <HeaderButton key={a.label} action={a} variant="outline" className="hidden sm:inline-flex" />
      ))}
      {secondary.length ? <OverflowMenu actions={secondary} className="sm:hidden" /> : null}
      {primary ? <HeaderButton action={primary} className="shrink-0" /> : null}
    </div>
  )
}

function HeaderButton({
  action: a,
  variant = 'default',
  className,
}: {
  action: HeaderAction
  variant?: 'default' | 'outline'
  className?: string
}) {
  const body = (
    <>
      <a.icon className="mr-2 h-4 w-4" />
      {a.label}
    </>
  )
  return a.to ? (
    <Button variant={variant} className={className} disabled={a.disabled} asChild>
      <Link to={a.to}>{body}</Link>
    </Button>
  ) : (
    <Button variant={variant} className={className} disabled={a.disabled} onClick={a.onClick}>
      {body}
    </Button>
  )
}

/** A ⋯ button holding actions that don't fit inline. */
export function OverflowMenu({
  actions,
  className,
  size = 'icon',
}: {
  actions: HeaderAction[]
  className?: string
  size?: 'icon' | 'icon-sm'
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size={size} aria-label="More actions" className={className}>
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {actions.map((a) =>
          a.to ? (
            <DropdownMenuItem key={a.label} disabled={a.disabled} asChild>
              <Link to={a.to}>
                <a.icon className="mr-2 h-4 w-4" />
                {a.label}
              </Link>
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem key={a.label} disabled={a.disabled} onSelect={a.onClick}>
              <a.icon className="mr-2 h-4 w-4" />
              {a.label}
            </DropdownMenuItem>
          ),
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
