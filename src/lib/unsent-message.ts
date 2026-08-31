// An Unsent Message is the compose form captured while typing, so an iOS standalone
// reload cannot lose it. It is deliberately NOT a Draft: it lives only in this device's
// localStorage and never appears in the Drafts tab, the dashboard stat, the command
// palette, or the drafts count. See docs/adr/0035-unsent-message-device-local.md.

const PREFIX = 'flock:unsent:'
const DISMISSED_KEY = 'flock:unsent-dismissed'
const TTL_MS = 7 * 24 * 60 * 60 * 1000

export type UnsentEnvelope<T> = {savedAt: number; data: T}

/**
 * Scopes a buffer to what is being composed, so it is only ever restored in the context
 * it was captured in. A `:new` buffer is never offered inside an open draft, and vice versa.
 */
export function unsentKey(params: {draftId?: number | null; editMessageId?: string | null}): string {
  if (params.editMessageId) return `${PREFIX}msg:${params.editMessageId}`
  if (params.draftId) return `${PREFIX}draft:${params.draftId}`
  return `${PREFIX}new`
}

export function readUnsent<T>(key: string): UnsentEnvelope<T> | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const env = JSON.parse(raw) as UnsentEnvelope<T>
    if (!env || typeof env.savedAt !== 'number') return null
    if (Date.now() - env.savedAt > TTL_MS) {
      clearUnsent(key)
      return null
    }
    return env
  } catch {
    return null
  }
}

export function writeUnsent<T>(key: string, data: T): void {
  try {
    localStorage.setItem(key, JSON.stringify({savedAt: Date.now(), data} satisfies UnsentEnvelope<T>))
  } catch {
    // Storage full or unavailable — autosave is best-effort by design.
  }
}

export function clearUnsent(key: string): void {
  try {
    localStorage.removeItem(key)
    const dismissed = readDismissed()
    if (key in dismissed) {
      delete dismissed[key]
      localStorage.setItem(DISMISSED_KEY, JSON.stringify(dismissed))
    }
  } catch {
    /* ignore */
  }
}

function readDismissed(): Record<string, number> {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY)
    return raw ? (JSON.parse(raw) as Record<string, number>) : {}
  } catch {
    return {}
  }
}

/**
 * Hides the Home notice without touching the buffer. Dismissing says "stop reminding me",
 * never "throw it away" — discarding is only ever done from the compose page, where the
 * text being discarded is visible. Re-arms if the buffer is written again afterwards.
 */
export function dismissUnsent(key: string): void {
  try {
    const dismissed = readDismissed()
    dismissed[key] = Date.now()
    localStorage.setItem(DISMISSED_KEY, JSON.stringify(dismissed))
  } catch {
    /* ignore */
  }
}

/** Every live, non-dismissed buffer. Expired entries are swept as a side effect. */
export function listUnsent(): {key: string; savedAt: number}[] {
  const out: {key: string; savedAt: number}[] = []
  try {
    const dismissed = readDismissed()
    for (const key of Object.keys(localStorage)) {
      if (!key.startsWith(PREFIX)) continue
      const env = readUnsent(key)
      if (!env) continue
      if ((dismissed[key] ?? 0) >= env.savedAt) continue
      out.push({key, savedAt: env.savedAt})
    }
  } catch {
    /* ignore */
  }
  return out.sort((a, b) => b.savedAt - a.savedAt)
}

/** The compose URL that reopens a buffer's context. */
export function unsentComposeHref(key: string): string {
  const rest = key.slice(PREFIX.length)
  if (rest.startsWith('draft:')) return `/messages/compose?draftId=${rest.slice('draft:'.length)}`
  if (rest.startsWith('msg:')) return `/messages/compose?editMessageId=${rest.slice('msg:'.length)}`
  return '/messages/compose'
}
