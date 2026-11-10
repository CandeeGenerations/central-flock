import {ScanPhotoViewer} from '@/components/music-schedule/scan-photo-viewer'
import {
  BoothServiceBlock,
  MusicServiceBlock,
  OCCASION_FIT_EVENT,
  type OccasionFitDetail,
} from '@/components/music-schedule/service-block'
import {Sheet, type SheetBlock} from '@/components/music-schedule/sheet'
import {SheetFooter} from '@/components/music-schedule/sheet-footer'
import {BOOTH_PAGE_PADDING_X_PX} from '@/components/music-schedule/type-scale'
import {WeekSongsPanel} from '@/components/music-schedule/week-songs-panel'
import {DocumentHeader, SettingsAction} from '@/components/schedule/document-header'
import {Button} from '@/components/ui/button'
import {DatePicker} from '@/components/ui/date-time-picker'
import {Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle} from '@/components/ui/dialog'
import {Input} from '@/components/ui/input'
import {Label} from '@/components/ui/label'
import {SheetContent, SheetDescription, SheetHeader, SheetTitle, Sheet as SidePanel} from '@/components/ui/sheet'
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
import {AlertTriangle, Copy, ListMusic, Trash2} from 'lucide-react'
import {type ReactElement, useEffect, useMemo, useRef, useState} from 'react'
import {useNavigate, useParams} from 'react-router-dom'
import {toast} from 'sonner'

import {ServiceOverlay} from './service-overlay'

export function MusicWeekViewPage() {
  const weekId = Number(useParams<{id: string}>().id)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [exporting, setExporting] = useState(false)
  const [overflow, setOverflow] = useState<Record<string, number>>({})
  // How far the one-page sheets had to shrink to fit.
  const [fitScales, setFitScales] = useState<{booth?: number; sunday?: number}>({})
  const [copyOpen, setCopyOpen] = useState(false)
  const [copyWeek, setCopyWeek] = useState('')
  const [songsOpen, setSongsOpen] = useState(false)
  // Service ids whose Occasion had to be cut short on some sheet.
  const [cutOccasions, setCutOccasions] = useState<Set<number>>(new Set())

  useEffect(() => {
    const onFit = (e: Event) => {
      const {serviceId, cut} = (e as CustomEvent<OccasionFitDetail>).detail
      setCutOccasions((prev) => {
        if (prev.has(serviceId) === cut) return prev
        const next = new Set(prev)
        if (cut) next.add(serviceId)
        else next.delete(serviceId)
        return next
      })
    }
    window.addEventListener(OCCASION_FIT_EVENT, onFit)
    return () => window.removeEventListener(OCCASION_FIT_EVENT, onFit)
  }, [])

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

  // Final locks the week: no click-to-edit until it is reopened.
  const editMode = week.status === 'draft'
  const overlayFor = (_index: number, ref: React.RefObject<HTMLDivElement | null>) =>
    editMode ? <ServiceOverlay pageRef={ref} labels={labels} onOpen={go} deps={week} /> : null

  const runExport = async (which: ('booth' | 'music')[]) => {
    setExporting(true)
    try {
      for (const sheet of which) {
        const nodes = (sheet === 'booth' ? boothRefs.current : [...sundayRefs.current, ...midweekRefs.current]).filter(
          (n): n is HTMLDivElement => !!n,
        )
        if (!nodes.length) continue
        await exportFixedPagePdf(
          nodes,
          sheet === 'booth' ? `sound-booth-${week.weekStart}` : `music-schedule-${week.weekStart}`,
        )
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Export failed')
    } finally {
      setExporting(false)
    }
  }

  const overflowList = Object.entries(overflow).filter(([, px]) => px > 0)
  const cutList = week.services.filter((s) => s.occasion && cutOccasions.has(s.id))
  // Shrinking is how these sheets fit, so only flag it once the type is getting small.
  const shrunkList = (['booth', 'sunday'] as const)
    .map((k) => ({sheet: k, scale: fitScales[k] ?? 1}))
    .filter((f) => f.scale < 0.85)
  const issueCount = warnings.length + overflowList.length + cutList.length + shrunkList.length

  return (
    <div className="space-y-4 p-4 md:p-6">
      <DocumentHeader
        onBack={() => navigate('/schedules/music')}
        title={week.label}
        status={week.status}
        onFinalize={() => patch.mutate({status: 'final'})}
        onReopen={() => patch.mutate({status: 'draft'})}
        statusPending={patch.isPending}
        exporting={exporting}
        downloads={[
          {label: 'Both sheets', onSelect: () => runExport(['booth', 'music'])},
          {label: 'Sound Booth', onSelect: () => runExport(['booth'])},
          {label: 'Musicians', onSelect: () => runExport(['music'])},
        ]}
        actions={
          <Button size="sm" variant="outline" disabled={!editMode} onClick={() => setSongsOpen(true)}>
            <ListMusic className="mr-1 h-4 w-4" />
            Songs
          </Button>
        }
        settings={(close) => (
          <>
            <div className="space-y-1.5">
              <Label>Note</Label>
              <Input
                key={week.id}
                defaultValue={week.note}
                placeholder="e.g. Tyler running services"
                onBlur={(e) => (e.target.value !== week.note ? patch.mutate({note: e.target.value}) : undefined)}
              />
              <p className="text-muted-foreground text-xs">
                Shown and searchable on the week list. Never printed on either sheet.
              </p>
            </div>
            <div className="space-y-2 border-t pt-4">
              <SettingsAction
                icon={<Copy />}
                onClick={() => {
                  close()
                  setCopyWeek(addDays(week.weekStart, 7))
                  setCopyOpen(true)
                }}
              >
                Copy this week…
              </SettingsAction>
              <SettingsAction
                icon={<Trash2 />}
                destructive
                onClick={() => {
                  if (confirm(`Delete the ${week.label} schedule? This cannot be undone.`)) remove.mutate()
                }}
              >
                Delete this week
              </SettingsAction>
            </div>
            {week.scanPhotos?.length ? (
              <div className="space-y-2 border-t pt-4">
                <Label>Scanned pages</Label>
                <ScanPhotoViewer photos={week.scanPhotos} fitToPhoto />
                <p className="text-muted-foreground text-xs">Kept for about a month after the scan.</p>
              </div>
            ) : null}
          </>
        )}
      />

      {issueCount ? (
        <div className="rounded border border-amber-300 bg-amber-50 p-3 text-sm">
          <div className="mb-1 flex items-center gap-2 font-medium text-amber-900">
            <AlertTriangle className="h-4 w-4" />
            {issueCount} thing{issueCount === 1 ? '' : 's'} to look at
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
            {shrunkList.map((f) => (
              <li key={`shrunk-${f.sheet}`}>
                • {SHEET_NAMES[f.sheet]} is shrunk to {Math.round(f.scale * 100)}% to fit one page
              </li>
            ))}
            {cutList.map((s) => (
              <li key={`occasion-${s.id}`}>
                •{' '}
                <button className="underline underline-offset-2" onClick={() => go(s.id)}>
                  {labels[s.id]}: Occasion “{s.occasion}” is too long for its heading row and is cut short
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-1 text-xs text-amber-800">Warnings only — export and finalize still work.</p>
        </div>
      ) : null}

      <p className="text-muted-foreground text-sm">
        {editMode
          ? 'Click a service on any page to edit it. Finalize locks editing; PDF export works either way.'
          : 'Final — editing is locked. Reopen to make changes.'}
      </p>

      <SidePanel open={songsOpen} onOpenChange={setSongsOpen}>
        <SheetContent
          side="right"
          className="overflow-y-auto data-[side=right]:w-[70vw] data-[side=right]:sm:max-w-none data-[side=right]:lg:w-[50vw] data-[side=right]:2xl:w-[30vw]"
        >
          <SheetHeader>
            <SheetTitle>Songs — {week.label}</SheetTitle>
            <SheetDescription>Every song slot this week, in order. Saves as you go.</SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-6">
            {songsOpen ? (
              <WeekSongsPanel
                weekId={week.id}
                services={week.services}
                onSaved={() => queryClient.invalidateQueries({queryKey: musicScheduleKeys.detail(weekId)})}
              />
            ) : null}
          </div>
        </SheetContent>
      </SidePanel>

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
            zoom="fit"
            fitOnePage
            onFitScale={(scale) => setFitScales((prev) => ({...prev, booth: scale}))}
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
            zoom="fit"
            fitOnePage
            onFitScale={(scale) => setFitScales((prev) => ({...prev, sunday: scale}))}
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
              zoom="fit"
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
const SHEET_NAMES: Record<string, string> = {booth: 'The Sound Booth sheet', sunday: 'The Musicians Sunday sheet'}

function overflowLabel(key: string, labels: Record<number, string>): string {
  const [sheet, block] = key.split(':')
  if (block === 'fit') return `${SHEET_NAMES[sheet] ?? 'The sheet'}, even shrunk as far as it goes,`
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
