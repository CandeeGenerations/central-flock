import {CollapsibleNavGroup} from '@/components/collapsible-nav-group'
import {CommandPaletteProvider} from '@/components/command-palette-provider'
import {Toaster} from '@/components/ui/sonner'
import {Spinner} from '@/components/ui/spinner'
import {Tooltip, TooltipContent, TooltipProvider, TooltipTrigger} from '@/components/ui/tooltip'
import {useCommandPalette} from '@/hooks/use-command-palette'
import {useKeyboardShortcuts} from '@/hooks/use-keyboard-shortcuts'
import {useSidebarCollapsed} from '@/hooks/use-sidebar-collapsed'
import {checkAuthStatus, logout} from '@/lib/api'
import {findActiveGroup, isChildActive, navGroups} from '@/lib/nav-config'
import {ThemeProvider, useTheme} from '@/lib/theme-context'
import {cn} from '@/lib/utils'
import {CalendarPage} from '@/pages/calendar-page'
import {ContactsImportPage} from '@/pages/contacts-import-page'
import {DashboardPage} from '@/pages/dashboard-page'
import {DevotionAuditPage} from '@/pages/devotions/devotion-audit-page'
import {DevotionDetailPage} from '@/pages/devotions/devotion-detail-page'
import {DevotionListPage} from '@/pages/devotions/devotion-list-page'
import {DevotionMissingPage} from '@/pages/devotions/devotion-missing-page'
import {DevotionPassageDetailPage} from '@/pages/devotions/devotion-passage-detail-page'
import {DevotionPassagesPage} from '@/pages/devotions/devotion-passages-page'
import {DevotionScanPage} from '@/pages/devotions/devotion-scan-page'
import {DevotionScripturesPage} from '@/pages/devotions/devotion-scriptures-page'
import {DevotionStatsPage} from '@/pages/devotions/devotion-stats-page'
import {GwendolynDetailPage} from '@/pages/devotions/gwendolyn-detail-page'
import {GwendolynListPage} from '@/pages/devotions/gwendolyn-list-page'
import {GwendolynNewPage} from '@/pages/devotions/gwendolyn-new-page'
import {GroupDetailPage} from '@/pages/group-detail-page'
import {GroupsPage} from '@/pages/groups-page'
import {HomePage} from '@/pages/home-page'
import {ImportPage} from '@/pages/import-page'
import {LoginPage} from '@/pages/login-page'
import {MessageComposePage} from '@/pages/message-compose-page'
import {MessageDetailPage} from '@/pages/message-detail-page'
import {MessageHistoryPage} from '@/pages/message-history-page'
import {NoteEditPage} from '@/pages/notes/note-edit-page'
import {NotesLayout} from '@/pages/notes/notes-layout'
import {NotesPage} from '@/pages/notes/notes-page'
import {NurseryScheduleViewPage} from '@/pages/nursery/nursery-schedule-view-page'
import {NurserySchedulesPage} from '@/pages/nursery/nursery-schedules-page'
import {NurserySettingsPage} from '@/pages/nursery/nursery-settings-page'
import {NurseryWorkersPage} from '@/pages/nursery/nursery-workers-page'
import {PeoplePage} from '@/pages/people-page'
import {PersonDetailPage} from '@/pages/person-detail-page'
import {HymnSearchDetailPage} from '@/pages/sermons/hymn-search-detail-page'
import {HymnSearchesPage} from '@/pages/sermons/hymn-searches-page'
import {HymnsPrepPage} from '@/pages/sermons/hymns-prep-page'
import {QuoteDetailPage} from '@/pages/sermons/quote-detail-page'
import {QuoteSearchDetailPage} from '@/pages/sermons/quote-search-detail-page'
import {QuoteSearchesPage} from '@/pages/sermons/quote-searches-page'
import {QuotesPage} from '@/pages/sermons/quotes-page'
import {QuotesResearchPage} from '@/pages/sermons/quotes-research-page'
import {SettingsPage} from '@/pages/settings-page'
import {TemplateEditPage} from '@/pages/template-edit-page'
import {TemplatesPage} from '@/pages/templates-page'
import {QueryClient, QueryClientProvider, useQuery, useQueryClient} from '@tanstack/react-query'
import {Home, LogOut, Moon, PanelLeftClose, PanelLeftOpen, Plus, Search, Settings, Sun} from 'lucide-react'
import {BrowserRouter, Link, NavLink, Route, Routes, useLocation, useNavigate} from 'react-router-dom'

const queryClient = new QueryClient({
  defaultOptions: {queries: {staleTime: 30_000}},
})

const isMac = typeof navigator !== 'undefined' && navigator.platform.toUpperCase().includes('MAC')
const mod = isMac ? '⌘' : 'Ctrl+'

function AuthGate() {
  const {data, isLoading} = useQuery({queryKey: ['auth-status'], queryFn: checkAuthStatus})

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Spinner size="lg" />
      </div>
    )
  }

  if (data?.authRequired && !data?.authenticated) {
    return <LoginPage />
  }

  return <AppLayout />
}

function SidebarNav({onNavClick, collapsed}: {onNavClick?: () => void; collapsed?: boolean}) {
  return (
    <nav
      className={cn(
        'flex-1 space-y-1 overflow-y-auto overflow-x-hidden',
        collapsed ? 'p-2 flex flex-col items-center' : 'p-3 md:p-2',
      )}
    >
      {navGroups.map((group) => (
        <CollapsibleNavGroup key={group.id} group={group} onNavClick={onNavClick} collapsed={collapsed} />
      ))}
    </nav>
  )
}

function SidebarFooter({onNavClick, collapsed}: {onNavClick?: () => void; collapsed?: boolean}) {
  const {data: authStatus} = useQuery({queryKey: ['auth-status'], queryFn: checkAuthStatus})
  const qc = useQueryClient()
  const {isDark, toggleDark} = useTheme()
  const navigate = useNavigate()
  const location = useLocation()
  const settingsActive = location.pathname === '/settings'

  const goToSettings = () => {
    navigate('/settings')
    onNavClick?.()
  }

  if (collapsed) {
    const iconBtnBase = 'flex items-center justify-center h-10 w-10 mx-auto rounded-md transition-colors cursor-pointer'
    return (
      <div className="p-2 border-t border-sidebar-border space-y-1 shrink-0 flex flex-col items-center">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={goToSettings}
              className={cn(
                iconBtnBase,
                settingsActive
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground border border-border shadow-sm dark:border-transparent dark:shadow-none'
                  : 'hover:bg-sidebar-accent/50 border border-transparent hover:border-border hover:shadow-sm dark:hover:border-transparent dark:hover:shadow-none',
              )}
            >
              <Settings className="h-5 w-5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">Settings</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={toggleDark}
              className={cn(
                iconBtnBase,
                'hover:bg-sidebar-accent/50 border border-transparent hover:border-border hover:shadow-sm dark:hover:border-transparent dark:hover:shadow-none',
              )}
            >
              {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">{isDark ? 'Light Mode' : 'Dark Mode'}</TooltipContent>
        </Tooltip>
        {authStatus?.authRequired && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={async () => {
                  await logout()
                  qc.invalidateQueries({queryKey: ['auth-status']})
                  onNavClick?.()
                }}
                className={cn(
                  iconBtnBase,
                  'hover:bg-sidebar-accent/50 border border-transparent hover:border-border hover:shadow-sm dark:hover:border-transparent dark:hover:shadow-none',
                )}
              >
                <LogOut className="h-5 w-5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">Logout</TooltipContent>
          </Tooltip>
        )}
      </div>
    )
  }

  return (
    <div className="p-3 border-t border-sidebar-border space-y-1 shrink-0">
      <button
        type="button"
        onClick={goToSettings}
        className={cn(
          'flex items-center gap-3 md:gap-2 px-3 py-3 md:py-2 rounded-md text-base md:text-sm w-full transition-colors cursor-pointer',
          settingsActive
            ? 'bg-sidebar-accent text-sidebar-accent-foreground border border-border shadow-sm dark:border-transparent dark:shadow-none'
            : 'hover:bg-sidebar-accent/50 border border-transparent hover:border-border hover:shadow-sm dark:hover:border-transparent dark:hover:shadow-none',
        )}
      >
        <Settings className="h-5 w-5 md:h-4 md:w-4" />
        <span className="flex-1 text-left">Settings</span>
        <kbd className="text-[10px] font-mono text-sidebar-foreground/50 hidden md:inline">{mod},</kbd>
      </button>
      <button
        onClick={toggleDark}
        className="flex items-center gap-3 md:gap-2 px-3 py-3 md:py-2 rounded-md text-base md:text-sm hover:bg-sidebar-accent/50 border border-transparent hover:border-border hover:shadow-sm dark:hover:border-transparent dark:hover:shadow-none w-full transition-colors cursor-pointer"
      >
        {isDark ? <Sun className="h-5 w-5 md:h-4 md:w-4" /> : <Moon className="h-5 w-5 md:h-4 md:w-4" />}
        <span className="flex-1 text-left">{isDark ? 'Light Mode' : 'Dark Mode'}</span>
        <kbd className="text-[10px] font-mono text-sidebar-foreground/50 hidden md:inline">{mod}D</kbd>
      </button>
      {authStatus?.authRequired && (
        <button
          onClick={async () => {
            await logout()
            qc.invalidateQueries({queryKey: ['auth-status']})
            onNavClick?.()
          }}
          className="flex items-center gap-3 md:gap-2 px-3 py-3 md:py-2 rounded-md text-base md:text-sm hover:bg-sidebar-accent/50 border border-transparent hover:border-border hover:shadow-sm dark:hover:border-transparent dark:hover:shadow-none w-full transition-colors cursor-pointer"
        >
          <LogOut className="h-5 w-5 md:h-4 md:w-4" />
          <span className="flex-1 text-left">Logout</span>
        </button>
      )}
    </div>
  )
}

const fabActions: Record<string, {label: string; to: string}> = {
  '/dashboard': {label: 'Compose', to: '/messages/compose'},
  '/people': {label: 'Add Person', to: '/people?add=1'},
  '/groups': {label: 'Create Group', to: '/groups?add=1'},
  '/messages': {label: 'Compose', to: '/messages/compose'},
  '/templates': {label: 'New Template', to: '/templates/new'},
}

function MobileSearchButton() {
  const {setOpen} = useCommandPalette()
  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      aria-label="Open search"
      className="absolute right-4 top-1/2 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground"
    >
      <Search className="h-5 w-5" />
    </button>
  )
}

function MobileFab() {
  const location = useLocation()
  const navigate = useNavigate()
  const action = fabActions[location.pathname]
  if (!action) return null

  return (
    <button
      onClick={() => navigate(action.to)}
      aria-label={action.label}
      className="fixed right-5 bottom-28 z-50 md:hidden flex items-center justify-center h-14 w-14 rounded-full bg-primary text-primary-foreground shadow-lg active:scale-95 transition-transform"
    >
      <Plus className="h-7 w-7" />
    </button>
  )
}

function BottomTabBar() {
  const location = useLocation()
  const activeGroup = findActiveGroup(location.pathname)
  const isHome = location.pathname === '/'

  // On any section page show [Home] + that section's children.
  // On the home dashboard itself show [Home] + each section's top-level entry.
  const items: {to: string; label: string; icon: typeof Home; isHome?: boolean}[] = [
    {to: '/', label: 'Home', icon: Home, isHome: true},
  ]

  if (activeGroup) {
    activeGroup.children.forEach((c) => items.push({to: c.to, label: c.label, icon: c.icon}))
  } else {
    navGroups.forEach((g) => items.push({to: g.children[0].to, label: g.label, icon: g.icon}))
  }

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 md:hidden bg-sidebar text-sidebar-foreground border-t">
      <div className="flex items-center justify-around px-3 pt-2 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        {items.map(({to, label, icon: Icon, isHome: itemIsHome}) => {
          const active = itemIsHome
            ? isHome
            : isChildActive(
                to,
                location.pathname,
                items.filter((i) => !i.isHome),
              )
          return (
            <NavLink
              key={to}
              to={to}
              className={cn(
                'flex flex-col items-center gap-1 px-2 py-2 rounded-lg text-[11px] font-medium transition-colors min-w-[3.5rem]',
                active ? 'text-sidebar-accent-foreground bg-sidebar-accent' : 'text-sidebar-foreground/60',
              )}
            >
              <Icon className="h-5 w-5" />
              <span>{label}</span>
            </NavLink>
          )
        })}
      </div>
    </nav>
  )
}

function AppLayout() {
  const {toggleDark} = useTheme()
  useKeyboardShortcuts(toggleDark)
  const [collapsed, setCollapsed] = useSidebarCollapsed()

  return (
    <CommandPaletteProvider>
      <AppLayoutInner collapsed={collapsed} setCollapsed={setCollapsed} />
    </CommandPaletteProvider>
  )
}

function AppLayoutInner({
  collapsed,
  setCollapsed,
}: {
  collapsed: boolean
  setCollapsed: React.Dispatch<React.SetStateAction<boolean>>
}) {
  return (
    <TooltipProvider delayDuration={150}>
      <div className="flex h-screen overflow-hidden">
        {/* Desktop Sidebar */}
        <aside
          className={cn(
            'border-r border-sidebar-border bg-sidebar text-sidebar-foreground hidden md:flex flex-col shrink-0 overflow-hidden transition-[width] duration-200',
            collapsed ? 'w-14' : 'w-56',
          )}
        >
          <div
            className={cn(
              'flex items-center border-b border-sidebar-border',
              collapsed ? 'justify-center p-2' : 'gap-2 p-4',
            )}
          >
            {!collapsed && (
              <Link to="/" className="flex-1 min-w-0">
                <img src="/logos/default-monochrome.svg" alt="Central Flock" className="h-6 dark:hidden" />
                <img src="/logos/default-monochrome-white.svg" alt="Central Flock" className="h-6 hidden dark:block" />
              </Link>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => setCollapsed((v) => !v)}
                  aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                  className="flex items-center justify-center h-8 w-8 rounded-md text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50 transition-colors cursor-pointer shrink-0"
                >
                  {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">{collapsed ? 'Expand sidebar' : 'Collapse sidebar'}</TooltipContent>
            </Tooltip>
          </div>
          <SidebarNav collapsed={collapsed} />
          <SidebarFooter collapsed={collapsed} />
        </aside>

        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Mobile top bar */}
          <header className="md:hidden relative flex items-center justify-center border-b px-4 py-3 bg-background shrink-0">
            <Link to="/">
              <img src="/logos/default-monochrome.svg" alt="Central Flock" className="h-5 dark:hidden" />
              <img src="/logos/default-monochrome-white.svg" alt="Central Flock" className="h-5 hidden dark:block" />
            </Link>
            <MobileSearchButton />
          </header>

          {/* Main content */}
          <main className="flex-1 overflow-auto pb-48 md:pb-8">
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/people" element={<PeoplePage />} />
              <Route path="/people/:id" element={<PersonDetailPage />} />
              <Route path="/groups" element={<GroupsPage />} />
              <Route path="/groups/:id" element={<GroupDetailPage />} />
              <Route path="/messages" element={<MessageHistoryPage />} />
              <Route path="/messages/compose" element={<MessageComposePage />} />
              <Route path="/messages/:id" element={<MessageDetailPage />} />
              <Route path="/templates" element={<TemplatesPage />} />
              <Route path="/templates/new" element={<TemplateEditPage />} />
              <Route path="/templates/:id/edit" element={<TemplateEditPage />} />
              <Route path="/import" element={<ImportPage />} />
              <Route path="/import/contacts" element={<ContactsImportPage />} />
              <Route path="/devotions" element={<DevotionListPage />} />
              <Route path="/devotions/stats" element={<DevotionStatsPage />} />
              <Route path="/devotions/scan" element={<DevotionScanPage />} />
              <Route path="/devotions/scriptures" element={<DevotionScripturesPage />} />
              <Route path="/devotions/passages" element={<DevotionPassagesPage />} />
              <Route path="/devotions/passages/:id" element={<DevotionPassageDetailPage />} />
              <Route path="/devotions/audit" element={<DevotionAuditPage />} />
              <Route path="/devotions/missing" element={<DevotionMissingPage />} />
              <Route path="/devotions/gwendolyn" element={<GwendolynListPage />} />
              <Route path="/devotions/gwendolyn/new" element={<GwendolynNewPage />} />
              <Route path="/devotions/gwendolyn/:id" element={<GwendolynDetailPage />} />
              <Route path="/devotions/new" element={<DevotionDetailPage />} />
              <Route path="/devotions/:id" element={<DevotionDetailPage />} />
              <Route path="/nursery" element={<NurserySchedulesPage />} />
              <Route path="/nursery/workers" element={<NurseryWorkersPage />} />
              <Route path="/nursery/settings" element={<NurserySettingsPage />} />
              <Route path="/nursery/:id" element={<NurseryScheduleViewPage />} />
              <Route path="/sermons/quotes" element={<QuotesPage />} />
              <Route path="/sermons/quotes/:id" element={<QuoteDetailPage />} />
              <Route path="/sermons/research" element={<QuotesResearchPage />} />
              <Route path="/sermons/searches" element={<QuoteSearchesPage />} />
              <Route path="/sermons/searches/:id" element={<QuoteSearchDetailPage />} />
              <Route path="/sermons/hymns" element={<HymnsPrepPage />} />
              <Route path="/sermons/hymns/searches" element={<HymnSearchesPage />} />
              <Route path="/sermons/hymns/searches/:id" element={<HymnSearchDetailPage />} />
              <Route path="/notes" element={<NotesLayout />}>
                <Route index element={<NotesPage />} />
                <Route path="note/:noteId" element={<NoteEditPage />} />
              </Route>
              <Route path="/calendar" element={<CalendarPage />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Routes>
          </main>
        </div>

        {/* Mobile FAB + bottom tab bar */}
        <MobileFab />
        <BottomTabBar />

        <Toaster />
      </div>
    </TooltipProvider>
  )
}

function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <AuthGate />
        </BrowserRouter>
      </QueryClientProvider>
    </ThemeProvider>
  )
}

export default App
