import {BoothServiceBlock, MusicServiceBlock} from '@/components/music-schedule/service-block'
import {Sheet, type SheetBlock} from '@/components/music-schedule/sheet'
import {SheetFooter} from '@/components/music-schedule/sheet-footer'
import {BOOTH_PAGE_PADDING_X_PX} from '@/components/music-schedule/type-scale'
import type {ZoomMode} from '@/components/print/scaled-page'
import {Button} from '@/components/ui/button'
import {Card, CardContent} from '@/components/ui/card'
import {DatePicker} from '@/components/ui/date-time-picker'
import {Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle} from '@/components/ui/dialog'
import {Input} from '@/components/ui/input'
import {Label} from '@/components/ui/label'
import {PageSpinner} from '@/components/ui/spinner'
import {exportFixedPagePdf} from '@/lib/fixed-page-pdf'
import {
  type MusicService,
  copyMusicWeek,
  deleteMusicWeek,
  fetchMusicWeek,
  musicScheduleKeys,
  updateMusicWeek,
} from '@/lib/music-schedule-api'
import {addDays, weekLabel, weekStartFor, weekWarnings} from '@/lib/music-schedule-core'
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'
import {AlertTriangle, ArrowLeft, Copy, Download, Lock, LockOpen, Trash2} from 'lucide-react'
import {type ReactElement, useMemo, useRef, useState} from 'react'
import {useNavigate, useParams} from 'react-router-dom'
import {toast} from 'sonner'

import {ServiceOverlay} from './service-overlay'

const ZOOMS: {value: ZoomMode; label: string}[] = [
  {value: 'fit', label: 'Fit'},
  {value: 1, label: '100%'},
  {value: 1.5, label: '150%'},
]

export function MusicWeekViewPage() {
  const weekId = Number(useParams<{id: string}>().id)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [zoom, setZoom] = useState<ZoomMode>('fit')
  const [editMode, setEditMode] = useState(true)
  const [exporting, setExporting] = useState<'booth' | 'music' | null>(null)
  const [overflow, setOverflow] = useState<Record<string, number>>({})
  const [copyOpen, setCopyOpen] = useState(false)
  const [copyWeek, setCopyWeek] = useState('')

  const boothRefs = useRef<HTMLDivElement[]>([])
  const sundayRefs = useRef<HTMLDivElement[]>([])
  const midweekRefs = useRef<HTMLDivElement[]>([])

  const {data: week, isLoading} = useQuery({
    queryKey: musicScheduleKeys.detail(weekId),
    queryFn: () => fetchMusicWeek(weekId),
    enabled: Number.isFinite(weekId),
  })

  const patch = useMutation({
    mutationFn: (body: {status?: 'draft' | 'final'; note?: string}) => updateMusicWeek(weekId, body),
    onSuccess: () => queryClient.invalidateQueries({queryKey: musicScheduleKeys.all}),
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed to update'),
  })

  const copy = useMutation({
    mutationFn: (weekStart: string) => copyMusicWeek(weekId, weekStart),
    onSuccess: (created) => {
      queryClient.invalidateQueries({queryKey: musicScheduleKeys.all})
      setCopyOpen(false)
      navigate(`/schedules/music/${created.id}`)
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed to copy'),
  })

  const remove = useMutation({
    mutationFn: () => deleteMusicWeek(weekId),
    onSuccess: () => {
      queryClient.invalidateQueries({queryKey: musicScheduleKeys.all})
      navigate('/schedules/music')
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed to delete'),
  })

  const warnings = useMemo(() => (week ? weekWarnings(week.services) : []), [week])

  if (isLoading || !week) return <PageSpinner />

  const meeting = week.services.filter((s) => s.meeting)
  const sunday = meeting.filter((s) => s.dayOfWeek === 0)
  const midweek = meeting.filter((s) => s.dayOfWeek !== 0)
  const labels = Object.fromEntries(week.services.map((s) => [s.id, s.name || 'Service']))
  const go = (serviceId: number) => navigate(`/schedules/music/${weekId}/service/${serviceId}`)

  const blocksFor = (
    services: MusicService[],
    render: (s: MusicService, index: number) => ReactElement,
  ): SheetBlock[] =>
    services.map((s, i) => ({
      key: `s-${s.id}`,
      node: render(s, i),
      breakAfter: s.lines.some((l) => l.kind === 'page_break'),
    }))

  const overlayFor = (_index: number, ref: React.RefObject<HTMLDivElement | null>) =>
    editMode ? <ServiceOverlay pageRef={ref} labels={labels} onOpen={go} deps={week} /> : null

  const runExport = async (which: 'booth' | 'music') => {
    const nodes = (which === 'booth' ? boothRefs.current : [...sundayRefs.current, ...midweekRefs.current]).filter(
      (n): n is HTMLDivElement => !!n,
    )
    if (!nodes.length) return
    setExporting(which)
    try {
      await exportFixedPagePdf(
        nodes,
        which === 'booth' ? `sound-booth-${week.weekStart}` : `music-schedule-${week.weekStart}`,
      )
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Export failed')
    } finally {
      setExporting(null)
    }
  }

  const overflowList = Object.entries(overflow).filter(([, px]) => px > 0)

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => navigate('/schedules/music')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h2 className="text-2xl font-bold">{week.label}</h2>
        <span
          className={
            week.status === 'final'
              ? 'rounded bg-green-100 px-2 py-0.5 text-xs text-green-800'
              : 'bg-muted rounded px-2 py-0.5 text-xs'
          }
        >
          {week.status}
        </span>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="flex gap-1">
            {ZOOMS.map((z) => (
              <Button
                key={String(z.value)}
                size="sm"
                variant={zoom === z.value ? 'default' : 'outline'}
                onClick={() => setZoom(z.value)}
              >
                {z.label}
              </Button>
            ))}
          </div>
          <Button size="sm" variant="outline" disabled={exporting !== null} onClick={() => runExport('booth')}>
            <Download className="mr-1 h-4 w-4" />
            {exporting === 'booth' ? 'Exporting…' : 'Sound Booth'}
          </Button>
          <Button size="sm" variant="outline" disabled={exporting !== null} onClick={() => runExport('music')}>
            <Download className="mr-1 h-4 w-4" />
            {exporting === 'music' ? 'Exporting…' : 'Musicians'}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setCopyWeek(addDays(week.weekStart, 7))
              setCopyOpen(true)
            }}
          >
            <Copy className="mr-1 h-4 w-4" />
            Copy
          </Button>
          <Button size="sm" variant={editMode ? 'default' : 'outline'} onClick={() => setEditMode((v) => !v)}>
            {editMode ? 'Editing' : 'Edit'}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => patch.mutate({status: week.status === 'final' ? 'draft' : 'final'})}
          >
            {week.status === 'final' ? (
              <>
                <LockOpen className="mr-1 h-4 w-4" />
                Reopen
              </>
            ) : (
              <>
                <Lock className="mr-1 h-4 w-4" />
                Finalize
              </>
            )}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              if (confirm(`Delete the ${week.label} schedule? This cannot be undone.`)) remove.mutate()
            }}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="space-y-4 p-4">
          <div>
            <Label>Note</Label>
            <Input
              key={week.id}
              defaultValue={week.note}
              placeholder="e.g. Tyler running services"
              onBlur={(e) => (e.target.value !== week.note ? patch.mutate({note: e.target.value}) : undefined)}
            />
            <p className="text-muted-foreground mt-1 text-xs">
              Shown and searchable on the week list. Never printed on either sheet.
            </p>
          </div>
        </CardContent>
      </Card>

      {warnings.length || overflowList.length ? (
        <div className="rounded border border-amber-300 bg-amber-50 p-3 text-sm">
          <div className="mb-1 flex items-center gap-2 font-medium text-amber-900">
            <AlertTriangle className="h-4 w-4" />
            {warnings.length + overflowList.length} thing{warnings.length + overflowList.length === 1 ? '' : 's'} to
            look at
          </div>
          <ul className="text-amber-900">
            {warnings.map((w) => (
              <li key={w.key}>
                •{' '}
                {w.serviceId ? (
                  <button className="underline underline-offset-2" onClick={() => go(w.serviceId!)}>
                    {w.message}
                  </button>
                ) : (
                  w.message
                )}
              </li>
            ))}
            {overflowList.map(([key, px]) => (
              <li key={key}>
                • {overflowLabel(key, labels)} overflows its page by ~{px}px
              </li>
            ))}
          </ul>
          <p className="mt-1 text-xs text-amber-800">Warnings only — export and finalize still work.</p>
        </div>
      ) : null}

      {editMode ? (
        <p className="text-muted-foreground text-sm">
          Click a service on any page to edit it. PDF export works in draft — finalizing only locks editing.
        </p>
      ) : null}

      <Dialog open={copyOpen} onOpenChange={setCopyOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Copy {week.label}</DialogTitle>
            <DialogDescription>
              Copies every service, line, song, highlight and Sound Booth line as it stands, moved onto the new
              week&rsquo;s dates. Episode numbers are reassigned for the new dates rather than duplicated.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Sunday</Label>
            <DatePicker value={copyWeek} onChange={(v) => setCopyWeek(weekStartFor(v || week.weekStart))} />
            <p className="text-muted-foreground text-xs">
              Any date picks its Sunday. Will cover {weekLabel(copyWeek || week.weekStart).toLowerCase()} through the
              Wednesday after it.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCopyOpen(false)}>
              Cancel
            </Button>
            <Button disabled={copy.isPending || !copyWeek} onClick={() => copy.mutate(copyWeek)}>
              Copy week
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="grid gap-6 2xl:grid-cols-2">
        <section className="space-y-3">
          <h3 className="text-muted-foreground text-sm font-medium">Sound Booth</h3>
          <Sheet
            title="SERVICE SCHEDULE"
            subtitle="Sound Booth"
            zoom={zoom}
            paddingX={BOOTH_PAGE_PADDING_X_PX}
            blocks={blocksFor(meeting, (s, i) => (
              <BoothServiceBlock service={s} showRule={i < meeting.length - 1} />
            ))}
            onPages={(n) => {
              boothRefs.current = n
            }}
            overlay={overlayFor}
            onOverflow={(o) => setOverflow((prev) => mergeOverflow(prev, o, 'booth'))}
          />
        </section>

        <section className="space-y-3">
          <h3 className="text-muted-foreground text-sm font-medium">Musicians</h3>
          <Sheet
            title="MUSIC SCHEDULE"
            subtitle="Sunday"
            zoom={zoom}
            blocks={blocksFor(sunday, (s) => (
              <MusicServiceBlock service={s} />
            ))}
            onPages={(n) => {
              sundayRefs.current = n
            }}
            overlay={overlayFor}
            onOverflow={(o) => setOverflow((prev) => mergeOverflow(prev, o, 'sunday'))}
          />
          {midweek.length ? (
            <Sheet
              title="MUSIC SCHEDULE"
              subtitle="Midweek"
              zoom={zoom}
              blocks={blocksFor(midweek, (s) => (
                <MusicServiceBlock service={s} />
              ))}
              onPages={(n) => {
                midweekRefs.current = n
              }}
              overlay={overlayFor}
              footer={
                week.footer.placement === 'never' ? undefined : (
                  <SheetFooter blocks={week.footer.blocks} imagePath={week.footer.imagePath} />
                )
              }
              onOverflow={(o) => setOverflow((prev) => mergeOverflow(prev, o, 'midweek'))}
            />
          ) : null}
        </section>
      </div>
    </div>
  )
}

/** 'sunday:s-12' -> the service's name, for the readiness list. */
function overflowLabel(key: string, labels: Record<number, string>): string {
  const id = Number(key.split(':s-')[1])
  return labels[id] ?? key
}

/** Overflow is reported per sheet; keep one map keyed by sheet + block. */
function mergeOverflow(
  prev: Record<string, number>,
  next: {key: string; px: number}[],
  sheet: string,
): Record<string, number> {
  const out = Object.fromEntries(Object.entries(prev).filter(([k]) => !k.startsWith(`${sheet}:`)))
  for (const o of next) out[`${sheet}:${o.key}`] = o.px
  return out
}
