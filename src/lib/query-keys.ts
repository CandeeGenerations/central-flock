export const queryKeys = {
  home: ['home'] as const,
  stats: ['stats'] as const,
  statsOverTime: ['stats-over-time'] as const,
  people: ['people'] as const,
  duplicates: ['duplicates'] as const,
  person: (id: string | number) => ['person', String(id)] as const,
  groups: ['groups'] as const,
  group: (id: string | number) => ['group', String(id)] as const,
  messages: (search?: string) => {
    if (search !== undefined) return ['messages', search] as const
    return ['messages'] as const
  },
  message: (id: string | number) => ['message', String(id)] as const,
  drafts: (search?: string) => {
    if (search !== undefined) return ['drafts', search] as const
    return ['drafts'] as const
  },
  draft: (id: number) => ['draft', id] as const,
  templates: (search?: string) => {
    if (search !== undefined) return ['templates', search] as const
    return ['templates'] as const
  },
  template: (id: number) => ['template', id] as const,
  globalVariables: (search?: string) => {
    if (search !== undefined) return ['globalVariables', search] as const
    return ['globalVariables'] as const
  },
  globalVariable: (id: number) => ['globalVariable', id] as const,
  settings: ['settings'] as const,
  nonMembers: (groupId: string | number, search?: string) => {
    if (search !== undefined) return ['nonMembers', String(groupId), search] as const
    return ['nonMembers', String(groupId)] as const
  },
  gwendolynDevotions: (search?: string, status?: string) => {
    if (search !== undefined || status !== undefined) return ['gwendolynDevotions', search ?? '', status ?? ''] as const
    return ['gwendolynDevotions'] as const
  },
  gwendolynDevotional: (id: number) => ['gwendolynDevotional', id] as const,
  calendarPrintPage: (year: number, month: number) => ['calendarPrintPage', year, month] as const,
  calendarPrintDefaultSchedule: ['calendarPrintDefaultSchedule'] as const,
  rsvpLists: (archived: boolean) => ['rsvpLists', archived] as const,
  rsvpList: (id: number | string) => ['rsvpList', String(id)] as const,
  rsvpCalendarEvents: ['rsvpCalendarEvents'] as const,
  rsvpNonEntries: (listId: number | string, search?: string) => {
    if (search !== undefined) return ['rsvpNonEntries', String(listId), search] as const
    return ['rsvpNonEntries', String(listId)] as const
  },
  specials: ['specials'] as const,
}
