import {Button} from '@/components/ui/button'
import {ArrowLeft} from 'lucide-react'
import type {ReactNode} from 'react'
import {useNavigate} from 'react-router-dom'

/** Common chrome for the four edit sub-pages: back arrow, title, optional aside. */
export function EditShell({
  editionId,
  title,
  subtitle,
  actions,
  children,
}: {
  editionId: number
  title: string
  subtitle?: ReactNode
  actions?: ReactNode
  children: ReactNode
}) {
  const navigate = useNavigate()
  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(`/schedules/sunday-school/${editionId}`)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h2 className="text-2xl font-bold">{title}</h2>
        {actions ? <div className="ml-auto flex items-center gap-2">{actions}</div> : null}
      </div>
      {subtitle ? <p className="text-muted-foreground text-sm">{subtitle}</p> : null}
      {children}
    </div>
  )
}
