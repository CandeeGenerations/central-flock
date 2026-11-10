import {ScanPhotoViewer} from '@/components/music-schedule/scan-photo-viewer'
import {SongInput} from '@/components/music-schedule/song-input'
import {Button} from '@/components/ui/button'
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card'
import {Checkbox} from '@/components/ui/checkbox'
import {Input} from '@/components/ui/input'
import {Label} from '@/components/ui/label'
import {Sheet, SheetContent, SheetHeader, SheetTitle} from '@/components/ui/sheet'
import {PageSpinner} from '@/components/ui/spinner'
import {applyMusicScan, discardMusicScan, fetchMusicScan, musicScanKeys, updateMusicScan} from '@/lib/music-scan-api'
import type {MusicScan, ProposedLine, ProposedService, ScanFlag, ScanServicePatch} from '@/lib/music-scan-types'
import {musicScheduleKeys} from '@/lib/music-schedule-api'
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

const activeLines = (s: ProposedService) => (s.orderMode === 'scanned' ? s.scannedLines : s.usualLines)

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
            Photos
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

      <div className="grid items-start gap-6 lg:grid-cols-[1fr_460px]">
        <div className="space-y-4">
          {proposal.services.map((s) => (
            <ServiceReview key={s.serviceTimeId} service={s} disabled={applied} onPatch={update} />
          ))}
        </div>
        <aside className="hidden lg:sticky lg:top-4 lg:block">
          <ScanPhotoViewer photos={scan.photos} className="h-[calc(100vh-7rem)]" />
        </aside>
      </div>

      <Sheet open={photosOpen} onOpenChange={setPhotosOpen}>
        <SheetContent side="right" className="w-[90vw] sm:max-w-[90vw]">
          <SheetHeader>
            <SheetTitle>Scanned pages</SheetTitle>
          </SheetHeader>
          <ScanPhotoViewer photos={scan.photos} className="h-[calc(100vh-6rem)] px-4 pb-4" />
        </SheetContent>
      </Sheet>
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
  const lines = activeLines(s)
  const serviceFlags = s.flags.filter((f) => f.lineIndex == null)
  const flagsAt = (i: number) => s.flags.filter((f) => f.lineIndex === i)
  const id = s.serviceTimeId
  const setLine = (i: number, next: Partial<ProposedLine>) =>
    onPatch({serviceTimeId: id, lines: lines.map((l, j) => (j === i ? {...l, ...next} : l))})

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

        {s.orderDiffers ? (
          <div className="flex flex-wrap items-center gap-2 rounded border border-sky-200 bg-sky-50 p-2 text-sm text-sky-900">
            <span className="font-medium">Order differs from usual.</span>
            <div className="ml-auto flex gap-1">
              <Button
                size="sm"
                variant={s.orderMode === 'scanned' ? 'default' : 'outline'}
                disabled={disabled}
                onClick={() => onPatch({serviceTimeId: id, orderMode: 'scanned'})}
              >
                Use the sheet&rsquo;s order
              </Button>
              <Button
                size="sm"
                variant={s.orderMode === 'usual' ? 'default' : 'outline'}
                disabled={disabled}
                onClick={() => onPatch({serviceTimeId: id, orderMode: 'usual'})}
              >
                Keep usual, fill songs
              </Button>
            </div>
          </div>
        ) : null}

        <ol className="divide-y rounded border">
          {lines.map((l, i) => (
            <li key={i} className="space-y-1 p-2">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground w-24 shrink-0 truncate text-xs">{ROLE_LABELS[l.role]}</span>
                {l.kind === 'song' ? (
                  <SongInput
                    className="min-w-0 flex-1"
                    value={songValue(l)}
                    onCommit={(next) => setLine(i, songPatch(next))}
                  />
                ) : (
                  <span className="min-w-0 flex-1 truncate text-sm">{l.text}</span>
                )}
                {l.suffix ? <span className="text-muted-foreground shrink-0 text-xs">{l.suffix}</span> : null}
                <StatusTag status={l.status} />
              </div>
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
          ))}
        </ol>

        {s.orderMode === 'scanned' && s.removedLines.length ? (
          <div className="text-muted-foreground text-xs">
            Not on the sheet, so left out: {s.removedLines.map((t) => `“${t}”`).join(', ')}
          </div>
        ) : null}

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

function StatusTag({status}: {status: ProposedLine['status']}) {
  if (status === 'unchanged') return null
  return (
    <span
      className={
        status === 'added'
          ? 'shrink-0 rounded bg-sky-100 px-1.5 py-0.5 text-xs text-sky-900'
          : 'shrink-0 rounded bg-green-100 px-1.5 py-0.5 text-xs text-green-900'
      }
    >
      {status === 'added' ? 'new line' : 'song filled'}
    </span>
  )
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
