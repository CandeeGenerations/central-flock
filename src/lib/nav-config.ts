import {
  AlertTriangle,
  Baby,
  BookOpen,
  Calendar,
  CheckSquare,
  FileText,
  FolderOpen,
  LayoutDashboard,
  List,
  MessageSquare,
  Music,
  Printer,
  Quote,
  Scissors,
  ScrollText,
  Settings,
  Smartphone,
  Sparkles,
  Users,
} from 'lucide-react'
import type {LucideIcon} from 'lucide-react'

export type NavChild = {to: string; label: string; icon: LucideIcon; end?: boolean; matchPaths?: string[]}
export type NavGroup = {id: string; label: string; icon: LucideIcon; children: NavChild[]}

/**
 * Returns true when the given child's `to` (or one of its `matchPaths`) is the best match
 * for the current pathname. A sibling with a more specific prefix match "wins" — e.g. on
 * /nursery/settings, only /nursery/settings is active (not /nursery).
 */
type ActiveTarget = {to: string; matchPaths?: string[]}

export function isChildActive(child: ActiveTarget | string, pathname: string, siblings: ActiveTarget[]): boolean {
  const target: ActiveTarget = typeof child === 'string' ? {to: child} : child
  const candidates = [target.to, ...(target.matchPaths ?? [])]

  const matches = (path: string) => pathname === path || pathname.startsWith(path + '/')
  if (!candidates.some(matches)) return false

  // A sibling with a longer matching path takes precedence (more specific route wins).
  return !siblings.some((s) => {
    if (s.to === target.to) return false
    const sibPaths = [s.to, ...(s.matchPaths ?? [])]
    return sibPaths.some((p) => p.length > target.to.length && matches(p))
  })
}

/** Returns the nav group whose children match the current pathname, or null if none. */
export function findActiveGroup(pathname: string): NavGroup | null {
  return navGroups.find((g) => g.children.some((c) => isChildActive(c, pathname, g.children))) || null
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
      {to: '/devotions/scriptures', label: 'Scripture', icon: BookOpen},
      {to: '/devotions/passages', label: 'Passages', icon: Sparkles},
      {to: '/devotions/audit', label: 'Audit', icon: AlertTriangle},
      {to: '/devotions/gwendolyn', label: 'Gwendolyn', icon: Smartphone},
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
  {
    id: 'sermons',
    label: 'Sermon Prep',
    icon: ScrollText,
    children: [
      {to: '/sermons/quotes', label: 'All Quotes', icon: Quote, end: true},
      {to: '/sermons/searches', label: 'Quote Research', icon: Sparkles, matchPaths: ['/sermons/research']},
      {to: '/sermons/verse-strips', label: 'Verse Strips', icon: Scissors},
    ],
  },
  {
    id: 'music',
    label: 'Music',
    icon: Music,
    children: [
      {to: '/music/specials', label: 'Specials', icon: Sparkles},
      {
        to: '/music/hymns/searches',
        label: 'Song Services',
        icon: Music,
        matchPaths: ['/music/hymns'],
      },
    ],
  },
  {
    id: 'calendar',
    label: 'Calendar',
    icon: Calendar,
    children: [
      {to: '/calendar', label: 'Upcoming', icon: Calendar, end: true},
      {to: '/rsvp', label: 'RSVPs', icon: CheckSquare},
      {to: '/calendar/print', label: 'Print', icon: Printer},
    ],
  },
]
