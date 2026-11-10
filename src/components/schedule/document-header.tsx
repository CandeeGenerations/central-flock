import {type HeaderAction, OverflowMenu} from '@/components/page-header'
import {Badge} from '@/components/ui/badge'
import {Button} from '@/components/ui/button'
import {DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger} from '@/components/ui/dropdown-menu'
import {Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle} from '@/components/ui/sheet'
import {ArrowLeft, ChevronDown, Download, Lock, LockOpen, Settings2} from 'lucide-react'
import {type ReactNode, useState} from 'react'

export interface DownloadOption {
  label: string
  onSelect: () => void
}

/**
 * The heading row every printed document shares: back, title, Draft/Final badge,
 * then page-specific actions, one Download menu, Finalize/Reopen and Settings.
 * Draft is editable and Final is locked, so there is no separate edit toggle.
 */
export function DocumentHeader({
  onBack,
  title,
  status,
  onFinalize,
  onReopen,
  statusPending,
  downloads,
  exporting,
  downloadDisabledReason,
  actions,
  settings,
  settingsDescription,
}: {
  onBack: () => void
  title: ReactNode
  status: 'draft' | 'final'
  onFinalize: () => void
  onReopen: () => void
  statusPending?: boolean
  downloads: DownloadOption[]
  exporting?: boolean
  /** When set, the Download menu is disabled and this is its tooltip. */
  downloadDisabledReason?: string
  /** Page-specific buttons, shown before Download. */
  actions?: ReactNode
  /** Body of the Settings slide-over; it receives a close function. Omit for no Settings button. */
  settings?: (close: () => void) => ReactNode
  settingsDescription?: ReactNode
}) {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const isFinal = status === 'final'
  const statusAction: HeaderAction = {
    label: isFinal ? 'Reopen' : 'Finalize',
    icon: isFinal ? LockOpen : Lock,
    onClick: isFinal ? onReopen : onFinalize,
    disabled: statusPending,
  }
  // On a phone, Finalize/Reopen and Settings fold into a ⋯ menu so the row fits.
  const folded: HeaderAction[] = [
    statusAction,
    ...(settings ? [{label: 'Settings', icon: Settings2, onClick: () => setSettingsOpen(true)}] : []),
  ]

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex min-w-0 flex-1 basis-64 items-center gap-2">
        <Button variant="ghost" size="icon" className="shrink-0" aria-label="Back" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h2 className="min-w-0 truncate text-2xl font-bold">{title}</h2>
        <Badge className="shrink-0" variant={isFinal ? 'default' : 'secondary'}>
          {isFinal ? 'Final' : 'Draft'}
        </Badge>
      </div>

      <div className="ml-auto flex flex-wrap items-center gap-2">
        {actions}
        {downloads.length ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" disabled={exporting || !!downloadDisabledReason} title={downloadDisabledReason}>
                <Download className="mr-1 h-4 w-4" />
                {exporting ? 'Exporting…' : 'Download'}
                <ChevronDown className="ml-1 h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {downloads.map((d) => (
                <DropdownMenuItem key={d.label} onSelect={d.onSelect}>
                  {d.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
        <OverflowMenu actions={folded} size="icon-sm" className="sm:hidden" />
        <Button
          size="sm"
          variant="outline"
          className="hidden sm:inline-flex"
          disabled={statusPending}
          onClick={isFinal ? onReopen : onFinalize}
        >
          {isFinal ? <LockOpen className="mr-1 h-4 w-4" /> : <Lock className="mr-1 h-4 w-4" />}
          {isFinal ? 'Reopen' : 'Finalize'}
        </Button>
        {settings ? (
          <>
            <Button size="sm" variant="outline" className="hidden sm:inline-flex" onClick={() => setSettingsOpen(true)}>
              <Settings2 className="mr-1 h-4 w-4" />
              Settings
            </Button>
            <Sheet open={settingsOpen} onOpenChange={setSettingsOpen}>
              <SheetContent side="right" className="overflow-y-auto data-[side=right]:sm:max-w-md">
                <SheetHeader>
                  <SheetTitle>Settings</SheetTitle>
                  <SheetDescription>{settingsDescription ?? title}</SheetDescription>
                </SheetHeader>
                <div className="space-y-6 px-6 pb-6">{settings(() => setSettingsOpen(false))}</div>
              </SheetContent>
            </Sheet>
          </>
        ) : null}
      </div>
    </div>
  )
}

/** A full-width action row inside the Settings slide-over. */
export function SettingsAction({
  icon,
  children,
  onClick,
  destructive,
  disabled,
}: {
  icon: ReactNode
  children: ReactNode
  onClick: () => void
  destructive?: boolean
  disabled?: boolean
}) {
  return (
    <Button
      variant="outline"
      disabled={disabled}
      className={`w-full justify-start pointer-coarse:h-10 ${destructive ? 'text-destructive' : ''}`}
      onClick={onClick}
    >
      <span className="mr-2 [&_svg]:h-4 [&_svg]:w-4">{icon}</span>
      {children}
    </Button>
  )
}
