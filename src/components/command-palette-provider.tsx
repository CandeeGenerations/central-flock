import {CommandPalette} from '@/components/command-palette'
import {CommandPaletteContext, type CommandPaletteContextValue} from '@/components/command-palette-context'
import {useCallback, useEffect, useMemo, useState} from 'react'

function focusNearestTableSearch() {
  const el = document.querySelector<HTMLInputElement>('[data-search-input] input')
  if (el) {
    el.focus()
    el.select()
  }
}

export function CommandPaletteProvider({children}: {children: React.ReactNode}) {
  const [open, setOpen] = useState(false)

  const toggle = useCallback(() => setOpen((v) => !v), [])

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey
      if (!mod) return
      if (e.key.toLowerCase() !== 'k') return

      e.preventDefault()
      if (e.shiftKey) {
        setOpen(false)
        focusNearestTableSearch()
      } else {
        setOpen((v) => !v)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const value = useMemo<CommandPaletteContextValue>(() => ({open, setOpen, toggle}), [open, toggle])

  return (
    <CommandPaletteContext.Provider value={value}>
      {children}
      <CommandPalette open={open} onOpenChange={setOpen} />
    </CommandPaletteContext.Provider>
  )
}
