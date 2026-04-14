import {NurserySchedulePreview} from '@/components/nursery/nursery-schedule-preview'
import {Button} from '@/components/ui/button'
import {Label} from '@/components/ui/label'
import {SearchableSelect} from '@/components/ui/searchable-select'
import {Spinner} from '@/components/ui/spinner'
import type {ScheduleWithAssignments} from '@/lib/nursery-api'
import {
  fetchNurserySettings,
  fetchNurseryWorkers,
  fetchServiceConfig,
  generateNurserySchedule,
  updateAssignment,
  updateScheduleStatus,
} from '@/lib/nursery-api'
import {nurseryKeys} from '@/lib/nursery-query-keys'
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'
import {ArrowLeft, Check, Download, FileImage} from 'lucide-react'
import {useCallback, useRef, useState} from 'react'
import {useNavigate} from 'react-router-dom'
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

function getDefaultMonth(): {month: number; year: number} {
  const now = new Date()
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  return {month: next.getMonth() + 1, year: next.getFullYear()}
}

export function NurseryGeneratePage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const previewRef = useRef<HTMLDivElement>(null)

  const defaults = getDefaultMonth()
  const [selectedMonth, setSelectedMonth] = useState(String(defaults.month))
  const [selectedYear, setSelectedYear] = useState(String(defaults.year))
  const [schedule, setSchedule] = useState<ScheduleWithAssignments | null>(null)
  const [editMode, setEditMode] = useState(true)

  const {data: serviceConfig} = useQuery({queryKey: nurseryKeys.serviceConfig, queryFn: fetchServiceConfig})
  const {data: workers} = useQuery({queryKey: nurseryKeys.workers, queryFn: fetchNurseryWorkers})
  const {data: settings} = useQuery({queryKey: nurseryKeys.settings, queryFn: fetchNurserySettings})

  const generateMutation = useMutation({
    mutationFn: () => generateNurserySchedule(Number(selectedMonth), Number(selectedYear)),
    onSuccess: (data) => {
      setSchedule(data)
      setEditMode(true)
      toast.success('Schedule generated')
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Failed to generate'),
  })

  const assignmentMutation = useMutation({
    mutationFn: ({id, workerId}: {id: number; workerId: number | null}) => updateAssignment(id, workerId),
    onSuccess: (updated) => {
      setSchedule((prev) => {
        if (!prev) return prev
        return {
          ...prev,
          assignments: prev.assignments.map((a) => (a.id === updated.id ? updated : a)),
        }
      })
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Failed to update assignment'),
  })

  const finalizeMutation = useMutation({
    mutationFn: () => {
      if (!schedule) throw new Error('No schedule')
      return updateScheduleStatus(schedule.id, 'final')
    },
    onSuccess: () => {
      queryClient.invalidateQueries({queryKey: nurseryKeys.schedules})
      toast.success('Schedule finalized')
      navigate(`/nursery/${schedule!.id}`)
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Failed to finalize'),
  })

  const handleAssignmentChange = useCallback(
    (assignmentId: number, workerId: number | null) => {
      assignmentMutation.mutate({id: assignmentId, workerId})
    },
    [assignmentMutation],
  )

  async function exportAs(format: 'pdf' | 'jpg') {
    if (!previewRef.current) return
    const monthName = MONTH_NAMES[Number(selectedMonth) - 1]
    const filename = `Nursery Schedule - ${monthName} ${selectedYear}`

    try {
      // Temporarily disable edit mode for clean export
      setEditMode(false)

      // Wait for re-render
      await new Promise((r) => setTimeout(r, 100))
      await document.fonts.ready

      const html2canvas = (await import('html2canvas')).default
      const canvas = await html2canvas(previewRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
      })

      if (format === 'jpg') {
        canvas.toBlob(
          (blob) => {
            if (!blob) return
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `${filename}.jpg`
            a.click()
            URL.revokeObjectURL(url)
          },
          'image/jpeg',
          0.95,
        )
      } else {
        const {jsPDF} = await import('jspdf')
        const imgData = canvas.toDataURL('image/jpeg', 0.95)
        const pdfWidth = 210 // A4 width in mm
        const pdfHeight = (canvas.height * pdfWidth) / canvas.width
        const pdf = new jsPDF({
          orientation: pdfHeight > pdfWidth ? 'portrait' : 'landscape',
          unit: 'mm',
          format: [pdfWidth, pdfHeight],
        })
        pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight)
        pdf.save(`${filename}.pdf`)
      }

      toast.success(`Exported as ${format.toUpperCase()}`)
    } catch (error) {
      toast.error(`Export failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setEditMode(true)
    }
  }

  const monthOptions = MONTH_NAMES.map((name, i) => ({value: String(i + 1), label: name}))
  const currentYear = new Date().getFullYear()
  const yearOptions = Array.from({length: 5}, (_, i) => ({
    value: String(currentYear + i - 1),
    label: String(currentYear + i - 1),
  }))

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/nursery')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-2xl font-bold">Generate Nursery Schedule</h1>
      </div>

      {/* Month/Year picker + Generate */}
      <div className="flex items-end gap-4 flex-wrap">
        <div className="space-y-1">
          <Label>Month</Label>
          <SearchableSelect
            value={selectedMonth}
            onValueChange={setSelectedMonth}
            options={monthOptions}
            searchable={false}
          />
        </div>
        <div className="space-y-1">
          <Label>Year</Label>
          <SearchableSelect
            value={selectedYear}
            onValueChange={setSelectedYear}
            options={yearOptions}
            searchable={false}
          />
        </div>
        <Button onClick={() => generateMutation.mutate()} disabled={generateMutation.isPending}>
          {generateMutation.isPending ? <Spinner className="h-4 w-4 mr-2" /> : null}
          Generate
        </Button>
      </div>

      {/* Schedule Preview */}
      {schedule && serviceConfig && (
        <>
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={() => setEditMode(!editMode)}>
              {editMode ? 'Preview Mode' : 'Edit Mode'}
            </Button>
            <Button variant="outline" size="sm" onClick={() => exportAs('pdf')}>
              <Download className="h-4 w-4 mr-1" />
              PDF
            </Button>
            <Button variant="outline" size="sm" onClick={() => exportAs('jpg')}>
              <FileImage className="h-4 w-4 mr-1" />
              JPG
            </Button>
            <Button size="sm" onClick={() => finalizeMutation.mutate()} disabled={finalizeMutation.isPending}>
              <Check className="h-4 w-4 mr-1" />
              Finalize
            </Button>
          </div>

          <div className="border rounded-lg overflow-hidden shadow-sm">
            <NurserySchedulePreview
              ref={previewRef}
              assignments={schedule.assignments}
              serviceConfig={serviceConfig}
              logoPath={settings?.logoPath}
              month={Number(selectedMonth)}
              year={Number(selectedYear)}
              editMode={editMode}
              workers={workers}
              onAssignmentChange={handleAssignmentChange}
            />
          </div>
        </>
      )}
    </div>
  )
}
