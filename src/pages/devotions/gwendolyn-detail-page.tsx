import {ConfirmDialog} from '@/components/confirm-dialog'
import {Button} from '@/components/ui/button'
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card'
import {DateTimePicker} from '@/components/ui/date-time-picker'
import {Dialog, DialogContent, DialogHeader, DialogTitle} from '@/components/ui/dialog'
import {Label} from '@/components/ui/label'
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select'
import {PageSpinner, Spinner} from '@/components/ui/spinner'
import {Textarea} from '@/components/ui/textarea'
import {formatDate} from '@/lib/date'
import {
  type DevotionalBlock,
  type GwendolynDevotional,
  type GwendolynStatus,
  buildBlockText,
  buildCopyContent,
  buildCopyTitle,
  deleteGwendolynDevotional,
  fetchGwendolynDevotional,
  regenerateGwendolynHashtags,
  scheduleGwendolynMessage,
  updateGwendolynDevotional,
  updateGwendolynStatus,
} from '@/lib/gwendolyn-devotion-api'
import {queryKeys} from '@/lib/query-keys'
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'
import {ArrowLeft, Copy, Edit, MessageSquare, Trash2} from 'lucide-react'
import {useMemo, useState} from 'react'
import {useNavigate, useParams} from 'react-router-dom'
import {toast} from 'sonner'

import {GwendolynDevotionalForm} from './gwendolyn-devotional-form'

const STATUS_OPTIONS: {value: GwendolynStatus; label: string}[] = [
  {value: 'received', label: 'Received'},
  {value: 'producing', label: 'Producing'},
  {value: 'waiting_for_approval', label: 'Waiting for Approval'},
  {value: 'ready_to_upload', label: 'Ready to Upload'},
  {value: 'done', label: 'Done'},
]

function BlockView({block}: {block: DevotionalBlock}) {
  const copy = () => {
    navigator.clipboard.writeText(buildBlockText(block)).then(() => toast.success('Copied'))
  }

  return (
    <div className="flex gap-3 items-start group">
      <span className="text-muted-foreground text-lg mt-0.5 shrink-0">{block.type === 'point' ? '📚' : '📖'}</span>
      <div className="flex-1 space-y-0.5">
        {block.type === 'scripture' ? (
          <>
            <p className="italic">"{block.text}"</p>
            {block.reference && <p className="text-sm text-muted-foreground font-medium">{block.reference}</p>}
            {!block.reference && <p className="text-xs text-amber-600">No reference — copy will omit it</p>}
          </>
        ) : (
          <p>{block.text}</p>
        )}
      </div>
      <button
        onClick={copy}
        className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-muted text-muted-foreground cursor-pointer shrink-0 transition-opacity"
        title="Copy this block"
      >
        <Copy className="h-4 w-4" />
      </button>
    </div>
  )
}

export function GwendolynDetailPage() {
  const {id} = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [showDelete, setShowDelete] = useState(false)
  const [scheduleOpen, setScheduleOpen] = useState(false)
  const [scheduleWhen, setScheduleWhen] = useState('')
  const [scheduleContent, setScheduleContent] = useState('')

  const {data: devotional, isLoading} = useQuery({
    queryKey: queryKeys.gwendolynDevotional(Number(id)),
    queryFn: () => fetchGwendolynDevotional(Number(id)),
    enabled: !!id,
  })

  const updateMutation = useMutation({
    mutationFn: (data: Partial<GwendolynDevotional>) => updateGwendolynDevotional(Number(id), data),
    onSuccess: () => {
      qc.invalidateQueries({queryKey: queryKeys.gwendolynDevotional(Number(id))})
      qc.invalidateQueries({queryKey: queryKeys.gwendolynDevotions()})
      setEditing(false)
      toast.success('Saved')
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Save failed'),
  })

  const statusMutation = useMutation({
    mutationFn: (status: GwendolynStatus) => updateGwendolynStatus(Number(id), status),
    onSuccess: (updated) => {
      qc.setQueryData(queryKeys.gwendolynDevotional(Number(id)), updated)
      qc.invalidateQueries({queryKey: queryKeys.gwendolynDevotions()})
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Status update failed')
      qc.invalidateQueries({queryKey: queryKeys.gwendolynDevotional(Number(id))})
    },
  })

  const regenMutation = useMutation({
    mutationFn: () => regenerateGwendolynHashtags(Number(id)),
    onSuccess: ({hashtags}) => {
      qc.setQueryData(queryKeys.gwendolynDevotional(Number(id)), (old: GwendolynDevotional | undefined) =>
        old ? {...old, hashtags} : old,
      )
      toast.success('Hashtags regenerated')
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Regenerate failed'),
  })

  const scheduleMutation = useMutation({
    mutationFn: (data: {scheduledAt: string; content?: string}) => scheduleGwendolynMessage(Number(id), data),
    onSuccess: () => {
      qc.invalidateQueries({queryKey: ['messages']})
      setScheduleOpen(false)
      toast.success('Message scheduled')
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Schedule failed'),
  })

  const devoUrl = useMemo(() => {
    if (!devotional) return ''
    const [y, m, d] = devotional.date.split('-')
    return `https://cbcwoodbridge-social.s3.us-east-1.amazonaws.com/${y}/${m}/devo-reels-${y}${m}${d}.mp4`
  }, [devotional])

  const openScheduleDialog = () => {
    // Default to the devotional's date at 8 AM local
    const local = devotional ? `${devotional.date}T08:00` : ''
    setScheduleWhen(local)
    setScheduleContent(devoUrl)
    setScheduleOpen(true)
  }

  const deleteMutation = useMutation({
    mutationFn: () => deleteGwendolynDevotional(Number(id)),
    onSuccess: () => {
      qc.invalidateQueries({queryKey: queryKeys.gwendolynDevotions()})
      navigate('/devotions/gwendolyn')
      toast.success('Deleted')
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Delete failed'),
  })

  if (isLoading) return <PageSpinner />
  if (!devotional) return <div className="p-6 text-muted-foreground">Devotional not found</div>

  function copy(text: string, label: string) {
    navigator.clipboard.writeText(text).then(() => toast.success(`${label} copied`))
  }

  if (editing) {
    return (
      <div className="p-4 md:p-6 max-w-3xl space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => setEditing(false)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-2xl font-bold">Edit Devotional</h1>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent>
            <GwendolynDevotionalForm
              initial={{
                title: devotional.title,
                date: devotional.date,
                blocks: devotional.blocks,
                hashtags: devotional.hashtags,
                status: devotional.status,
              }}
              onSubmit={(data) => updateMutation.mutate(data)}
              onCancel={() => setEditing(false)}
              submitLabel="Save"
              submitting={updateMutation.isPending}
              showStatus
              onRegenerateHashtags={() => regenMutation.mutate()}
              regenerating={regenMutation.isPending}
            />
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6 max-w-6xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/devotions/gwendolyn')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="space-y-0.5">
          <h1 className="text-2xl font-bold">{devotional.title}</h1>
          <p className="text-muted-foreground text-sm">{formatDate(devotional.date)}</p>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        <div className="flex-1 min-w-0 max-w-3xl space-y-6">
          {/* Content card */}
          <Card>
            <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <Select value={devotional.status} onValueChange={(v) => statusMutation.mutate(v as GwendolynStatus)}>
                <SelectTrigger className="w-52">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex gap-2 flex-wrap shrink-0">
                <Button variant="outline" size="sm" onClick={() => copy(buildCopyTitle(devotional), 'Title')}>
                  <Copy className="h-4 w-4 mr-1" />
                  Copy title
                </Button>
                <Button variant="outline" size="sm" onClick={() => copy(buildCopyContent(devotional), 'Full post')}>
                  <Copy className="h-4 w-4 mr-1" />
                  Copy full + hashtags
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {devotional.blocks.map((block, i) => (
                <BlockView key={i} block={block} />
              ))}
              <p className="italic text-muted-foreground text-sm pl-8">— Passing the truth along</p>
            </CardContent>
          </Card>

          {/* Hashtags card */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-3">
              <CardTitle>Hashtags</CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={() => regenMutation.mutate()}
                disabled={regenMutation.isPending}
              >
                {regenMutation.isPending ? <Spinner size="sm" className="mr-1" /> : null}
                Regenerate
              </Button>
            </CardHeader>
            <CardContent>
              <p className="text-sm break-words">
                <span className="font-medium">#Faith #God #Prayer</span> {devotional.hashtags}
              </p>
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="flex items-center justify-between">
            <Button variant="destructive" size="sm" onClick={() => setShowDelete(true)}>
              <Trash2 className="h-4 w-4 mr-1" />
              Delete
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={openScheduleDialog}>
                <MessageSquare className="h-4 w-4 mr-1" />
                Schedule text
              </Button>
              <Button size="sm" onClick={() => setEditing(true)}>
                <Edit className="h-4 w-4 mr-1" />
                Edit
              </Button>
            </div>
          </div>
        </div>

        {/* Production instructions sidebar */}
        <aside className="lg:w-72 lg:shrink-0">
          <div className="lg:sticky lg:top-6">
            <Card>
              <CardHeader>
                <CardTitle>Production Instructions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-5 text-sm">
                <section className="space-y-2">
                  <h3 className="font-semibold text-base">Music</h3>
                  <ul className="list-disc pl-5 space-y-1">
                    <li>Fade in: 1s</li>
                    <li>Fade out: 2s</li>
                  </ul>
                </section>
                <section className="space-y-2">
                  <h3 className="font-semibold text-base">Footage</h3>
                  <ul className="list-disc pl-5 space-y-1">
                    <li>Scale to 320%</li>
                    <li>Cut at the beginning of the text.</li>
                    <li>Cut at the end of the text.</li>
                    <li>
                      Middle section:
                      <ul className="list-[circle] pl-5 mt-1 space-y-1">
                        <li>Blur: 50%</li>
                        <li>Opacity: 50%</li>
                        <li>Vignette: 30</li>
                      </ul>
                    </li>
                    <li>
                      Blur Transition
                      <ul className="list-[circle] pl-5 mt-1 space-y-1">
                        <li>Beginning: Max (0.7s)</li>
                        <li>End: 1s</li>
                      </ul>
                    </li>
                  </ul>
                </section>
              </CardContent>
            </Card>
          </div>
        </aside>
      </div>

      <Dialog open={scheduleOpen} onOpenChange={setScheduleOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Schedule text to Gwendolyn</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Send at</Label>
              <DateTimePicker value={scheduleWhen} onChange={setScheduleWhen} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Message</Label>
              <Textarea
                value={scheduleContent}
                onChange={(e) => setScheduleContent(e.target.value)}
                rows={4}
                placeholder={devoUrl}
              />
              <p className="text-xs text-muted-foreground break-all">Link: {devoUrl}</p>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setScheduleOpen(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={!scheduleWhen || scheduleMutation.isPending}
                onClick={() =>
                  scheduleMutation.mutate({
                    scheduledAt: new Date(scheduleWhen).toISOString(),
                    content: scheduleContent || undefined,
                  })
                }
              >
                {scheduleMutation.isPending ? <Spinner size="sm" className="mr-1" /> : null}
                Schedule
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={showDelete}
        onOpenChange={setShowDelete}
        title="Delete devotional?"
        description="This action cannot be undone."
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={() => deleteMutation.mutate()}
        loading={deleteMutation.isPending}
      />
    </div>
  )
}
