import {Progress} from '@/components/ui/progress'
import {cn} from '@/lib/utils'

interface AIProgressProps {
  message: string | null
  progress: number
  className?: string
}

export function AIProgress({message, progress, className}: AIProgressProps) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <Progress value={progress} className="h-1.5" />
      {message && <p className="text-xs text-muted-foreground">{message}</p>}
    </div>
  )
}
