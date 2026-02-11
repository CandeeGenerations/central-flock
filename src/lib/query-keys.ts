export const queryKeys = {
  people: ['people'] as const,
  person: (id: string | number) => ['person', String(id)] as const,
  groups: ['groups'] as const,
  group: (id: string | number) => ['group', String(id)] as const,
  messages: (search?: string) => ['messages', search] as const,
  message: (id: string | number) => ['message', String(id)] as const,
  drafts: (search?: string) => ['drafts', search] as const,
  draft: (id: number) => ['draft', id] as const,
  templates: (search?: string) => ['templates', search] as const,
  template: (id: number) => ['template', id] as const,
  nonMembers: (groupId: string | number, search?: string) => ['nonMembers', String(groupId), search] as const,
}
