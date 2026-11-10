import {FitWidth} from '@/components/music-schedule/editor/preview-panel'
import {ScanPhotoViewer} from '@/components/music-schedule/scan-photo-viewer'
import {BoothServiceBlock, MusicServiceBlock} from '@/components/music-schedule/service-block'
import {SongInput} from '@/components/music-schedule/song-input'
import {Button} from '@/components/ui/button'
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card'
import {Checkbox} from '@/components/ui/checkbox'
import {Input} from '@/components/ui/input'
import {Label} from '@/components/ui/label'
import {Sheet, SheetContent, SheetHeader, SheetTitle} from '@/components/ui/sheet'
import {PageSpinner} from '@/components/ui/spinner'
import {Tabs, TabsContent, TabsList, TabsTrigger} from '@/components/ui/tabs'
import {applyMusicScan, discardMusicScan, fetchMusicScan, musicScanKeys, updateMusicScan} from '@/lib/music-scan-api'
import {isRowChoice, rowLine, rowsToLines} from '@/lib/music-scan-rows'
import type {
  MusicScan,
  ProposedLine,
  ProposedRow,
  ProposedService,
  ScanFlag,
  ScanServicePatch,
} from '@/lib/music-scan-types'
import {type MusicService, musicScheduleKeys} from '@/lib/music-schedule-api'
import {ROLE_LABELS, hymnRef, toTitleCase, weekLabel} from '@/lib/music-schedule-core'
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'
import {AlertTriangle, ArrowLeft, Check, Images, StickyNote} from 'lucide-react'
import {useState} from 'react'
import {useNavigate, useParams} from 'react-router-dom'
import {toast} from 'sonner'

import type {SongValue} from './song-picker'

const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function shortDate(iso: string) {
  const d = new Date(`${iso}T12:00:00`)
  return `${DAY[d.getDay()]} ${d.toLocaleDateString(undefined, {month: 'short', day: 'numeric'})}`
}

/**
 * The review step of a Schedule Scan: what the pastor's pages say each service
 * should be, against the week as it would be copied forward. Nothing is written
 * to the Music Schedule until Create week.
 */
export function MusicScanReviewPage() {
  const scanId = Number(useParams<{id: string}>().id)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [photosOpen, setPhotosOpen] = useState(false)
  const [tab, setTab] = useState<string>()

  const {data: scan, isLoading} = useQuery({
    queryKey: musicScanKeys.detail(scanId),
    queryFn: () => fetchMusicScan(scanId),
    enabled: Number.isFinite(scanId),
  })

  const patch = useMutation({
    mutationFn: (services: ScanServicePatch[]) => updateMusicScan(scanId, services),
    onSuccess: (next: MusicScan) => queryClient.setQueryData(musicScanKeys.detail(scanId), next),
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not save that change'),
  })

  const apply = useMutation({
    mutationFn: () => applyMusicScan(scanId),
    onSuccess: ({weekId}) => {
      queryClient.invalidateQueries({queryKey: musicScanKeys.all})
      queryClient.invalidateQueries({queryKey: musicScheduleKeys.all})
      toast.success('Week created from the scan')
      navigate(`/schedules/music/${weekId}`)
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not create the week'),
  })

  const discard = useMutation({
    mutationFn: () => discardMusicScan(scanId),
    onSuccess: () => {
      queryClient.invalidateQueries({queryKey: musicScanKeys.all})
      navigate('/schedules/music')
    },
  })

  if (isLoading || !scan) return <PageSpinner />

  const {proposal} = scan
  const applied = scan.status !== 'unfinished'
  const update = (p: ScanServicePatch) => patch.mutate([p])
  const active = proposal.services.find((s) => String(s.serviceTimeId) === tab) ?? proposal.services[0]

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => navigate('/schedules/music')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-0">
          <h2 className="text-2xl font-bold">{proposal.weekStart ? weekLabel(proposal.weekStart) : 'Scan review'}</h2>
          <p className="text-muted-foreground text-sm">
            {proposal.summary.resolved} of {proposal.summary.songs} songs found
            {proposal.summary.toCheck ? ` · ${proposal.summary.toCheck} to check` : ' · nothing to check'}
            {proposal.existingWeekId ? ' · this week already exists — applying updates it' : ''}
          </p>
        </div>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" className="lg:hidden" onClick={() => setPhotosOpen(true)}>
            <Images className="mr-2 h-4 w-4" />
            Preview
          </Button>
          {!applied ? (
            <>
              <Button
                variant="ghost"
                onClick={() => {
                  if (confirm('Discard this scan? Its photos are deleted and no week is created.')) discard.mutate()
                }}
              >
                Discard
              </Button>
              <Button disabled={apply.isPending || patch.isPending} onClick={() => apply.mutate()}>
                <Check className="mr-2 h-4 w-4" />
                {proposal.existingWeekId ? 'Apply to week' : 'Create week'}
              </Button>
            </>
          ) : scan.musicScheduleId ? (
            <Button onClick={() => navigate(`/schedules/music/${scan.musicScheduleId}`)}>Open week</Button>
          ) : null}
        </div>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Tabs value={String(active?.serviceTimeId)} onValueChange={setTab} className="min-w-0 gap-3">
          <TabsList className="h-auto max-w-full flex-wrap justify-start">
            {proposal.services.map((s) => (
              <TabsTrigger key={s.serviceTimeId} value={String(s.serviceTimeId)} className="gap-1.5">
                {s.name}
                {s.flags.length ? (
                  <span className="rounded-full bg-amber-500 px-1.5 text-[10px] leading-4 font-medium text-white">
                    {s.flags.length}
                  </span>
                ) : null}
              </TabsTrigger>
            ))}
          </TabsList>
          {proposal.services.map((s) => (
            <TabsContent key={s.serviceTimeId} value={String(s.serviceTimeId)}>
              <ServiceReview service={s} disabled={applied} onPatch={update} />
            </TabsContent>
          ))}
        </Tabs>
        <aside className="hidden lg:sticky lg:top-4 lg:block">
          {active ? <ReviewSidePanel service={active} photos={scan.photos} className="h-[calc(100vh-7rem)]" /> : null}
        </aside>
      </div>

      <Sheet open={photosOpen} onOpenChange={setPhotosOpen}>
        <SheetContent side="right" className="w-[90vw] sm:max-w-[90vw]">
          <SheetHeader>
            <SheetTitle>{active?.name ?? 'Preview'}</SheetTitle>
          </SheetHeader>
          {active ? (
            <ReviewSidePanel service={active} photos={scan.photos} className="h-[calc(100vh-6rem)] px-4 pb-4" />
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  )
}

/** The service as Create week would write it, shaped for the print block. */
function previewService(s: ProposedService): MusicService {
  return {
    id: s.serviceTimeId,
    serviceTimeId: s.serviceTimeId,
    name: s.name,
    musicHeading: s.musicHeading ?? s.name,
    boothHeading: s.boothHeading ?? s.name,
    date: s.date,
    dayOfWeek: new Date(`${s.date}T12:00:00`).getDay(),
    time: null,
    meeting: true,
    uploaded: false,
    episodeNumber: null,
    title: s.title,
    titleNote: '',
    titleHighlight: false,
    scripture: s.text,
    scriptureNote: '',
    scriptureHighlight: false,
    standalone: s.standalone,
    occasion: s.occasion,
    sortOrder: 0,
    nameOverride: '',
    timeOverride: null,
    musicHeadingOverride: '',
    boothHeadingOverride: '',
    nameDefault: s.name,
    timeDefault: null,
    musicHeadingDefault: '',
    boothHeadingDefault: '',
    lines: rowsToLines(s.rows).map(({status: _status, ...l}, i) => ({
      ...l,
      id: -(i + 1),
      sortOrder: i,
      highlight: false,
      boothHighlight: false,
    })),
    boothLines: (s.boothLines ?? []).map((bl) => ({...bl, stale: false})),
  }
}

function PreviewLabel({children}: {children: React.ReactNode}) {
  return <h4 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">{children}</h4>
}

/** The active service's Sound Booth and Musicians sheets with the current choices, or the scanned pages. */
function ReviewSidePanel({
  service,
  photos,
  className,
}: {
  service: ProposedService
  photos: string[]
  className?: string
}) {
  const [view, setView] = useState<'preview' | 'photos'>('preview')
  const sheet = previewService(service)
  return (
    <div className={`flex min-h-0 flex-col gap-2 ${className ?? ''}`}>
      <div className="flex gap-1">
        <Button size="sm" variant={view === 'preview' ? 'default' : 'outline'} onClick={() => setView('preview')}>
          Preview
        </Button>
        <Button size="sm" variant={view === 'photos' ? 'default' : 'outline'} onClick={() => setView('photos')}>
          Photos
        </Button>
      </div>
      {view === 'preview' ? (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="space-y-3">
            <PreviewLabel>Sound Booth</PreviewLabel>
            <FitWidth>
              <BoothServiceBlock service={sheet} showRule={false} />
            </FitWidth>
            <PreviewLabel>Musicians</PreviewLabel>
            <FitWidth>
              <MusicServiceBlock service={sheet} />
            </FitWidth>
            <p className="text-muted-foreground text-xs">
              {service.name} with your choices. Highlights are set in the editor afterwards.
            </p>
          </div>
        </div>
      ) : (
        <ScanPhotoViewer photos={photos} className="min-h-0 flex-1" />
      )}
    </div>
  )
}

function ServiceReview({
  service: s,
  disabled,
  onPatch,
}: {
  service: ProposedService
  disabled: boolean
  onPatch: (p: ScanServicePatch) => void
}) {
  const serviceFlags = s.flags.filter((f) => f.lineIndex == null)
  const flagsAt = (i: number) => s.flags.filter((f) => f.lineIndex === i)
  const id = s.serviceTimeId
  const setRows = (rows: ProposedRow[]) => onPatch({serviceTimeId: id, rows})
  const setRow = (i: number, next: Partial<ProposedRow>) =>
    setRows(s.rows.map((r, j) => (j === i ? {...r, ...next} : r)))
  // A fixed song goes on the line that row writes: the sheet's when it has one.
  const setLine = (i: number, next: Partial<ProposedLine>) => {
    const r = s.rows[i]
    setRow(i, r.sheet ? {sheet: {...r.sheet, ...next}} : {usual: {...r.usual!, ...next}})
  }
  const choices = s.rows.filter(isRowChoice)
  const acceptedCount = choices.filter((r) => r.accepted).length
  const setAll = (accepted: boolean) => setRows(s.rows.map((r) => (isRowChoice(r) ? {...r, accepted} : r)))

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex flex-wrap items-baseline gap-2 text-base">
          {s.name}
          <span className="text-muted-foreground text-sm font-normal">{shortDate(s.date)}</span>
          {s.occasion ? (
            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-normal text-amber-900">{s.occasion}</span>
          ) : null}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Title">
            <Input
              defaultValue={s.title}
              disabled={disabled}
              onBlur={(e) => e.target.value !== s.title && onPatch({serviceTimeId: id, title: e.target.value})}
            />
          </Field>
          <Field label="Text">
            <Input
              defaultValue={s.text}
              disabled={disabled}
              onBlur={(e) => e.target.value !== s.text && onPatch({serviceTimeId: id, text: e.target.value})}
            />
          </Field>
          <Field label="Occasion">
            <Input
              defaultValue={s.occasion}
              disabled={disabled}
              placeholder="none"
              onBlur={(e) => e.target.value !== s.occasion && onPatch({serviceTimeId: id, occasion: e.target.value})}
            />
          </Field>
          <label className="flex items-center gap-2 self-end pb-2 text-sm">
            <Checkbox
              checked={s.standalone}
              disabled={disabled}
              onCheckedChange={(v) => onPatch({serviceTimeId: id, standalone: v === true})}
            />
            Standalone — next week won&rsquo;t copy this order
          </label>
        </div>

        {serviceFlags.map((f, i) => (
          <FlagNote key={i} flag={f} />
        ))}

        {choices.length ? (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-sky-300 bg-sky-50 p-2 text-sm text-sky-900 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-100">
            <span className="font-medium">
              {choices.length} change{choices.length === 1 ? '' : 's'} from the usual order · {acceptedCount} accepted
            </span>
            <div className="ml-auto flex gap-1">
              <Button size="sm" variant="outline" disabled={disabled} onClick={() => setAll(true)}>
                Accept all
              </Button>
              <Button size="sm" variant="outline" disabled={disabled} onClick={() => setAll(false)}>
                Reject all
              </Button>
            </div>
          </div>
        ) : null}

        <ol className="divide-y rounded border">
          {s.rows.map((r, i) => {
            const written = rowLine(r)
            const l = written ?? r.usual ?? r.sheet!
            return (
              <li key={i} className={`space-y-1 p-2 ${written ? '' : 'opacity-60'}`}>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground w-24 shrink-0 truncate text-xs">{ROLE_LABELS[l.role]}</span>
                  {l.kind === 'song' ? (
                    <SongInput
                      className={`min-w-0 flex-1 ${written ? '' : 'line-through'}`}
                      value={songValue(l)}
                      onCommit={(next) => setLine(i, songPatch(next))}
                    />
                  ) : (
                    <span className={`min-w-0 flex-1 truncate text-sm ${written ? '' : 'line-through'}`}>{l.text}</span>
                  )}
                  {l.suffix ? <span className="text-muted-foreground shrink-0 text-xs">{l.suffix}</span> : null}
                  <ChangeTag row={r} />
                  {isRowChoice(r) ? (
                    <div className="flex shrink-0 gap-1">
                      <Button
                        size="sm"
                        variant={r.accepted ? 'default' : 'outline'}
                        className="h-7 px-2 text-xs pointer-coarse:h-9"
                        disabled={disabled}
                        onClick={() => setRow(i, {accepted: true})}
                      >
                        Accept
                      </Button>
                      <Button
                        size="sm"
                        variant={r.accepted ? 'outline' : 'default'}
                        className="h-7 px-2 text-xs pointer-coarse:h-9"
                        disabled={disabled}
                        onClick={() => setRow(i, {accepted: false})}
                      >
                        Reject
                      </Button>
                    </div>
                  ) : null}
                </div>
                {r.change === 'changed' ? (
                  <p className="text-muted-foreground pl-26 text-xs">
                    Usual: {r.usual!.kind === 'song' ? ROLE_LABELS[r.usual!.role] : r.usual!.text || '(blank)'} → sheet:{' '}
                    {r.sheet!.kind === 'song' ? ROLE_LABELS[r.sheet!.role] : r.sheet!.text}
                  </p>
                ) : null}
                {flagsAt(i).map((f, j) => (
                  <FlagNote
                    key={j}
                    flag={f}
                    onPick={
                      disabled
                        ? undefined
                        : (o) =>
                            setLine(i, {
                              hymnId: o.hymnId,
                              hymnBook: o.book,
                              hymnNumber: o.number,
                              hymnTitle: o.title,
                              freeSongTitle: null,
                            })
                    }
                  />
                ))}
              </li>
            )
          })}
        </ol>

        {s.notes.length ? (
          <div className="rounded border border-dashed p-2 text-sm">
            <div className="mb-1 flex items-center gap-1.5 font-medium">
              <StickyNote className="h-4 w-4" />
              Notes from the sheet
            </div>
            <ul className="text-muted-foreground list-disc pl-5">
              {s.notes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
            <p className="text-muted-foreground mt-1 text-xs">
              Not placed anywhere — add them in the editor if needed.
            </p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

function Field({label, children}: {label: string; children: React.ReactNode}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  )
}

const CHANGE_TAGS: Partial<Record<ProposedRow['change'], {label: string; className: string}>> = {
  filled: {label: 'song filled', className: 'bg-green-100 text-green-900 dark:bg-green-950/50 dark:text-green-200'},
  changed: {label: 'changed', className: 'bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200'},
  added: {label: 'new on sheet', className: 'bg-sky-100 text-sky-900 dark:bg-sky-950/50 dark:text-sky-200'},
  removed: {label: 'not on sheet', className: 'bg-rose-100 text-rose-900 dark:bg-rose-950/50 dark:text-rose-200'},
}

function ChangeTag({row}: {row: ProposedRow}) {
  const tag = CHANGE_TAGS[row.change]
  if (!tag) return null
  return <span className={`shrink-0 rounded px-1.5 py-0.5 text-xs ${tag.className}`}>{tag.label}</span>
}

function FlagNote({flag, onPick}: {flag: ScanFlag; onPick?: (o: NonNullable<ScanFlag['options']>[number]) => void}) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded bg-amber-50 px-2 py-1 text-xs text-amber-900">
      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
      <span>{flag.message}</span>
      {flag.options && onPick
        ? flag.options.map((o, i) => (
            <Button key={i} size="sm" variant="outline" className="h-7" onClick={() => onPick(o)}>
              {hymnRef(o.book, o.number)} {o.title ? toTitleCase(o.title) : ''} ({pageName(o.page)})
            </Button>
          ))
        : null}
    </div>
  )
}

function pageName(p: string) {
  return p === 'form' ? 'form' : p === 'midweek_sheet' ? 'Midweek sheet' : 'Sunday sheet'
}

function songValue(l: ProposedLine): SongValue {
  return {
    hymnId: l.hymnId,
    hymnBook: l.hymnBook,
    hymnNumber: l.hymnNumber,
    hymnTitle: l.hymnTitle,
    freeSongTitle: l.freeSongTitle,
    text: l.text,
  }
}

function songPatch(next: Partial<SongValue>): Partial<ProposedLine> {
  const out: Partial<ProposedLine> = {}
  if ('hymnId' in next) out.hymnId = next.hymnId ?? null
  if ('hymnBook' in next) out.hymnBook = next.hymnBook ?? null
  if ('hymnNumber' in next) out.hymnNumber = next.hymnNumber ?? null
  if ('hymnTitle' in next) out.hymnTitle = next.hymnTitle ?? null
  if ('freeSongTitle' in next) out.freeSongTitle = next.freeSongTitle ?? null
  if ('text' in next) out.text = next.text ?? ''
  return out
}
