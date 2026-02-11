export function formatFullName(
  person: {firstName?: string | null; lastName?: string | null},
  fallback = 'Unnamed',
): string {
  return [person.firstName, person.lastName].filter(Boolean).join(' ') || fallback
}

export function renderTemplate(
  template: string,
  person: {firstName?: string | null; lastName?: string | null},
): string {
  return template
    .replace(/\{\{firstName\}\}/g, person.firstName || '')
    .replace(/\{\{lastName\}\}/g, person.lastName || '')
    .replace(/\{\{fullName\}\}/g, [person.firstName, person.lastName].filter(Boolean).join(' '))
}
