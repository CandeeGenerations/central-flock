import {Toaster} from '@/components/ui/sonner'
import {cn} from '@/lib/utils'
import {GroupDetailPage} from '@/pages/group-detail-page'
import {GroupsPage} from '@/pages/groups-page'
import {ImportPage} from '@/pages/import-page'
import {MessageComposePage} from '@/pages/message-compose-page'
import {MessageDetailPage} from '@/pages/message-detail-page'
import {MessageHistoryPage} from '@/pages/message-history-page'
import {PeoplePage} from '@/pages/people-page'
import {PersonDetailPage} from '@/pages/person-detail-page'
import {TemplateEditPage} from '@/pages/template-edit-page'
import {TemplatesPage} from '@/pages/templates-page'
import {QueryClient, QueryClientProvider} from '@tanstack/react-query'
import {FileText, FolderOpen, MessageSquare, Moon, Sun, Upload, Users} from 'lucide-react'
import {useEffect, useState} from 'react'
import {BrowserRouter, NavLink, Navigate, Route, Routes} from 'react-router-dom'

const queryClient = new QueryClient({
  defaultOptions: {queries: {staleTime: 30_000}},
})

const navItems = [
  {to: '/people', label: 'People', icon: Users},
  {to: '/groups', label: 'Groups', icon: FolderOpen},
  {to: '/messages', label: 'Messages', icon: MessageSquare},
  {to: '/templates', label: 'Templates', icon: FileText},
  {to: '/import', label: 'Import', icon: Upload},
]

function AppLayout() {
  const [dark, setDark] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('theme') === 'dark'
    }
    return false
  })

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
          {navItems.map(({to, label, icon: Icon}) => (
            <NavLink
              key={to}
              to={to}
              className={({isActive}) =>
                cn(
                  'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors',
                  isActive ? 'bg-sidebar-accent text-sidebar-accent-foreground' : 'hover:bg-sidebar-accent/50',
                )
              }
            >
              <Icon className="h-4 w-4" />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="p-3 border-t">
          <button
            onClick={() => setDark((d) => !d)}
            className="flex items-center gap-2 px-3 py-2 rounded-md text-sm hover:bg-sidebar-accent/50 w-full transition-colors"
          >
            {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            {dark ? 'Light Mode' : 'Dark Mode'}
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto pb-48">
        <Routes>
          <Route path="/" element={<Navigate to="/people" replace />} />
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
        </Routes>
      </main>
      <Toaster />
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
