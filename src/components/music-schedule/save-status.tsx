import {Button} from '@/components/ui/button'
import type {AutosaveStatus} from '@/hooks/use-autosave'
import {AlertTriangle, Check, Loader2} from 'lucide-react'

/**
 * The page's one save indicator. "Saved" means the server answered; a failure
 * stays red until a save lands, never a toast that fades.
 */
export function SaveStatus({status, onRetry}: {status: AutosaveStatus; onRetry: () => void}) {
  if (status === 'error')
    return (
      <span className="flex items-center gap-2 rounded bg-red-100 px-2 py-1 text-xs font-medium text-red-800 dark:bg-red-950 dark:text-red-200">
        <AlertTriangle className="h-3.5 w-3.5" />
        Not saved
        <Button size="sm" variant="destructive" className="h-6 px-2 text-xs" onClick={onRetry}>
          Retry
        </Button>
      </span>
    )
  if (status === 'saving')
    return (
      <span className="text-muted-foreground flex items-center gap-1 text-xs">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Saving…
      </span>
    )
  if (status === 'saved')
    return (
      <span className="text-muted-foreground flex items-center gap-1 text-xs">
        <Check className="h-3.5 w-3.5" />
        Saved
      </span>
    )
  return null
}
