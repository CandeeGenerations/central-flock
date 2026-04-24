import {createContext} from 'react'

export interface CommandPaletteContextValue {
  open: boolean
  setOpen: (v: boolean) => void
  toggle: () => void
}

export const CommandPaletteContext = createContext<CommandPaletteContextValue | null>(null)
