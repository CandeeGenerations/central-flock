import {useEffect, useState} from 'react'

const STORAGE_KEY = 'sidebar-collapsed'

export function useSidebarCollapsed() {
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem(STORAGE_KEY) === '1'
  })

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, collapsed ? '1' : '0')
  }, [collapsed])

  return [collapsed, setCollapsed] as const
}
