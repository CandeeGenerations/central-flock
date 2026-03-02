import {KeyboardShortcutsDialog} from '@/components/keyboard-shortcuts-dialog'
import {Toaster} from '@/components/ui/sonner'
import {useKeyboardShortcuts} from '@/hooks/use-keyboard-shortcuts'
import {cn} from '@/lib/utils'
import {DashboardPage} from '@/pages/dashboard-page'
import {GroupDetailPage} from '@/pages/group-detail-page'
import {GroupsPage} from '@/pages/groups-page'
import {ImportPage} from '@/pages/import-page'
import {MessageComposePage} from '@/pages/message-compose-page'
import {MessageDetailPage} from '@/pages/message-detail-page'
import {MessageHistoryPage} from '@/pages/message-history-page'
import {PeoplePage} from '@/pages/people-page'
import {PersonDetailPage} from '@/pages/person-detail-page'
import {SettingsPage} from '@/pages/settings-page'
import {TemplateEditPage} from '@/pages/template-edit-page'
import {TemplatesPage} from '@/pages/templates-page'
import {QueryClient, QueryClientProvider} from '@tanstack/react-query'
import {FileText, FolderOpen, Keyboard, LayoutDashboard, MessageSquare, Moon, Settings, Sun, Users} from 'lucide-react'
import {useCallback, useEffect, useState} from 'react'
import {BrowserRouter, NavLink, Route, Routes} from 'react-router-dom'

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

function AppLayout() {
  const [dark, setDark] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('theme') === 'dark'
    }
    return false
  })
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const showShortcuts = useCallback(() => setShortcutsOpen(true), [])
  const toggleDark = useCallback(() => setDark((d) => !d), [])
  useKeyboardShortcuts(showShortcuts, toggleDark)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    localStorage.setItem('theme', dark ? 'dark' : 'light')
  }, [dark])

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className="w-56 border-r bg-sidebar text-sidebar-foreground flex flex-col shrink-0">
        <div className="p-4 border-b">
          <img src="/logos/default-monochrome.svg" alt="Central Flock" className="h-6 dark:hidden" />
          <img src="/logos/default-monochrome-white.svg" alt="Central Flock" className="h-6 hidden dark:block" />
        </div>
        <nav className="flex-1 p-2 space-y-1">
          {navItems.map(({to, label, icon: Icon, shortcut}) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({isActive}) =>
                cn(
                  'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors',
                  isActive ? 'bg-sidebar-accent text-sidebar-accent-foreground' : 'hover:bg-sidebar-accent/50',
                )
              }
            >
              <Icon className="h-4 w-4" />
              <span className="flex-1">{label}</span>
              <kbd className="text-[10px] font-mono text-muted-foreground opacity-60">{shortcut}</kbd>
            </NavLink>
          ))}
        </nav>
        <div className="p-3 border-t space-y-1">
          <NavLink
            to="/settings"
            className={({isActive}) =>
              cn(
                'flex items-center gap-2 px-3 py-2 rounded-md text-sm w-full transition-colors',
                isActive ? 'bg-sidebar-accent text-sidebar-accent-foreground' : 'hover:bg-sidebar-accent/50',
              )
            }
          >
            <Settings className="h-4 w-4" />
            <span className="flex-1 text-left">Settings</span>
            <kbd className="text-[10px] font-mono text-muted-foreground opacity-60">{mod},</kbd>
          </NavLink>
          <button
            onClick={() => setShortcutsOpen(true)}
            className="flex items-center gap-2 px-3 py-2 rounded-md text-sm hover:bg-sidebar-accent/50 w-full transition-colors"
          >
            <Keyboard className="h-4 w-4" />
            <span className="flex-1 text-left">Shortcuts</span>
            <kbd className="text-[10px] font-mono text-muted-foreground opacity-60">?</kbd>
          </button>
          <button
            onClick={() => setDark((d) => !d)}
            className="flex items-center gap-2 px-3 py-2 rounded-md text-sm hover:bg-sidebar-accent/50 w-full transition-colors"
          >
            {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            <span className="flex-1 text-left">{dark ? 'Light Mode' : 'Dark Mode'}</span>
            <kbd className="text-[10px] font-mono text-muted-foreground opacity-60">{mod}D</kbd>
          </button>
        </div>
      </aside>

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
      <Toaster />
      <KeyboardShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
    </div>
  )
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AppLayout />
      </BrowserRouter>
    </QueryClientProvider>
  )
}

export default App
