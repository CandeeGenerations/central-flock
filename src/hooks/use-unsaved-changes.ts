import {useEffect} from 'react'
import {type Blocker, useBlocker} from 'react-router-dom'

/**
 * Holds the page while edits are still only in local state. Two exits are
 * covered: an in-app navigation — sidebar, command palette, a Back button, the
 * browser's own Back — comes back as a blocker the caller renders a dialog for,
 * and a reload or tab close gets the browser's native "leave site?" prompt.
 *
 * Requires the data router in App.tsx; useBlocker does not exist without one.
 */
export function useUnsavedChanges(dirty: boolean): Blocker {
  // Same-path navigations (a hash deep link into the page you are already on)
  // are not a way to lose work, so they pass through.
  const blocker = useBlocker(
    ({currentLocation, nextLocation}) => dirty && currentLocation.pathname !== nextLocation.pathname,
  )

  // A save that lands while the dialog is up clears the reason to hold the
  // page, so drop the block rather than leaving a stale dialog on screen.
  useEffect(() => {
    if (blocker.state === 'blocked' && !dirty) blocker.reset()
  }, [blocker, dirty])

  useEffect(() => {
    if (!dirty) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      // Older browsers still read returnValue; the string itself is ignored.
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty])

  return blocker
}
