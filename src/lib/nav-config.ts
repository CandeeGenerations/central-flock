import {
  AlertTriangle,
  Baby,
  BarChart3,
  Book,
  BookOpen,
  Calendar,
  CalendarDays,
  CheckSquare,
  Church,
  ClipboardList,
  Clock,
  Contact,
  FileText,
  FolderOpen,
  GraduationCap,
  LayoutDashboard,
  List,
  ListMusic,
  MessageCircle,
  MessageSquare,
  Music,
  Printer,
  Quote,
  Scissors,
  ScrollText,
  Settings,
  Share2,
  Smartphone,
  Sparkles,
  Tent,
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
    id: 'people',
    label: 'People',
    icon: Users,
    children: [
      {to: '/people', label: 'Contacts', icon: Contact},
      {to: '/groups', label: 'Groups', icon: FolderOpen},
    ],
  },
  {
    id: 'messaging',
    label: 'Messaging',
    icon: MessageSquare,
    children: [
      {to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard},
      {to: '/messages', label: 'Messages', icon: MessageCircle},
      {to: '/rsvp', label: 'RSVPs', icon: CheckSquare},
      {to: '/templates', label: 'Templates', icon: FileText},
    ],
  },
  {
    id: 'devotions',
    label: 'Devotionals',
    icon: BookOpen,
    children: [
      {to: '/devotions/stats', label: 'Dashboard', icon: LayoutDashboard},
      {to: '/devotions', label: 'Devotions', icon: List, end: true},
      {to: '/devotions/scriptures', label: 'Scriptures', icon: Book},
      {to: '/devotions/passages', label: 'Passages', icon: Sparkles},
      {to: '/devotions/audit', label: 'Auditing', icon: AlertTriangle},
      {to: '/devotions/gwendolyn', label: 'Gwendolyn’s', icon: Smartphone},
    ],
  },
  {
    id: 'schedules',
    label: 'Schedules',
    icon: Clock,
    children: [
      {to: '/special-music', label: 'Special Music', icon: Music, end: true},
      {to: '/nursery', label: 'Nursery', icon: Baby, end: true},
      {to: '/schedules/fair-booth', label: 'Fair Booth', icon: Tent},
      {to: '/schedules/music', label: 'Music Schedule', icon: ListMusic},
      {to: '/schedules/sunday-school', label: 'Workers’ Notes', icon: GraduationCap},
      {to: '/schedules/sunday-school-rolls', label: 'Sunday School Roll', icon: ClipboardList},
      {
        to: '/schedules/settings',
        label: 'Settings',
        icon: Settings,
        matchPaths: ['/nursery/settings', '/nursery/workers'],
      },
    ],
  },
  {
    id: 'attendance',
    // Group id deliberately unchanged: route_visits frecency history keys off
    // it, and /attendance keeps its path for the same reason. See ADR 0012.
    label: 'Ministry Stats',
    icon: BarChart3,
    children: [
      {to: '/attendance', label: 'Main Services', icon: Church, end: true},
      {to: '/sunday-school/stats', label: 'Sunday School', icon: GraduationCap},
      {
        to: '/attendance/settings',
        label: 'Settings',
        icon: Settings,
        matchPaths: ['/attendance/times', '/attendance/recorders'],
      },
    ],
  },
  {
    id: 'calendar',
    label: 'Calendar',
    icon: Calendar,
    children: [
      {to: '/calendar', label: 'Upcoming', icon: CalendarDays, end: true},
      {to: '/calendar/print', label: 'Print', icon: Printer},
    ],
  },
  {
    id: 'sermons',
    label: 'Sermons',
    icon: ScrollText,
    children: [
      {to: '/sermons/quotes', label: 'Quotes', icon: Quote, end: true},
      {to: '/sermons/searches', label: 'Quote Searches', icon: Sparkles, matchPaths: ['/sermons/research']},
      {to: '/sermons/social', label: 'Social Content', icon: Share2},
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
        icon: ListMusic,
        matchPaths: ['/music/hymns'],
      },
    ],
  },
]
