import {CommandPaletteContext} from '@/components/command-palette-context'
import {useContext} from 'react'

export function useCommandPalette() {
  const ctx = useContext(CommandPaletteContext)
  if (!ctx) throw new Error('useCommandPalette must be used within <CommandPaletteProvider>')
  return ctx
}
