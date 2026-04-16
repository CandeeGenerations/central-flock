import {CollapsibleNavGroup} from '@/components/collapsible-nav-group'
import {Toaster} from '@/components/ui/sonner'
import {Spinner} from '@/components/ui/spinner'
import {useKeyboardShortcuts} from '@/hooks/use-keyboard-shortcuts'
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
import {NurseryScheduleViewPage} from '@/pages/nursery/nursery-schedule-view-page'
import {NurserySchedulesPage} from '@/pages/nursery/nursery-schedules-page'
import {NurserySettingsPage} from '@/pages/nursery/nursery-settings-page'
import {NurseryWorkersPage} from '@/pages/nursery/nursery-workers-page'
import {PeoplePage} from '@/pages/people-page'
import {PersonDetailPage} from '@/pages/person-detail-page'
import {QuoteDetailPage} from '@/pages/sermons/quote-detail-page'
import {QuoteSearchDetailPage} from '@/pages/sermons/quote-search-detail-page'
import {QuoteSearchesPage} from '@/pages/sermons/quote-searches-page'
import {QuotesPage} from '@/pages/sermons/quotes-page'
import {QuotesResearchPage} from '@/pages/sermons/quotes-research-page'
import {SettingsPage} from '@/pages/settings-page'
import {TemplateEditPage} from '@/pages/template-edit-page'
import {TemplatesPage} from '@/pages/templates-page'
import {QueryClient, QueryClientProvider, useQuery, useQueryClient} from '@tanstack/react-query'
import {Home, LogOut, Moon, Plus, Settings, Sun} from 'lucide-react'
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

function SidebarNav({onNavClick}: {onNavClick?: () => void}) {
  return (
    <nav className="flex-1 p-3 md:p-2 space-y-1 overflow-y-auto">
      {navGroups.map((group) => (
        <CollapsibleNavGroup key={group.id} group={group} onNavClick={onNavClick} />
      ))}
    </nav>
  )
}

function SidebarFooter({onNavClick}: {onNavClick?: () => void}) {
  const {data: authStatus} = useQuery({queryKey: ['auth-status'], queryFn: checkAuthStatus})
  const qc = useQueryClient()
  const {isDark, toggleDark} = useTheme()

  return (
    <div className="p-3 border-t border-sidebar-border space-y-1 shrink-0">
      <NavLink
        to="/settings"
        onClick={onNavClick}
        className={({isActive}) =>
          cn(
            'flex items-center gap-3 md:gap-2 px-3 py-3 md:py-2 rounded-md text-base md:text-sm w-full transition-colors cursor-pointer',
            isActive
              ? 'bg-sidebar-accent text-sidebar-accent-foreground border border-border shadow-sm dark:border-transparent dark:shadow-none'
              : 'hover:bg-sidebar-accent/50 border border-transparent hover:border-border hover:shadow-sm dark:hover:border-transparent dark:hover:shadow-none',
          )
        }
      >
        <Settings className="h-5 w-5 md:h-4 md:w-4" />
        <span className="flex-1 text-left">Settings</span>
        <kbd className="text-[10px] font-mono text-sidebar-foreground/50 hidden md:inline">{mod},</kbd>
      </NavLink>
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

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Desktop Sidebar */}
      <aside className="w-56 border-r border-sidebar-border bg-sidebar text-sidebar-foreground hidden md:flex flex-col shrink-0 overflow-hidden">
        <Link to="/" className="block p-4 border-b border-sidebar-border">
          <img src="/logos/default-monochrome.svg" alt="Central Flock" className="h-6 dark:hidden" />
          <img src="/logos/default-monochrome-white.svg" alt="Central Flock" className="h-6 hidden dark:block" />
        </Link>
        <SidebarNav />
        <SidebarFooter />
      </aside>

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Mobile top bar */}
        <header className="md:hidden flex items-center justify-center border-b px-4 py-3 bg-background shrink-0">
          <Link to="/">
            <img src="/logos/default-monochrome.svg" alt="Central Flock" className="h-5 dark:hidden" />
            <img src="/logos/default-monochrome-white.svg" alt="Central Flock" className="h-5 hidden dark:block" />
          </Link>
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
