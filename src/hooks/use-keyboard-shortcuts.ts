import {useEffect} from 'react'
import {useNavigate} from 'react-router-dom'

const NAV_ROUTES = ['/people', '/groups', '/messages', '/templates', '/import']

export function useKeyboardShortcuts(onShowHelp: () => void) {
  const navigate = useNavigate()

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      const target = e.target as HTMLElement
      const tag = target.tagName
      const isEditing =
        tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable

      // ⌘K / Ctrl+K — focus search input on current page
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        const container = document.querySelector('[data-search-input]')
        const input = container?.querySelector('input')
        if (input) {
          input.focus()
          input.select()
        }
        return
      }

      // ⌘J / Ctrl+J — quick compose
      if ((e.metaKey || e.ctrlKey) && e.key === 'j') {
        e.preventDefault()
        navigate('/messages/compose')
        return
      }

      // ⌘1-5 / Ctrl+1-5 — navigate between pages
      if ((e.metaKey || e.ctrlKey) && e.key >= '1' && e.key <= '5') {
        e.preventDefault()
        const index = Number(e.key) - 1
        if (NAV_ROUTES[index]) {
          navigate(NAV_ROUTES[index])
        }
        return
      }

      // Don't handle remaining shortcuts when editing text
      if (isEditing) return

      // ? — show help dialog
      if (e.key === '?') {
        e.preventDefault()
        onShowHelp()
        return
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [navigate, onShowHelp])
}
