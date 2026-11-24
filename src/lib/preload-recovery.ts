// After a deploy the built chunk files are replaced, so a tab opened before it asks for a lazy
// page chunk that no longer exists. Reload once to pick up the new build. If that reload also
// fails (within RETRY_WINDOW_MS), let the error reach PageErrorBoundary instead of looping.

const STORAGE_KEY = 'cf:preload-reload-at'
const RETRY_WINDOW_MS = 10_000

export function shouldReload(now: number, lastReloadAt: number | null): boolean {
  return lastReloadAt === null || now - lastReloadAt > RETRY_WINDOW_MS
}

function readLastReloadAt(): number | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    const value = raw === null ? NaN : Number(raw)
    return Number.isFinite(value) ? value : null
  } catch {
    return null
  }
}

export function installPreloadRecovery(): void {
  window.addEventListener('vite:preloadError', (event) => {
    const now = Date.now()
    if (!shouldReload(now, readLastReloadAt())) return
    try {
      sessionStorage.setItem(STORAGE_KEY, String(now))
    } catch {
      // Private mode or storage full: reloading once is still better than a dead page.
    }
    event.preventDefault()
    window.location.reload()
  })
}
