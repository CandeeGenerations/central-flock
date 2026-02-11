'use client'

import {CircleCheckIcon, InfoIcon, Loader2Icon, OctagonXIcon, TriangleAlertIcon} from 'lucide-react'
import {useEffect, useState} from 'react'
import {Toaster as Sonner, type ToasterProps} from 'sonner'

function useIsDark() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'))
  useEffect(() => {
    const observer = new MutationObserver(() => {
      setDark(document.documentElement.classList.contains('dark'))
    })
    observer.observe(document.documentElement, {attributes: true, attributeFilter: ['class']})
    return () => observer.disconnect()
  }, [])
  return dark
}

const Toaster = ({...props}: ToasterProps) => {
  const isDark = useIsDark()

  return (
    <Sonner
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4 text-emerald-500" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      style={
        {
          '--normal-bg': 'var(--color-popover)',
          '--normal-text': 'var(--color-popover-foreground)',
          '--normal-border': 'var(--color-border)',
          '--success-bg': isDark ? 'oklch(0.25 0.06 155)' : 'oklch(0.97 0.02 155)',
          '--success-text': isDark ? 'oklch(0.85 0.1 155)' : 'oklch(0.3 0.08 155)',
          '--success-border': isDark ? 'oklch(0.4 0.1 155)' : 'oklch(0.85 0.1 155)',
          '--error-bg': 'var(--color-popover)',
          '--error-text': 'var(--color-popover-foreground)',
          '--error-border': 'var(--color-border)',
          '--border-radius': 'var(--radius)',
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export {Toaster}
