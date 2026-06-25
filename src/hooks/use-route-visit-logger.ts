import {recordVisit} from '@/lib/usage-api'
import {useEffect, useRef} from 'react'
import {useLocation} from 'react-router-dom'

// Logs each distinct pathname visit to the server (one shell-level hook — no
// per-page code). Skips consecutive duplicates so refreshes/re-renders don't
// inflate frecency.
export function useRouteVisitLogger(): void {
  const {pathname} = useLocation()
  const last = useRef<string | null>(null)
  useEffect(() => {
    if (last.current === pathname) return
    last.current = pathname
    recordVisit(pathname)
  }, [pathname])
}
