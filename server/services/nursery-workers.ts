// A Nursery Worker is a Person; `name` is a nullable override for what the
// printed roster shows — worker "Yuny Mejia" is contact "Juni Salgado".
// The roster deliberately ignores the contact's displayFirstNameOnly
// preference: it is a work roster, not a program. See CONTEXT.md (Nursery).
export function workerDisplayName(override: string | null, firstName: string | null, lastName: string | null): string {
  if (override?.trim()) return override.trim()
  return `${firstName ?? ''} ${lastName ?? ''}`.trim() || 'Unnamed'
}
