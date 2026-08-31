import {clearUnsent, writeUnsent} from '@/lib/unsent-message'
import {useCallback, useEffect, useRef} from 'react'

const DEBOUNCE_MS = 500

type Options<T> = {
  /** Scopes the buffer to what is being composed. See `unsentKey`. */
  key: string
  /** The current form, serialized the same way every time. */
  snapshot: T
  /** The form as it was when it finished loading; null until then. */
  baseline: string | null
  /** False until the server copy (if any) has populated the form. */
  enabled: boolean
}

/**
 * Writes the compose form to localStorage as an Unsent Message.
 *
 * Deliberately holds no state: the snapshot lives in a ref and the debounce is a bare
 * setTimeout, so typing never causes a re-render of the compose page. `useDebouncedValue`
 * cannot be used here — it re-renders on every debounce tick.
 *
 * Also flushes synchronously on pagehide/visibilitychange, which is the case that
 * actually matters: iOS freezes a backgrounded standalone app, so a pending debounce
 * timer never fires. `beforeunload` is not a substitute — it is unreliable on iOS.
 *
 * Restoring is done by the caller as a render-time adjustment, so that it sequences after
 * the server copy has populated the form. See docs/adr/0035-unsent-message-device-local.md.
 */
export function useUnsentAutosave<T>({key, snapshot, baseline, enabled}: Options<T>) {
  const latest = useRef({key, snapshot, baseline, enabled})

  const flush = useCallback(() => {
    const current = latest.current
    if (!current.enabled || current.baseline === null) return
    // Back at the baseline means there is nothing unsaved left to recover.
    if (JSON.stringify(current.snapshot) === current.baseline) clearUnsent(current.key)
    else writeUnsent(current.key, current.snapshot)
  }, [])

  // No dependency array: this runs after every commit, so each keystroke resets the
  // timer. That is the debounce, and it costs no state and no extra render.
  useEffect(() => {
    latest.current = {key, snapshot, baseline, enabled}
    if (!enabled || baseline === null) return
    const timer = setTimeout(flush, DEBOUNCE_MS)
    return () => clearTimeout(timer)
  })

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') flush()
    }
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      window.removeEventListener('pagehide', flush)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [flush])
}
