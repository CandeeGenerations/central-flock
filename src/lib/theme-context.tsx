import {createContext, useCallback, useContext, useEffect, useState} from 'react'

export type ThemeMode = 'light' | 'dark' | 'system'

interface ThemeContextValue {
  mode: ThemeMode
  setMode: (mode: ThemeMode) => void
  isDark: boolean
  toggleDark: () => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

function getSystemDark() {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
}

function resolveIsDark(mode: ThemeMode): boolean {
  if (mode === 'system') return getSystemDark()
  return mode === 'dark'
}

export function ThemeProvider({children}: {children: React.ReactNode}) {
  const [mode, setModeState] = useState<ThemeMode>(() => {
    if (typeof window === 'undefined') return 'light'
    const saved = localStorage.getItem('theme')
    if (saved === 'dark' || saved === 'light' || saved === 'system') return saved
    return 'light'
  })
  const [isDark, setIsDark] = useState(() => {
    const dark = resolveIsDark(mode)
    if (typeof document !== 'undefined') document.documentElement.classList.toggle('dark', dark)
    return dark
  })

  const applyDark = useCallback((dark: boolean) => {
    document.documentElement.classList.toggle('dark', dark)
    setIsDark(dark)
  }, [])

  const setMode = useCallback(
    (m: ThemeMode) => {
      setModeState(m)
      localStorage.setItem('theme', m)
      applyDark(resolveIsDark(m))
    },
    [applyDark],
  )

  const toggleDark = useCallback(() => {
    setMode(isDark ? 'light' : 'dark')
  }, [isDark, setMode])

  // Listen for system theme changes when mode is 'system'
  useEffect(() => {
    if (mode !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (e: MediaQueryListEvent) => applyDark(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [mode, applyDark])

  return <ThemeContext.Provider value={{mode, setMode, isDark, toggleDark}}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}
