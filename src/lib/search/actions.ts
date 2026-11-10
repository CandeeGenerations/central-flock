import {navGroups} from '@/lib/nav-config'
import type {ActionsBuildContext, SearchActionContext, SearchItem} from '@/lib/search/registry'
import {
  Baby,
  BookOpen,
  CalendarPlus,
  Camera,
  CheckSquare,
  ClipboardList,
  FileText,
  FolderPlus,
  GraduationCap,
  HandHeart,
  LayoutDashboard,
  ListMusic,
  Mail,
  Megaphone,
  Moon,
  Music,
  Quote,
  ScanLine,
  SearchX,
  Settings,
  Sparkles,
  Tent,
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
    nav('/devotions/scan', 'Devotion Scan', ScanLine, ['scan', 'ocr', 'sheet', 'import']),
    nav('/devotions/missing', 'Devotion Missing', SearchX, ['missing', 'gaps', 'incomplete']),
    nav('/music/hymns', 'Hymn Prep', Music, ['hymn', 'prep', 'song service']),
    nav('/sermons/research', 'Sermon Research', Sparkles, ['research']),
    nav('/import', 'Import CSV', Upload, ['upload']),
    nav('/import/contacts', 'Import Mac Contacts', Upload),
    nav('/settings', 'Settings', Settings),
    // Settings sections are routed panes off a left rail, so they are not
    // sidebar entries and need naming here explicitly.
    nav('/attendance/settings/times', 'Ministry Stats Settings Service Times', Settings, [
      'service times',
      'attendance',
    ]),
    nav('/attendance/settings/recorders', 'Ministry Stats Settings Recorders', Settings, [
      'recorders',
      'attendance',
      'public link',
    ]),
    nav('/attendance/settings/departments', 'Ministry Stats Settings Departments', Settings, [
      'departments',
      'sunday school',
      'classes',
    ]),
    nav('/attendance/settings/households', 'Ministry Stats Settings Households', Settings, [
      'households',
      'fill america',
    ]),
    nav('/schedules/settings/general', 'Document Settings General', Settings, ['logo', 'compact logo']),
    nav('/schedules/settings/music', 'Document Settings Music Schedule', Settings, [
      'music schedule',
      'sound booth',
      'service headings',
      'footer',
    ]),
    nav('/schedules/settings/prayer-sheet', 'Document Settings Prayer Sheet', Settings, [
      'prayer',
      'ministry list',
      'color rotation',
    ]),
    nav('/schedules/settings/nursery/defaults', 'Document Settings Nursery Defaults', Settings, [
      'nursery',
      'worker counts',
    ]),
    nav('/schedules/settings/nursery/workers', 'Document Settings Nursery Workers', Settings, [
      'nursery',
      'roster',
      'workers',
    ]),
    nav('/schedules/settings/special-music', 'Document Settings Special Music', Settings, ['singers', 'households']),
    nav('/schedules/settings/sunday-school/defaults', 'Document Settings Sunday School Defaults', Settings, [
      'workers notes',
      'bullets',
      'church name',
    ]),
    nav('/schedules/settings/sunday-school/themes', 'Document Settings Yearly Themes', Settings, [
      'theme song',
      'chorus',
      'growth plan',
      'sunday school',
    ]),
    nav('/schedules/settings/sunday-school/lessons', 'Document Settings Betty Lukens Lessons', Settings, [
      'catalogue',
      'stories',
      'sunday school',
    ]),
    nav('/schedules/settings/sunday-school-roll', 'Document Settings Sunday School Roll', Settings, [
      'roll',
      'sunday school',
      'attendance',
    ]),
    nav('/schedules/settings/fair-booth', 'Document Settings Fair Booth', Settings, ['roster', 'reminders']),
  ]
  return [...nonNavRoutes, ...fromSidebar]
}

function create(id: string, label: string, icon: SearchItem['icon'], to: string, keywords: string[]): SearchItem {
  return {
    id: `create-${id}`,
    label,
    group: 'Create',
    icon,
    keywords: ['new', ...keywords],
    action: ({navigate, close}) => {
      navigate(to)
      close()
    },
  }
}

export function buildCreateActions(ctx: ActionsBuildContext): SearchItem[] {
  return [
    create('person', 'New Person', UserPlus, '/people?add=1', ['add', 'person', 'contact']),
    create('group', 'New Group', FolderPlus, '/groups?add=1', ['add', 'group']),
    create('message', 'New Message', Mail, '/messages/compose', ['compose', 'send', 'text', 'sms']),
    ...(ctx.prayerRequest.ready
      ? [
          {
            id: 'create-prayer-request',
            label: 'Prayer Request',
            group: 'Create',
            icon: HandHeart,
            keywords: ['prayer', 'chain', 'warriors', 'request', 'urgent'],
            action: ({navigate, close}: SearchActionContext) => {
              navigate(ctx.prayerRequest.href)
              close()
            },
          } satisfies SearchItem,
        ]
      : []),
    create('template', 'New Template', FileText, '/templates/new', ['template']),
    create('rsvp-list', 'New RSVP List', CheckSquare, '/rsvp?new=1', ['rsvp', 'event', 'attendance']),
    create('devotion', 'New Devotion', BookOpen, '/devotions/new', ['devotion']),
    create('devotion-scan', 'Scan Devotion Sheet', ScanLine, '/devotions/scan', ['scan', 'ocr', 'sheet', 'devotion']),
    create('gwendolyn', 'New Gwendolyn Devotion', BookOpen, '/devotions/gwendolyn/new', ['gwendolyn', 'devotion']),
    create('quote', 'New Quote', Quote, '/sermons/quotes?new=1', ['quote', 'sermon']),
    create('special', 'New Special', Sparkles, '/music/specials/new', [
      'special',
      'music',
      'performance',
      'solo',
      'duet',
      'trio',
    ]),
    create('music-week', 'New Music Schedule Week', ListMusic, '/schedules/music?new=1', [
      'music',
      'schedule',
      'week',
      'songs',
    ]),
    create('music-week-from-photos', 'New Music Schedule Week from Photos', Camera, '/schedules/music?scan=1', [
      'scan',
      'photo',
      'music',
      'schedule',
      'week',
      'pastor',
      'songs',
    ]),
    create('prayer-sheet', 'New Prayer Sheet Edition', HandHeart, '/prayer-sheet?new=1', [
      'prayer',
      'sheet',
      'edition',
    ]),
    create('prayer-sheet-import', 'Import Prayer Sheet Photo', Camera, '/prayer-sheet?import=1', [
      'prayer',
      'sheet',
      'photo',
      'scan',
      'import',
    ]),
    create('calendar-year-copy', 'Copy Calendar Year…', CalendarPlus, '/calendar/print?yearCopy=1', [
      'calendar',
      'print',
      'year',
      'copy',
    ]),
    create('nursery-schedule', 'Generate Nursery Schedule', Baby, '/nursery?new=1', [
      'generate',
      'nursery',
      'schedule',
    ]),
    create('special-music-schedule', 'New Special Music Schedule', Music, '/special-music?new=1', [
      'special music',
      'schedule',
    ]),
    create('workers-notes', 'New Workers’ Notes Edition', GraduationCap, '/schedules/sunday-school?new=1', [
      'workers notes',
      'sunday school',
      'edition',
    ]),
    create('sunday-school-roll', 'New Sunday School Roll', ClipboardList, '/schedules/sunday-school-rolls?new=1', [
      'sunday school',
      'roll',
      'attendance',
      'quarter',
    ]),
    create('fair-booth-schedule', 'New Fair Booth Schedule', Tent, '/schedules/fair-booth?new=1', [
      'fair',
      'booth',
      'schedule',
    ]),
    create('fill-america-campaign', 'New Fill America Campaign', Megaphone, '/fill-america?new=1', [
      'fill america',
      'campaign',
    ]),
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
  ]
}

export function buildAllActions(ctx: ActionsBuildContext): SearchItem[] {
  return [...buildNavigationActions(), ...buildCreateActions(ctx), ...buildCommandActions(ctx)]
}
