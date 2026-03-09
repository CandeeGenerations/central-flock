import {KeyboardShortcutsDialog} from '@/components/keyboard-shortcuts-dialog'
import {Toaster} from '@/components/ui/sonner'
import {Spinner} from '@/components/ui/spinner'
import {useKeyboardShortcuts} from '@/hooks/use-keyboard-shortcuts'
import {checkAuthStatus, logout} from '@/lib/api'
import {cn} from '@/lib/utils'
import {DashboardPage} from '@/pages/dashboard-page'
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
  FileText,
  FolderOpen,
  Keyboard,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquare,
  Moon,
  Settings,
  Sun,
  Users,
  XIcon,
} from 'lucide-react'
import {useCallback, useEffect, useState} from 'react'
import {BrowserRouter, Link, NavLink, Route, Routes} from 'react-router-dom'

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
              isActive ? 'bg-sidebar-accent text-sidebar-accent-foreground' : 'hover:bg-sidebar-accent/50',
            )
          }
        >
          <Icon className="h-5 w-5 md:h-4 md:w-4" />
          <span className="flex-1">{label}</span>
          <kbd className="text-[10px] font-mono text-muted-foreground opacity-60 hidden md:inline">{shortcut}</kbd>
        </NavLink>
      ))}
    </nav>
  )
}

function SidebarFooter({
  dark,
  setDark,
  setShortcutsOpen,
  onNavClick,
}: {
  dark: boolean
  setDark: React.Dispatch<React.SetStateAction<boolean>>
  setShortcutsOpen: (open: boolean) => void
  onNavClick?: () => void
}) {
  const {data: authStatus} = useQuery({queryKey: ['auth-status'], queryFn: checkAuthStatus})
  const qc = useQueryClient()

  return (
    <div className="p-3 border-t space-y-1 shrink-0">
      <NavLink
        to="/settings"
        onClick={onNavClick}
        className={({isActive}) =>
          cn(
            'flex items-center gap-3 md:gap-2 px-3 py-3 md:py-2 rounded-md text-base md:text-sm w-full transition-colors cursor-pointer',
            isActive ? 'bg-sidebar-accent text-sidebar-accent-foreground' : 'hover:bg-sidebar-accent/50',
          )
        }
      >
        <Settings className="h-5 w-5 md:h-4 md:w-4" />
        <span className="flex-1 text-left">Settings</span>
        <kbd className="text-[10px] font-mono text-muted-foreground opacity-60 hidden md:inline">{mod},</kbd>
      </NavLink>
      <button
        onClick={() => {
          setShortcutsOpen(true)
          onNavClick?.()
        }}
        className="flex items-center gap-3 md:gap-2 px-3 py-3 md:py-2 rounded-md text-base md:text-sm hover:bg-sidebar-accent/50 w-full transition-colors cursor-pointer"
      >
        <Keyboard className="h-5 w-5 md:h-4 md:w-4" />
        <span className="flex-1 text-left">Shortcuts</span>
        <kbd className="text-[10px] font-mono text-muted-foreground opacity-60 hidden md:inline">?</kbd>
      </button>
      <button
        onClick={() => setDark((d) => !d)}
        className="flex items-center gap-3 md:gap-2 px-3 py-3 md:py-2 rounded-md text-base md:text-sm hover:bg-sidebar-accent/50 w-full transition-colors cursor-pointer"
      >
        {dark ? <Sun className="h-5 w-5 md:h-4 md:w-4" /> : <Moon className="h-5 w-5 md:h-4 md:w-4" />}
        <span className="flex-1 text-left">{dark ? 'Light Mode' : 'Dark Mode'}</span>
        <kbd className="text-[10px] font-mono text-muted-foreground opacity-60 hidden md:inline">{mod}D</kbd>
      </button>
      {authStatus?.authRequired && (
        <button
          onClick={async () => {
            await logout()
            qc.invalidateQueries({queryKey: ['auth-status']})
            onNavClick?.()
          }}
          className="flex items-center gap-3 md:gap-2 px-3 py-3 md:py-2 rounded-md text-base md:text-sm hover:bg-sidebar-accent/50 w-full transition-colors cursor-pointer"
        >
          <LogOut className="h-5 w-5 md:h-4 md:w-4" />
          <span className="flex-1 text-left">Logout</span>
        </button>
      )}
    </div>
  )
}

function AppLayout() {
  const [dark, setDark] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('theme') === 'dark'
    }
    return false
  })
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const showShortcuts = useCallback(() => setShortcutsOpen(true), [])
  const toggleDark = useCallback(() => setDark((d) => !d), [])
  useKeyboardShortcuts(showShortcuts, toggleDark)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    localStorage.setItem('theme', dark ? 'dark' : 'light')
  }, [dark])

  const footerProps = {dark, setDark, setShortcutsOpen}

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Desktop Sidebar */}
      <aside className="w-56 border-r bg-sidebar text-sidebar-foreground hidden md:flex flex-col shrink-0 overflow-hidden">
        <Link to="/" className="block p-4 border-b">
          <img src="/logos/default-monochrome.svg" alt="Central Flock" className="h-6 dark:hidden" />
          <img src="/logos/default-monochrome-white.svg" alt="Central Flock" className="h-6 hidden dark:block" />
        </Link>
        <SidebarNav />
        <SidebarFooter {...footerProps} />
      </aside>

      {/* Mobile fullscreen nav */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 md:hidden bg-sidebar text-sidebar-foreground flex flex-col">
          <div className="flex items-center gap-3 px-4 py-4 border-b shrink-0">
            <button onClick={() => setMobileNavOpen(false)} aria-label="Close menu" className="p-1">
              <XIcon className="h-6 w-6" />
            </button>
            <Link to="/" onClick={() => setMobileNavOpen(false)}>
              <img src="/logos/default-monochrome.svg" alt="Central Flock" className="h-6 dark:hidden" />
              <img src="/logos/default-monochrome-white.svg" alt="Central Flock" className="h-6 hidden dark:block" />
            </Link>
          </div>
          <div className="flex-1 flex flex-col overflow-auto pt-2 pb-4">
            <SidebarNav onNavClick={() => setMobileNavOpen(false)} />
            <SidebarFooter {...footerProps} onNavClick={() => setMobileNavOpen(false)} />
          </div>
        </div>
      )}

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Mobile top bar */}
        <header className="md:hidden flex items-center gap-3 border-b px-4 py-4 bg-white dark:bg-sidebar text-foreground dark:text-sidebar-foreground shrink-0">
          <button onClick={() => setMobileNavOpen(true)} aria-label="Open menu" className="p-1">
            <Menu className="h-6 w-6" />
          </button>
          <Link to="/">
            <img src="/logos/default-monochrome.svg" alt="Central Flock" className="h-6 dark:hidden" />
            <img src="/logos/default-monochrome-white.svg" alt="Central Flock" className="h-6 hidden dark:block" />
          </Link>
        </header>

        {/* Main content */}
        <main className="flex-1 overflow-auto pb-48">
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
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </main>
      </div>
      <Toaster />
      <KeyboardShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
    </div>
  )
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthGate />
      </BrowserRouter>
    </QueryClientProvider>
  )
}

export default App
