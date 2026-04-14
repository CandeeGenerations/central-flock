import {
  AlertTriangle,
  Baby,
  BookOpen,
  Calendar,
  FileText,
  FolderOpen,
  LayoutDashboard,
  List,
  MessageSquare,
  Settings,
  Sparkles,
  Users,
} from 'lucide-react'
import type {LucideIcon} from 'lucide-react'

export type NavChild = {to: string; label: string; icon: LucideIcon; end?: boolean}
export type NavGroup = {id: string; label: string; icon: LucideIcon; children: NavChild[]}

export const navGroups: NavGroup[] = [
  {
    id: 'messaging',
    label: 'Messaging',
    icon: MessageSquare,
    children: [
      {to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard},
      {to: '/people', label: 'People', icon: Users},
      {to: '/groups', label: 'Groups', icon: FolderOpen},
      {to: '/messages', label: 'Messages', icon: MessageSquare},
      {to: '/templates', label: 'Templates', icon: FileText},
    ],
  },
  {
    id: 'devotions',
    label: 'Devotions',
    icon: BookOpen,
    children: [
      {to: '/devotions/stats', label: 'Dashboard', icon: LayoutDashboard},
      {to: '/devotions', label: 'Devotions', icon: List, end: true},
      {to: '/devotions/scriptures', label: 'Scripture Lookup', icon: BookOpen},
      {to: '/devotions/passages', label: 'Passages', icon: Sparkles},
      {to: '/devotions/audit', label: 'Audit', icon: AlertTriangle},
    ],
  },
  {
    id: 'nursery',
    label: 'Nursery',
    icon: Baby,
    children: [
      {to: '/nursery', label: 'Schedules', icon: Calendar, end: true},
      {to: '/nursery/workers', label: 'Workers', icon: Users},
      {to: '/nursery/settings', label: 'Settings', icon: Settings},
    ],
  },
]
