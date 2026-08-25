import type {ZoomMode} from '@/components/print/scaled-page'
import {Button} from '@/components/ui/button'
import {Check, Download, FileImage, MessageSquare, Pencil} from 'lucide-react'

// ADR 0021: a fixed page box on a narrow viewport renders 12pt body text far
// smaller than 12pt, so every sheet that prints from one carries a zoom stepper.
const ZOOMS: {value: ZoomMode; label: string}[] = [
  {value: 'fit', label: 'Fit'},
  {value: 1, label: '100%'},
  {value: 1.5, label: '150%'},
]

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
  zoom: ZoomMode
  onZoomChange: (z: ZoomMode) => void
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
  zoom,
  onZoomChange,
}: ScheduleActionsToolbarProps) {
  const isDraft = status === 'draft'
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="mr-1 flex gap-1">
        {ZOOMS.map((z) => (
          <Button
            key={String(z.value)}
            size="sm"
            variant={zoom === z.value ? 'default' : 'outline'}
            onClick={() => onZoomChange(z.value)}
          >
            {z.label}
          </Button>
        ))}
      </div>
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
