import {useCallback, useEffect, useRef, useState} from 'react'

import {AutosaveQueue, type AutosaveStatus} from './autosave-queue'

export type {AutosaveStatus}

/**
 * Autosave for one resource (a service's order, its booth lines, its fields).
 * Saves wait `delayMs` after typing, or go now with `{immediate: true}`; leaving
 * the page or backgrounding the tab (iPad Safari) saves at once.
 */
export function useAutosave<T>(opts: {
  save: (value: T) => Promise<unknown>
  delayMs?: number
  merge?: (older: T, newer: T) => T
}): {
  schedule: (value: T, opts?: {immediate?: boolean}) => void
  flush: () => Promise<void>
  status: AutosaveStatus
  retry: () => void
  dirty: boolean
  /** Read now, not as of the last render — for deciding after an awaited flush. */
  isDirty: () => boolean
} {
  const [state, setState] = useState<{status: AutosaveStatus; dirty: boolean}>({status: 'idle', dirty: false})
  // The latest save function, so a save always uses this render's ids and callbacks.
  const saveRef = useRef(opts.save)
  useEffect(() => {
    saveRef.current = opts.save
  })
  // The ref is only dereferenced when a save runs, never during render.
  // oxlint-disable-next-line react-hooks/refs
  const [queue] = useState(() => makeQueue<T>(saveRef, opts, setState))

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') void queue.flush()
    }
    const onPageHide = () => void queue.flush()
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', onPageHide)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('pagehide', onPageHide)
      // Unmounting is leaving the page: send what is waiting rather than drop it.
      void queue.flush().finally(() => queue.dispose())
    }
  }, [queue])

  const schedule = useCallback((value: T, o?: {immediate?: boolean}) => queue.schedule(value, o), [queue])
  const flush = useCallback(() => queue.flush(), [queue])
  const retry = useCallback(() => queue.retry(), [queue])
  const isDirty = useCallback(() => queue.dirty || queue.status === 'error', [queue])

  return {schedule, flush, retry, isDirty, status: state.status, dirty: state.dirty}
}

/** Built outside the component: the save is read from the ref only when a save runs. */
function makeQueue<T>(
  saveRef: {current: (value: T) => Promise<unknown>},
  opts: {delayMs?: number; merge?: (older: T, newer: T) => T},
  onChange: (state: {status: AutosaveStatus; dirty: boolean}) => void,
) {
  return new AutosaveQueue<T>({
    save: (value) => saveRef.current(value),
    delayMs: opts.delayMs,
    merge: opts.merge,
    onChange,
  })
}

/** Several autosaves shown as one indicator: the worst state wins. */
export function combineStatus(statuses: AutosaveStatus[]): AutosaveStatus {
  if (statuses.includes('error')) return 'error'
  if (statuses.includes('saving')) return 'saving'
  if (statuses.includes('saved')) return 'saved'
  return 'idle'
}
