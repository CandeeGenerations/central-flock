export function formatFullName(
  person: {firstName?: string | null; lastName?: string | null},
  fallback = 'Unnamed',
): string {
  return [person.firstName, person.lastName].filter(Boolean).join(' ') || fallback
}

export function renderTemplate(
  template: string,
  person: {firstName?: string | null; lastName?: string | null},
  customVarValues?: Record<string, string>,
): string {
  let result = template
    .replace(/\{\{firstName\}\}/g, person.firstName || '')
    .replace(/\{\{lastName\}\}/g, person.lastName || '')
    .replace(/\{\{fullName\}\}/g, [person.firstName, person.lastName].filter(Boolean).join(' '))
  if (customVarValues) {
    for (const [name, value] of Object.entries(customVarValues)) {
      result = result.replace(new RegExp(`\\{\\{${name}\\}\\}`, 'g'), value)
    }
  }
  return result
}
