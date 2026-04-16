import {useEffect} from 'react'
import {useNavigate} from 'react-router-dom'

export function useKeyboardShortcuts(onToggleDark: () => void) {
  const navigate = useNavigate()

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      // ⌘D / Ctrl+D — toggle dark mode
      if ((e.metaKey || e.ctrlKey) && e.key === 'd') {
        e.preventDefault()
        onToggleDark()
        return
      }

      // ⌘, / Ctrl+, — open settings
      if ((e.metaKey || e.ctrlKey) && e.key === ',') {
        e.preventDefault()
        navigate('/settings')
        return
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [navigate, onToggleDark])
}
