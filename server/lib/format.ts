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
  const firstName = person.firstName || ''
  const lastName = person.lastName || ''
  const fullName = [firstName, lastName].filter(Boolean).join(' ')
  return template
    .replace(/\{\{firstName\}\}/g, firstName)
    .replace(/\{\{lastName\}\}/g, lastName)
    .replace(/\{\{fullName\}\}/g, fullName)
}
