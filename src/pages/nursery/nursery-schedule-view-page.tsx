import {NurserySchedulePreview} from '@/components/nursery/nursery-schedule-preview'
import {Button} from '@/components/ui/button'
import {Card, CardContent} from '@/components/ui/card'
import {Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle} from '@/components/ui/dialog'
import {Label} from '@/components/ui/label'
import {SearchableSelect} from '@/components/ui/searchable-select'
import {PageSpinner} from '@/components/ui/spinner'
import {Textarea} from '@/components/ui/textarea'
import {usePersistedState} from '@/hooks/use-persisted-state'
import {fetchPeople} from '@/lib/api'
import {
  fetchNurserySchedule,
  fetchNurserySettings,
  fetchNurseryWorkers,
  fetchServiceConfig,
  sendScheduleImage,
  updateAssignment,
  updateScheduleStatus,
} from '@/lib/nursery-api'
import {nurseryKeys} from '@/lib/nursery-query-keys'
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'
import {ArrowLeft, Check, Download, FileImage, MessageSquare, Pencil} from 'lucide-react'
import {useCallback, useMemo, useRef, useState} from 'react'
import {useNavigate, useParams} from 'react-router-dom'
import {toast} from 'sonner'

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

export function NurseryScheduleViewPage() {
  const {id} = useParams<{id: string}>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const previewRef = useRef<HTMLDivElement>(null)
  const [editMode, setEditMode] = useState(false)
  const [sendOpen, setSendOpen] = useState(false)
  const [sending, setSending] = useState(false)
  const [selectedRecipientId, setSelectedRecipientId] = usePersistedState<string>('nursery.lastRecipientId', '')
  const [caption, setCaption] = useState('')

  const {data: schedule, isLoading} = useQuery({
    queryKey: nurseryKeys.schedule(Number(id)),
    queryFn: () => fetchNurserySchedule(Number(id)),
  })

  const {data: serviceConfig} = useQuery({queryKey: nurseryKeys.serviceConfig, queryFn: fetchServiceConfig})
  const {data: workers} = useQuery({queryKey: nurseryKeys.workers, queryFn: fetchNurseryWorkers})
  const {data: settings} = useQuery({queryKey: nurseryKeys.settings, queryFn: fetchNurserySettings})

  const assignmentMutation = useMutation({
    mutationFn: ({assignmentId, workerId}: {assignmentId: number; workerId: number | null}) =>
      updateAssignment(assignmentId, workerId),
    onSuccess: () => {
      queryClient.invalidateQueries({queryKey: nurseryKeys.schedule(Number(id))})
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Failed to update'),
  })

  const finalizeMutation = useMutation({
    mutationFn: () => updateScheduleStatus(Number(id), 'final'),
    onSuccess: () => {
      queryClient.invalidateQueries({queryKey: nurseryKeys.schedule(Number(id))})
      queryClient.invalidateQueries({queryKey: nurseryKeys.schedules})
      setEditMode(false)
      toast.success('Schedule finalized')
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Failed to finalize'),
  })

  const reopenMutation = useMutation({
    mutationFn: () => updateScheduleStatus(Number(id), 'draft'),
    onSuccess: () => {
      queryClient.invalidateQueries({queryKey: nurseryKeys.schedule(Number(id))})
      queryClient.invalidateQueries({queryKey: nurseryKeys.schedules})
      toast.success('Schedule reopened as draft')
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Failed to reopen'),
  })

  const handleAssignmentChange = useCallback(
    (assignmentId: number, workerId: number | null) => {
      assignmentMutation.mutate({assignmentId, workerId})
    },
    [assignmentMutation],
  )

  // Fetch all active people with phone numbers for the recipient dropdown
  const {data: peopleData} = useQuery({
    queryKey: ['people', 'send-nursery-all'],
    queryFn: () => fetchPeople({status: 'active', limit: 500, page: 1}),
    enabled: sendOpen,
  })

  const recipientOptions = useMemo(() => {
    if (!peopleData?.data) return []
    return peopleData.data
      .filter((p) => p.phoneNumber)
      .map((p) => ({
        value: String(p.id),
        label: [p.firstName, p.lastName].filter(Boolean).join(' ') || p.phoneDisplay || 'Unknown',
      }))
  }, [peopleData])

  async function handleSendImage() {
    if (!selectedRecipientId) {
      toast.error('Pick a recipient')
      return
    }
    setSending(true)
    try {
      const wasEditing = editMode
      if (wasEditing) setEditMode(false)
      await new Promise((r) => setTimeout(r, 100))
      const imageData = await generateImage()
      if (wasEditing) setEditMode(true)
      const {results} = await sendScheduleImage({
        imageData,
        recipientIds: [Number(selectedRecipientId)],
        caption: caption.trim() || undefined,
      })
      const failed = results.filter((r) => !r.success)
      if (failed.length === 0) {
        toast.success('Schedule sent')
        setSendOpen(false)
        setCaption('')
      } else {
        toast.error(`Send failed: ${failed[0].error || 'Unknown error'}`)
      }
    } catch (error) {
      toast.error(`Send failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setSending(false)
    }
  }

  async function generateImage(): Promise<string> {
    if (!previewRef.current) throw new Error('Preview not ready')
    await document.fonts.ready
    // Clone into a detached container at natural width so nothing clips it
    const clone = previewRef.current.cloneNode(true) as HTMLElement
    const container = document.createElement('div')
    container.style.cssText = 'position:fixed;left:-9999px;top:0;width:800px;background:#fff;'
    container.appendChild(clone)
    document.body.appendChild(container)
    try {
      const {toJpeg} = await import('html-to-image')
      return await toJpeg(clone, {
        quality: 0.95,
        pixelRatio: 2,
        backgroundColor: '#ffffff',
        cacheBust: true,
        skipFonts: true,
        width: 800,
        height: clone.scrollHeight,
      })
    } finally {
      document.body.removeChild(container)
    }
  }

  async function exportAs(format: 'pdf' | 'jpg') {
    if (!previewRef.current || !schedule) return
    const monthName = MONTH_NAMES[schedule.month - 1]
    const filename = `Nursery Schedule - ${monthName} ${schedule.year}`

    try {
      const wasEditing = editMode
      if (wasEditing) setEditMode(false)
      await new Promise((r) => setTimeout(r, 100))

      const dataUrl = await generateImage()

      if (format === 'jpg') {
        const a = document.createElement('a')
        a.href = dataUrl
        a.download = `${filename}.jpg`
        a.click()
      } else {
        const {jsPDF} = await import('jspdf')
        // Get image dimensions from the data URL
        const img = new Image()
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve()
          img.onerror = reject
          img.src = dataUrl
        })
        // US Letter size: 8.5" x 11" = 215.9mm x 279.4mm
        const pageWidth = 215.9
        const pageHeight = 279.4
        const margin = 10 // 10mm margins
        const maxWidth = pageWidth - margin * 2
        const maxHeight = pageHeight - margin * 2
        // Scale image to fit page, preserving aspect ratio
        const imgRatio = img.width / img.height
        const pageRatio = maxWidth / maxHeight
        let renderWidth: number
        let renderHeight: number
        if (imgRatio > pageRatio) {
          // Image is wider relative to page → fit to width
          renderWidth = maxWidth
          renderHeight = maxWidth / imgRatio
        } else {
          // Image is taller relative to page → fit to height
          renderHeight = maxHeight
          renderWidth = maxHeight * imgRatio
        }
        const x = (pageWidth - renderWidth) / 2
        const y = (pageHeight - renderHeight) / 2
        const pdf = new jsPDF({orientation: 'portrait', unit: 'mm', format: 'letter'})
        pdf.addImage(dataUrl, 'JPEG', x, y, renderWidth, renderHeight)
        pdf.save(`${filename}.pdf`)
      }

      if (wasEditing) setEditMode(true)
      toast.success(`Exported as ${format.toUpperCase()}`)
    } catch (error) {
      console.error('Export error:', error)
      toast.error(`Export failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  if (isLoading) return <PageSpinner />
  if (!schedule || !serviceConfig) return <div className="p-6 text-muted-foreground">Schedule not found</div>

  const isDraft = schedule.status === 'draft'

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/nursery')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-2xl font-bold">
          {MONTH_NAMES[schedule.month - 1]} {schedule.year}
        </h1>
        <span className="text-sm text-muted-foreground">({schedule.status})</span>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {isDraft && (
          <>
            <Button variant="outline" size="sm" onClick={() => setEditMode(!editMode)}>
              <Pencil className="h-4 w-4 mr-1" />
              {editMode ? 'Preview' : 'Edit'}
            </Button>
            <Button size="sm" onClick={() => finalizeMutation.mutate()} disabled={finalizeMutation.isPending}>
              <Check className="h-4 w-4 mr-1" />
              Finalize
            </Button>
          </>
        )}
        {!isDraft && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => reopenMutation.mutate()}
            disabled={reopenMutation.isPending}
          >
            Reopen as Draft
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={() => exportAs('pdf')}
          disabled={isDraft}
          title={isDraft ? 'Finalize the schedule to export' : undefined}
        >
          <Download className="h-4 w-4 mr-1" />
          PDF
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => exportAs('jpg')}
          disabled={isDraft}
          title={isDraft ? 'Finalize the schedule to export' : undefined}
        >
          <FileImage className="h-4 w-4 mr-1" />
          JPG
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setSendOpen(true)}
          disabled={isDraft}
          title={isDraft ? 'Finalize the schedule to send' : undefined}
        >
          <MessageSquare className="h-4 w-4 mr-1" />
          Send
        </Button>
      </div>

      <Card>
        <CardContent className="overflow-x-auto">
          <NurserySchedulePreview
            ref={previewRef}
            assignments={schedule.assignments}
            serviceConfig={serviceConfig}
            logoPath={settings?.logoPath}
            month={schedule.month}
            year={schedule.year}
            editMode={isDraft && editMode}
            workers={workers}
            onAssignmentChange={handleAssignmentChange}
          />
        </CardContent>
      </Card>

      {/* Send Schedule Dialog */}
      <Dialog open={sendOpen} onOpenChange={setSendOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Send Schedule</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Recipient</Label>
              <SearchableSelect
                value={selectedRecipientId}
                onValueChange={setSelectedRecipientId}
                options={recipientOptions}
                placeholder="Select a person..."
                className="w-full"
              />
            </div>
            <div className="space-y-2">
              <Label>Caption (optional)</Label>
              <Textarea
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder="Add a message to go with the schedule..."
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSendOpen(false)} disabled={sending}>
              Cancel
            </Button>
            <Button onClick={handleSendImage} disabled={sending || !selectedRecipientId}>
              {sending ? 'Sending...' : 'Send'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
