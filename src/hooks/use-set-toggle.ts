import type {Dispatch, SetStateAction} from 'react'

export function useSetToggle<T>(setItems: Dispatch<SetStateAction<Set<T>>>): (item: T) => void {
  return (item: T) => {
    setItems((prev) => {
      const next = new Set(prev)
      if (next.has(item)) next.delete(item)
      else next.add(item)
      return next
    })
  }
}
