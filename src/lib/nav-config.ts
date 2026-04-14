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

/**
 * Returns true when the given child's `to` is the best match for the current pathname.
 * A sibling with a more specific prefix match "wins" — e.g. on /nursery/settings, only
 * /nursery/settings is active (not /nursery).
 */
export function isChildActive(childTo: string, pathname: string, siblings: {to: string}[]): boolean {
  if (pathname === childTo) return true
  if (!pathname.startsWith(childTo + '/')) return false
  return !siblings.some((s) => s.to !== childTo && (pathname === s.to || pathname.startsWith(s.to + '/')))
}

/** Returns the nav group whose children match the current pathname, or null if none. */
export function findActiveGroup(pathname: string): NavGroup | null {
  return navGroups.find((g) => g.children.some((c) => isChildActive(c.to, pathname, g.children))) || null
}

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
