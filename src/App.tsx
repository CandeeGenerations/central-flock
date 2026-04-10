import {KeyboardShortcutsDialog} from '@/components/keyboard-shortcuts-dialog'
import {Toaster} from '@/components/ui/sonner'
import {Spinner} from '@/components/ui/spinner'
import {useKeyboardShortcuts} from '@/hooks/use-keyboard-shortcuts'
import {checkAuthStatus, logout} from '@/lib/api'
import {ThemeProvider, useTheme} from '@/lib/theme-context'
import {cn} from '@/lib/utils'
import {ContactsImportPage} from '@/pages/contacts-import-page'
import {DashboardPage} from '@/pages/dashboard-page'
import {DevotionAuditPage} from '@/pages/devotions/devotion-audit-page'
import {DevotionDetailPage} from '@/pages/devotions/devotion-detail-page'
import {DevotionListPage} from '@/pages/devotions/devotion-list-page'
import {DevotionScanPage} from '@/pages/devotions/devotion-scan-page'
import {DevotionScripturesPage} from '@/pages/devotions/devotion-scriptures-page'
import {DevotionStatsPage} from '@/pages/devotions/devotion-stats-page'
import {GroupDetailPage} from '@/pages/group-detail-page'
import {GroupsPage} from '@/pages/groups-page'
import {ImportPage} from '@/pages/import-page'
import {LoginPage} from '@/pages/login-page'
import {MessageComposePage} from '@/pages/message-compose-page'
import {MessageDetailPage} from '@/pages/message-detail-page'
import {MessageHistoryPage} from '@/pages/message-history-page'
import {PeoplePage} from '@/pages/people-page'
import {PersonDetailPage} from '@/pages/person-detail-page'
import {SettingsPage} from '@/pages/settings-page'
import {TemplateEditPage} from '@/pages/template-edit-page'
import {TemplatesPage} from '@/pages/templates-page'
import {QueryClient, QueryClientProvider, useQuery, useQueryClient} from '@tanstack/react-query'
import {
  AlertTriangle,
  BarChart3,
  BookOpen,
  FileText,
  FolderOpen,
  Keyboard,
  LayoutDashboard,
  List,
  LogOut,
  MessageSquare,
  Moon,
  Plus,
  Settings,
  Sun,
  Users,
} from 'lucide-react'
import {useCallback, useState} from 'react'
import {BrowserRouter, Link, NavLink, Route, Routes, useLocation, useNavigate} from 'react-router-dom'

const queryClient = new QueryClient({
  defaultOptions: {queries: {staleTime: 30_000}},
})

const isMac = typeof navigator !== 'undefined' && navigator.platform.toUpperCase().includes('MAC')
const mod = isMac ? '⌘' : 'Ctrl+'

const navItems = [
  {to: '/', label: 'Dashboard', icon: LayoutDashboard, shortcut: `${mod}1`},
  {to: '/people', label: 'People', icon: Users, shortcut: `${mod}2`},
  {to: '/groups', label: 'Groups', icon: FolderOpen, shortcut: `${mod}3`},
  {to: '/messages', label: 'Messages', icon: MessageSquare, shortcut: `${mod}4`},
  {to: '/templates', label: 'Templates', icon: FileText, shortcut: `${mod}5`},
]

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

const devotionNavItems = [
  {to: '/devotions/stats', label: 'Stats', icon: BarChart3, shortcut: `${mod}6`},
  {to: '/devotions', label: 'Devotions', icon: List, shortcut: `${mod}7`},
  {to: '/devotions/scriptures', label: 'Scriptures', icon: BookOpen, shortcut: `${mod}8`},
  {to: '/devotions/audit', label: 'Audit', icon: AlertTriangle, shortcut: `${mod}9`},
]

function SidebarNav({onNavClick}: {onNavClick?: () => void}) {
  return (
    <nav className="flex-1 p-3 md:p-2 space-y-1">
      {navItems.map(({to, label, icon: Icon, shortcut}) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/'}
          onClick={onNavClick}
          className={({isActive}) =>
            cn(
              'flex items-center gap-3 px-3 py-3 md:py-2 rounded-md text-base md:text-sm font-medium transition-colors cursor-pointer',
              isActive
                ? 'bg-sidebar-accent text-sidebar-accent-foreground border border-border shadow-sm dark:border-transparent dark:shadow-none'
                : 'hover:bg-sidebar-accent/50 border border-transparent hover:border-border hover:shadow-sm dark:hover:border-transparent dark:hover:shadow-none',
            )
          }
        >
          <Icon className="h-5 w-5 md:h-4 md:w-4" />
          <span className="flex-1">{label}</span>
          <kbd className="text-[10px] font-mono text-sidebar-foreground/50 hidden md:inline">{shortcut}</kbd>
        </NavLink>
      ))}
      <div className="border-t border-sidebar-border my-2" />
      <div className="px-3 py-1 text-[10px] font-semibold text-sidebar-foreground/40 uppercase tracking-wider hidden md:block">
        Devotions
      </div>
      {devotionNavItems.map(({to, label, icon: Icon, shortcut}) => (
        <NavLink
          key={to}
          to={to}
          end
          onClick={onNavClick}
          className={({isActive}) =>
            cn(
              'flex items-center gap-3 px-3 py-3 md:py-2 rounded-md text-base md:text-sm font-medium transition-colors cursor-pointer',
              isActive
                ? 'bg-sidebar-accent text-sidebar-accent-foreground border border-border shadow-sm dark:border-transparent dark:shadow-none'
                : 'hover:bg-sidebar-accent/50 border border-transparent hover:border-border hover:shadow-sm dark:hover:border-transparent dark:hover:shadow-none',
            )
          }
        >
          <Icon className="h-5 w-5 md:h-4 md:w-4" />
          <span className="flex-1">{label}</span>
          <kbd className="text-[10px] font-mono text-sidebar-foreground/50 hidden md:inline">{shortcut}</kbd>
        </NavLink>
      ))}
    </nav>
  )
}

function SidebarFooter({
  setShortcutsOpen,
  onNavClick,
}: {
  setShortcutsOpen: (open: boolean) => void
  onNavClick?: () => void
}) {
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
        onClick={() => {
          setShortcutsOpen(true)
          onNavClick?.()
        }}
        className="flex items-center gap-3 md:gap-2 px-3 py-3 md:py-2 rounded-md text-base md:text-sm hover:bg-sidebar-accent/50 border border-transparent hover:border-border hover:shadow-sm dark:hover:border-transparent dark:hover:shadow-none w-full transition-colors cursor-pointer"
      >
        <Keyboard className="h-5 w-5 md:h-4 md:w-4" />
        <span className="flex-1 text-left">Shortcuts</span>
        <kbd className="text-[10px] font-mono text-sidebar-foreground/50 hidden md:inline">?</kbd>
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
  '/': {label: 'Compose', to: '/messages/compose'},
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
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 md:hidden bg-sidebar text-sidebar-foreground border-t safe-bottom">
      <div className="flex items-center justify-around px-3 pt-2 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        {navItems.map(({to, label, icon: Icon}) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({isActive}) =>
              cn(
                'flex flex-col items-center gap-1 px-3 py-2 rounded-lg text-xs font-medium transition-colors min-w-[4rem]',
                isActive ? 'text-sidebar-accent-foreground bg-sidebar-accent' : 'text-sidebar-foreground/60',
              )
            }
          >
            <Icon className="h-6 w-6" />
            <span>{label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  )
}

function AppLayout() {
  const {toggleDark} = useTheme()
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const showShortcuts = useCallback(() => setShortcutsOpen(true), [])
  useKeyboardShortcuts(showShortcuts, toggleDark)

  const footerProps = {setShortcutsOpen}

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Desktop Sidebar */}
      <aside className="w-56 border-r border-sidebar-border bg-sidebar text-sidebar-foreground hidden md:flex flex-col shrink-0 overflow-hidden">
        <Link to="/" className="block p-4 border-b border-sidebar-border">
          <img src="/logos/default-monochrome.svg" alt="Central Flock" className="h-6 dark:hidden" />
          <img src="/logos/default-monochrome-white.svg" alt="Central Flock" className="h-6 hidden dark:block" />
        </Link>
        <SidebarNav />
        <SidebarFooter {...footerProps} />
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
            <Route path="/" element={<DashboardPage />} />
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
            <Route path="/devotions/audit" element={<DevotionAuditPage />} />
            <Route path="/devotions/new" element={<DevotionDetailPage />} />
            <Route path="/devotions/:id" element={<DevotionDetailPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </main>
      </div>

      {/* Mobile FAB + bottom tab bar */}
      <MobileFab />
      <BottomTabBar />

      <Toaster />
      <KeyboardShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
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
