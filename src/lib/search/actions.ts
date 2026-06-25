import {navGroups} from '@/lib/nav-config'
import type {ActionsBuildContext, SearchItem} from '@/lib/search/registry'
import {
  BookOpen,
  CheckSquare,
  FileText,
  FolderPlus,
  LayoutDashboard,
  Mail,
  Moon,
  Music,
  Plus,
  Quote,
  ScanLine,
  SearchX,
  Settings,
  Sparkles,
  Upload,
  UserPlus,
} from 'lucide-react'

const GO_PREFIX = 'Go to'

function nav(to: string, label: string, icon: SearchItem['icon'], keywords: string[] = []): SearchItem {
  return {
    id: `nav-${to}`,
    label: `${GO_PREFIX} ${label}`,
    group: 'Navigation',
    icon,
    keywords: [label, to, ...keywords],
    navPath: to,
    action: ({navigate, close}) => {
      navigate(to)
      close()
    },
  }
}

export function buildNavigationActions(): SearchItem[] {
  // Sidebar routes derive from navGroups (src/lib/nav-config.ts) so the palette
  // can't drift from the sidebar — adding/removing a nav entry updates kbar
  // automatically. Only routes NOT in the sidebar need an explicit entry below.
  const fromSidebar = navGroups.flatMap((g) =>
    g.children.map((c) => nav(c.to, `${g.label} ${c.label}`, c.icon, [c.label, g.label])),
  )
  const nonNavRoutes = [
    nav('/', 'Home', LayoutDashboard, ['dashboard', 'start']),
    nav('/messages/compose', 'Compose Message', Mail, ['new message', 'send']),
    nav('/devotions/scan', 'Devotion Scan', ScanLine, ['scan', 'ocr', 'sheet', 'import']),
    nav('/devotions/missing', 'Devotion Missing', SearchX, ['missing', 'gaps', 'incomplete']),
    nav('/music/hymns', 'Hymn Prep', Music, ['hymn', 'prep', 'song service']),
    nav('/sermons/research', 'Sermon Research', Sparkles, ['research']),
    nav('/import', 'Import CSV', Upload, ['upload']),
    nav('/import/contacts', 'Import Mac Contacts', Upload),
    nav('/settings', 'Settings', Settings),
  ]
  return [...nonNavRoutes, ...fromSidebar]
}

export function buildCreateActions(): SearchItem[] {
  return [
    {
      id: 'create-person',
      label: 'New Person',
      group: 'Create',
      icon: UserPlus,
      keywords: ['new', 'add', 'person', 'contact'],
      action: ({navigate, close}) => {
        navigate('/people?new=1')
        close()
      },
    },
    {
      id: 'create-group',
      label: 'New Group',
      group: 'Create',
      icon: FolderPlus,
      keywords: ['new', 'add', 'group'],
      action: ({navigate, close}) => {
        navigate('/groups?new=1')
        close()
      },
    },
    {
      id: 'create-message',
      label: 'New Message',
      group: 'Create',
      icon: Mail,
      keywords: ['new', 'compose', 'send', 'text', 'sms'],
      action: ({navigate, close}) => {
        navigate('/messages/compose')
        close()
      },
    },
    {
      id: 'create-template',
      label: 'New Template',
      group: 'Create',
      icon: FileText,
      keywords: ['new', 'template'],
      action: ({navigate, close}) => {
        navigate('/templates/new')
        close()
      },
    },
    {
      id: 'create-rsvp-list',
      label: 'New RSVP List',
      group: 'Create',
      icon: CheckSquare,
      keywords: ['new', 'rsvp', 'event', 'attendance'],
      action: ({navigate, close}) => {
        navigate('/rsvp?new=1')
        close()
      },
    },
    {
      id: 'create-devotion',
      label: 'New Devotion',
      group: 'Create',
      icon: BookOpen,
      keywords: ['new', 'devotion'],
      action: ({navigate, close}) => {
        navigate('/devotions?new=1')
        close()
      },
    },
    {
      id: 'create-gwendolyn',
      label: 'New Gwendolyn Devotion',
      group: 'Create',
      icon: BookOpen,
      keywords: ['new', 'gwendolyn', 'devotion'],
      action: ({navigate, close}) => {
        navigate('/devotions/gwendolyn/new')
        close()
      },
    },
    {
      id: 'create-quote',
      label: 'New Quote',
      group: 'Create',
      icon: Quote,
      keywords: ['new', 'quote', 'sermon'],
      action: ({navigate, close}) => {
        navigate('/sermons/quotes?new=1')
        close()
      },
    },
    {
      id: 'create-special',
      label: 'New Special',
      group: 'Create',
      icon: Sparkles,
      keywords: ['new', 'special', 'music', 'performance', 'solo', 'duet', 'trio'],
      action: ({navigate, close}) => {
        navigate('/music/specials/new')
        close()
      },
    },
    {
      id: 'create-hymn-search',
      label: 'New Hymn Search',
      group: 'Create',
      icon: Music,
      keywords: ['new', 'hymn', 'suggest', 'music', 'sermon'],
      action: ({navigate, close}) => {
        navigate('/music/hymns')
        close()
      },
    },
    {
      id: 'create-nursery-schedule',
      label: 'Generate Nursery Schedule',
      group: 'Create',
      icon: Plus,
      keywords: ['new', 'generate', 'nursery', 'schedule'],
      action: ({navigate, close}) => {
        navigate('/nursery?generate=1')
        close()
      },
    },
  ]
}

export function buildCommandActions(ctx: ActionsBuildContext): SearchItem[] {
  return [
    {
      id: 'cmd-toggle-dark',
      label: 'Toggle Dark Mode',
      group: 'Commands',
      icon: Moon,
      keywords: ['dark', 'light', 'theme', 'toggle'],
      action: ({close}) => {
        ctx.toggleDark()
        close()
      },
    },
    {
      id: 'cmd-open-settings',
      label: 'Open Settings',
      group: 'Commands',
      icon: Settings,
      keywords: ['settings', 'preferences', 'config'],
      action: ({navigate, close}) => {
        navigate('/settings')
        close()
      },
    },
  ]
}

export function buildAllActions(ctx: ActionsBuildContext): SearchItem[] {
  return [...buildNavigationActions(), ...buildCreateActions(), ...buildCommandActions(ctx)]
}
