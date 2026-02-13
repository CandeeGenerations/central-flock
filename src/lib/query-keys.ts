export const queryKeys = {
  people: ['people'] as const,
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
  nonMembers: (groupId: string | number, search?: string) => {
    if (search !== undefined) return ['nonMembers', String(groupId), search] as const
    return ['nonMembers', String(groupId)] as const
  },
}
