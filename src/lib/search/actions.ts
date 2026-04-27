import {exportPeopleCSV} from '@/lib/api'
import type {ActionsBuildContext, SearchItem} from '@/lib/search/registry'
import {
  ArrowRight,
  Baby,
  BookOpen,
  Calendar,
  Download,
  FileText,
  FolderOpen,
  FolderPlus,
  LayoutDashboard,
  Mail,
  MessageSquare,
  Moon,
  Music,
  Plus,
  Quote,
  Settings,
  Sparkles,
  Upload,
  UserPlus,
  Users,
} from 'lucide-react'

const GO_PREFIX = 'Go to'

function nav(to: string, label: string, icon: SearchItem['icon'], keywords: string[] = []): SearchItem {
  return {
    id: `nav-${to}`,
    label: `${GO_PREFIX} ${label}`,
    group: 'Navigation',
    icon,
    keywords: [label, to, ...keywords],
    action: ({navigate, close}) => {
      navigate(to)
      close()
    },
  }
}

export function buildNavigationActions(): SearchItem[] {
  return [
    nav('/', 'Home', LayoutDashboard, ['dashboard', 'start']),
    nav('/dashboard', 'Messaging Dashboard', LayoutDashboard),
    nav('/people', 'People', Users, ['contacts']),
    nav('/groups', 'Groups', FolderOpen),
    nav('/messages', 'Messages', MessageSquare, ['history', 'sent']),
    nav('/messages/compose', 'Compose Message', Mail, ['new message', 'send']),
    nav('/templates', 'Templates', FileText),
    nav('/devotions', 'Devotions', BookOpen),
    nav('/devotions/stats', 'Devotions Dashboard', LayoutDashboard),
    nav('/devotions/gwendolyn', 'Gwendolyn Devotions', BookOpen),
    nav('/devotions/passages', 'Devotion Passages', Sparkles),
    nav('/sermons/quotes', 'Sermon Quotes', Quote),
    nav('/sermons/research', 'Sermon Research', Sparkles),
    nav('/sermons/hymns', 'Hymn Prep', Music),
    nav('/sermons/hymns/searches', 'Hymn Search History', Music),
    nav('/nursery', 'Nursery Schedules', Baby),
    nav('/nursery/workers', 'Nursery Workers', Users),
    nav('/calendar', 'Calendar', Calendar),
    nav('/import', 'Import CSV', Upload, ['upload']),
    nav('/import/contacts', 'Import Mac Contacts', Upload),
    nav('/settings', 'Settings', Settings),
  ]
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
      id: 'create-hymn-search',
      label: 'New Hymn Search',
      group: 'Create',
      icon: Music,
      keywords: ['new', 'hymn', 'suggest', 'sermon'],
      action: ({navigate, close}) => {
        navigate('/sermons/hymns')
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
      id: 'cmd-export-people',
      label: 'Export People as CSV',
      group: 'Commands',
      icon: Download,
      keywords: ['export', 'csv', 'people', 'download'],
      action: async ({close}) => {
        await exportPeopleCSV()
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
    {
      id: 'cmd-focus-table-search',
      label: 'Focus Table Search',
      group: 'Commands',
      icon: ArrowRight,
      keywords: ['search', 'focus', 'table', 'filter'],
      action: ({close}) => {
        close()
        setTimeout(() => {
          const el = document.querySelector<HTMLInputElement>('[data-search-input] input')
          el?.focus()
        }, 0)
      },
    },
  ]
}

export function buildAllActions(ctx: ActionsBuildContext): SearchItem[] {
  return [...buildNavigationActions(), ...buildCreateActions(), ...buildCommandActions(ctx)]
}
