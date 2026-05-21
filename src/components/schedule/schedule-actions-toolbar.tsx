import {Button} from '@/components/ui/button'
import {Check, Download, FileImage, MessageSquare, Pencil} from 'lucide-react'

interface ScheduleActionsToolbarProps {
  status: 'draft' | 'final'
  editMode: boolean
  onToggleEdit: () => void
  onFinalize: () => void
  onReopen: () => void
  onExport: (format: 'pdf' | 'jpg') => void
  onSend: () => void
  finalizing?: boolean
  reopening?: boolean
}

export function ScheduleActionsToolbar({
  status,
  editMode,
  onToggleEdit,
  onFinalize,
  onReopen,
  onExport,
  onSend,
  finalizing,
  reopening,
}: ScheduleActionsToolbarProps) {
  const isDraft = status === 'draft'
  return (
    <div className="flex flex-wrap items-center gap-2">
      {isDraft && (
        <>
          <Button variant="outline" size="sm" className="hidden md:flex" onClick={onToggleEdit}>
            <Pencil className="mr-1 h-4 w-4" />
            {editMode ? 'Preview' : 'Edit'}
          </Button>
          <Button size="sm" className="hidden md:flex" onClick={onFinalize} disabled={finalizing}>
            <Check className="mr-1 h-4 w-4" />
            Finalize
          </Button>
        </>
      )}
      {!isDraft && (
        <Button variant="outline" size="sm" className="hidden md:flex" onClick={onReopen} disabled={reopening}>
          Reopen as Draft
        </Button>
      )}
      <Button
        variant="outline"
        size="sm"
        className="hidden md:flex"
        onClick={() => onExport('pdf')}
        disabled={isDraft}
        title={isDraft ? 'Finalize the schedule to export' : undefined}
      >
        <Download className="mr-1 h-4 w-4" />
        PDF
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="hidden md:flex"
        onClick={() => onExport('jpg')}
        disabled={isDraft}
        title={isDraft ? 'Finalize the schedule to export' : undefined}
      >
        <FileImage className="mr-1 h-4 w-4" />
        JPG
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={onSend}
        disabled={isDraft}
        title={isDraft ? 'Finalize the schedule to send' : undefined}
      >
        <MessageSquare className="mr-1 h-4 w-4" />
        Send
      </Button>
    </div>
  )
}
