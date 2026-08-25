import {BoothServiceBlock, MusicServiceBlock} from '@/components/music-schedule/service-block'
import {PAGE_PADDING_X_PX, PAGE_WIDTH_PX} from '@/components/print/page-frame'
import {Button} from '@/components/ui/button'
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card'
import {Checkbox} from '@/components/ui/checkbox'
import {Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle} from '@/components/ui/dialog'
import {Input} from '@/components/ui/input'
import {Label} from '@/components/ui/label'
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select'
import {PageSpinner} from '@/components/ui/spinner'
import {Tooltip, TooltipContent, TooltipTrigger} from '@/components/ui/tooltip'
import {fetchServiceTimes} from '@/lib/attendance-api'
import {
  type LineInput,
  type MusicService,
  fetchMusicWeek,
  musicScheduleKeys,
  rewriteBoothLine,
  saveBoothLines,
  saveMusicLines,
  saveServiceAsDefault,
  updateMusicService,
} from '@/lib/music-schedule-api'
import {
  type MusicBoothSlot,
  type MusicLineRole,
  type OrderLine,
  ROLE_DEFAULTS,
  ROLE_LABELS,
  formatServiceTime,
} from '@/lib/music-schedule-core'
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'
import {ArrowLeft, ChevronDown, ChevronUp, Eye, Plus, RefreshCw, Settings2, Trash2} from 'lucide-react'
import {type ReactElement, type ReactNode, useEffect, useRef, useState} from 'react'
import {useNavigate, useParams} from 'react-router-dom'
import {toast} from 'sonner'

import {SongButton} from './song-picker'

const ROLES = Object.keys(ROLE_LABELS) as MusicLineRole[]

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

// The two notes that get written week after week. Both the Title note and the
// Text note offer the same pair, in the same order — either can be either.
const DEFAULT_TITLE_NOTE = '(Pastor Candee)'
const DEFAULT_TEXT_NOTE = '(Preacher)'

const SLOT_LABELS: Record<MusicBoothSlot, string> = {
  motto_verse_theme: 'Motto / Verse / Theme',
  prayer_announcements: 'Prayer, Announcements, Pastor’s Selection',
}

type Draft = OrderLine & {tempKey: string}

function emptyLine(kind: OrderLine['kind'], sortOrder: number): Draft {
  return {
    id: -1,
    tempKey: `new-${sortOrder}-${Math.random().toString(36).slice(2)}`,
    kind,
    role: 'plain',
    hymnId: null,
    hymnBook: null,
    hymnNumber: null,
    hymnTitle: null,
    freeSongTitle: null,
    suffix: '',
    leftText: '',
    text: '',
    merged: null,
    align: null,
    bold: null,
    italic: false,
    highlight: false,
    boothHighlight: false,
    sticky: false,
    booth: 'auto',
    boothLabel: '',
    boothNote: '',
    sortOrder,
  }
}

function toInput(l: Draft): LineInput {
  return {
    kind: l.kind,
    role: l.role,
    hymnId: l.hymnId,
    freeSongTitle: l.freeSongTitle,
    suffix: l.suffix,
    leftText: l.leftText,
    text: l.text,
    merged: l.merged,
    align: l.align,
    bold: l.bold,
    italic: l.italic,
    highlight: l.highlight,
    boothHighlight: l.boothHighlight,
    sticky: l.sticky,
    booth: l.booth,
    boothLabel: l.boothLabel,
    boothNote: l.boothNote,
  }
}

export function MusicServiceEditorPage() {
  const {id, serviceId} = useParams<{id: string; serviceId: string}>()
  const weekId = Number(id)
  const svcId = Number(serviceId)
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const {data: week} = useQuery({
    queryKey: musicScheduleKeys.detail(weekId),
    queryFn: () => fetchMusicWeek(weekId),
    enabled: Number.isFinite(weekId),
  })
  const {data: serviceTimes} = useQuery({queryKey: ['service-times'], queryFn: () => fetchServiceTimes()})

  const service = week?.services.find((s) => s.id === svcId)
  const [lines, setLines] = useState<Draft[]>([])
  const [booth, setBooth] = useState<{slot: MusicBoothSlot; text: string; highlight: boolean; stale: boolean}[]>([])
  const [expanded, setExpanded] = useState<string | null>(null)
  const [showOverrides, setShowOverrides] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)

  // Re-sync the draft when the server copy changes (after a save invalidates
  // and refetches) — the same pattern the settings panes use.
  useEffect(() => {
    if (!service) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLines(service.lines.map((l, i) => ({...l, tempKey: `l-${l.id}-${i}`})))
    setBooth(service.boothLines.map((b) => ({slot: b.slot, text: b.text, highlight: b.highlight, stale: b.stale})))
  }, [service])

  // Deep link from the preview: /…/service/:serviceId#line-<id>
  useEffect(() => {
    if (!lines.length) return
    const hash = window.location.hash
    if (!hash.startsWith('#line-')) return
    document.getElementById(hash.slice(1))?.scrollIntoView({block: 'center'})
  }, [lines.length])

  const patchService = useMutation({
    mutationFn: (body: Record<string, unknown>) => updateMusicService(weekId, svcId, body),
    onSuccess: () => queryClient.invalidateQueries({queryKey: musicScheduleKeys.detail(weekId)}),
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed to save'),
  })

  const saveLines = useMutation({
    mutationFn: () => saveMusicLines(weekId, svcId, lines.map(toInput)),
    onSuccess: () => {
      queryClient.invalidateQueries({queryKey: musicScheduleKeys.detail(weekId)})
      toast.success('Service saved')
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed to save'),
  })

  const saveBooth = useMutation({
    mutationFn: () =>
      saveBoothLines(
        weekId,
        svcId,
        booth.map(({slot, text, highlight}) => ({slot, text, highlight})),
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({queryKey: musicScheduleKeys.detail(weekId)})
      toast.success('Sound Booth lines saved')
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed to save'),
  })

  const saveDefault = useMutation({
    mutationFn: () => saveServiceAsDefault(weekId, svcId),
    onSuccess: (r) => toast.success(`Saved ${r.lines} lines as the default for this service`),
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed to save default'),
  })

  const rewrite = useMutation({
    mutationFn: (slot: MusicBoothSlot) => rewriteBoothLine(weekId, svcId, slot),
    onSuccess: () => queryClient.invalidateQueries({queryKey: musicScheduleKeys.detail(weekId)}),
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed to rewrite'),
  })

  if (!week || !service) return <PageSpinner />

  const update = (i: number, patch: Partial<Draft>) =>
    setLines((prev) => prev.map((l, idx) => (idx === i ? {...l, ...patch} : l)))

  const move = (i: number, delta: number) =>
    setLines((prev) => {
      const next = [...prev]
      const j = i + delta
      if (j < 0 || j >= next.length) return prev
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })

  const overridesSet =
    !!service.nameOverride || !!service.timeOverride || !!service.musicHeadingOverride || !!service.boothHeadingOverride

  // What the sheets would print right now, unsaved edits included.
  const preview: MusicService = {
    ...service,
    lines,
    boothLines: service.boothLines.map((bl) => {
      const local = booth.find((b) => b.slot === bl.slot)
      return local ? {...bl, text: local.text, highlight: local.highlight} : bl
    }),
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(`/schedules/music/${weekId}`)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h2 className="text-2xl font-bold">{service.name}</h2>
        <span className="text-muted-foreground text-sm">
          {service.date} · {formatServiceTime(service.time)}
          {service.episodeNumber != null ? ` · #${service.episodeNumber}` : ''}
        </span>
        <div className="ml-auto flex gap-2">
          {service.serviceTimeId != null ? (
            <Tip label="Store this Service Order as the starting point for every future week of this service">
              <Button size="sm" variant="outline" onClick={() => saveDefault.mutate()} disabled={saveDefault.isPending}>
                Save as default order
              </Button>
            </Tip>
          ) : null}
          <Button size="sm" onClick={() => saveLines.mutate()} disabled={saveLines.isPending}>
            Save service
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-base">Service</CardTitle>
          <Tip
            label={overridesSet ? 'Overrides are set — name, headings or time' : 'Override the name, headings, time'}
          >
            <Button
              size="sm"
              variant="ghost"
              className={overridesSet ? 'text-sky-600' : ''}
              onClick={() => setShowOverrides((v) => !v)}
            >
              <Settings2 className="mr-1 h-3.5 w-3.5" />
              Overrides
            </Button>
          </Tip>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <p className="text-muted-foreground text-xs md:col-span-2">
            Every field on this page takes inline markup: <MarkupHint /> .
          </p>
          <Field label="Service">
            <Select
              value={service.serviceTimeId == null ? 'none' : String(service.serviceTimeId)}
              onValueChange={(v) =>
                // The Service Time carries the name, the time and the two
                // headings — switching it clears any per-week override so the
                // new service's own values come through.
                patchService.mutate({serviceTimeId: v === 'none' ? null : Number(v), name: '', time: null})
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(serviceTimes ?? []).map((t) => (
                  <SelectItem key={t.id} value={String(t.id)}>
                    {t.name} — {DAY_NAMES[t.dayOfWeek]} {formatServiceTime(t.time)}
                  </SelectItem>
                ))}
                <SelectItem value="none">One-off (no Service Time)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-muted-foreground text-xs">
              {service.date} · {formatServiceTime(service.time)} · prints as “{service.musicHeading}” /{' '}
              {service.boothHeading}
            </p>
          </Field>

          <Field label="Podcast episode">
            <div className="flex flex-wrap items-center gap-2">
              <Tip label="Lower the episode number">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => patchService.mutate({episodeNumber: Math.max(1, (service.episodeNumber ?? 1) - 1)})}
                >
                  −
                </Button>
              </Tip>
              <span className="w-14 text-center text-sm">
                {service.episodeNumber != null ? `#${service.episodeNumber}` : '—'}
              </span>
              <Tip label="Raise the episode number">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => patchService.mutate({episodeNumber: (service.episodeNumber ?? 0) + 1})}
                >
                  +
                </Button>
              </Tip>

              <Tip label="This service goes on the podcast feed, so it gets an episode number. Sunday School is off.">
                <label className="ml-3 flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={service.uploaded}
                    onCheckedChange={(v) => patchService.mutate({uploaded: v === true})}
                  />
                  Uploaded
                </label>
              </Tip>
              <Tip label="This service is happening this week. Unchecked, it is left off both printed sheets.">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={service.meeting}
                    onCheckedChange={(v) => patchService.mutate({meeting: v === true})}
                  />
                  Meeting
                </label>
              </Tip>
            </div>
          </Field>

          <Field label="Title">
            <Input defaultValue={service.title} onBlur={(e) => patchService.mutate({title: e.target.value})} />
          </Field>
          <Field label="Title note (prints only when set)">
            <NoteField
              value={service.titleNote}
              highlight={service.titleHighlight}
              suggestions={[DEFAULT_TITLE_NOTE, DEFAULT_TEXT_NOTE]}
              placeholder={DEFAULT_TITLE_NOTE}
              onChange={(titleNote) => patchService.mutate({titleNote})}
              onHighlight={(titleHighlight) => patchService.mutate({titleHighlight})}
            />
          </Field>
          <Field label="Text">
            <Input defaultValue={service.scripture} onBlur={(e) => patchService.mutate({scripture: e.target.value})} />
          </Field>
          <Field label="Text note (prints only when set)">
            <NoteField
              value={service.scriptureNote}
              highlight={service.scriptureHighlight}
              suggestions={[DEFAULT_TITLE_NOTE, DEFAULT_TEXT_NOTE]}
              placeholder={DEFAULT_TITLE_NOTE}
              onChange={(scriptureNote) => patchService.mutate({scriptureNote})}
              onHighlight={(scriptureHighlight) => patchService.mutate({scriptureHighlight})}
            />
          </Field>
        </CardContent>

        {showOverrides ? (
          <CardContent className="grid gap-3 border-t pt-4 md:grid-cols-2">
            <p className="text-muted-foreground md:col-span-2 text-xs">
              Blank means “take it from the Service Time”. Set one only when this week differs.
            </p>
            <Field label="Name">
              <Input
                defaultValue={service.nameOverride}
                placeholder={service.nameDefault || 'from the Service Time'}
                onBlur={(e) => patchService.mutate({name: e.target.value})}
              />
            </Field>
            <Field label="Time">
              <Input
                type="time"
                defaultValue={service.timeOverride ?? ''}
                onBlur={(e) => patchService.mutate({time: e.target.value || null})}
              />
            </Field>
            <Field label="Music Sheet heading">
              <Input
                defaultValue={service.musicHeadingOverride}
                placeholder={service.musicHeadingDefault || 'from Schedules settings'}
                onBlur={(e) => patchService.mutate({musicHeading: e.target.value})}
              />
            </Field>
            <Field label="Sound Booth heading">
              <Input
                defaultValue={service.boothHeadingOverride}
                placeholder={service.boothHeadingDefault || 'from Schedules settings'}
                onBlur={(e) => patchService.mutate({boothHeading: e.target.value})}
              />
            </Field>
          </CardContent>
        ) : null}
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-base">Service Order</CardTitle>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setLines((p) => [...p, emptyLine('prose', p.length)])}>
              <Plus className="mr-1 h-3 w-3" /> Line
            </Button>
            <Button size="sm" variant="outline" onClick={() => setLines((p) => [...p, emptyLine('song', p.length)])}>
              <Plus className="mr-1 h-3 w-3" /> Song
            </Button>
            <Tip label="Force the rest of this service onto the next printed page">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setLines((p) => [...p, emptyLine('page_break', p.length)])}
              >
                <Plus className="mr-1 h-3 w-3" /> Page break
              </Button>
            </Tip>
          </div>
        </CardHeader>
        <CardContent className="space-y-1">
          {lines.map((line, i) => (
            <LineRow
              key={line.tempKey}
              line={line}
              expanded={expanded === line.tempKey}
              onToggleExpanded={() => setExpanded((prev) => (prev === line.tempKey ? null : line.tempKey))}
              onChange={(patch) => update(i, patch)}
              onMove={(delta) => move(i, delta)}
              onDelete={() => setLines((p) => p.filter((_, idx) => idx !== i))}
            />
          ))}
          <p className="text-muted-foreground pt-2 text-xs">
            Bold, italic and underline are inline markup — <MarkupHint /> — so they mark the words that need them rather
            than the whole line. Everything else — the left cell, the layout, what the Sound Booth sheet does with a
            line — defaults from the role; open a line only when this week needs something different.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-base">Sound Booth condensed lines</CardTitle>
          <Button size="sm" onClick={() => saveBooth.mutate()} disabled={saveBooth.isPending}>
            Save lines
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-muted-foreground text-xs">
            Written by hand for the sound team, drafted from the Service Order. Inline markup: <MarkupHint /> .
          </p>
          {booth.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              None yet — they appear once this service has Motto/Verse/Theme or a Pastor’s Selection line.
            </p>
          ) : null}
          {booth.map((b, i) => (
            <div key={b.slot} className="space-y-1">
              <Label className="text-xs">{SLOT_LABELS[b.slot]}</Label>
              <div className="flex items-center gap-2">
                <Input
                  value={b.text}
                  onChange={(e) => setBooth((p) => p.map((x, idx) => (idx === i ? {...x, text: e.target.value} : x)))}
                />
                <Toggle
                  on={b.highlight}
                  title="Highlight this line on the printed sheet"
                  onClick={() => setBooth((p) => p.map((x, idx) => (idx === i ? {...x, highlight: !x.highlight} : x)))}
                >
                  ▒
                </Toggle>
                <Tip label="Replace this wording with a fresh draft from the Service Order">
                  <Button size="sm" variant="outline" onClick={() => rewrite.mutate(b.slot)}>
                    <RefreshCw className="mr-1 h-3 w-3" /> Rewrite
                  </Button>
                </Tip>
              </div>
              {b.stale ? (
                <p className="text-xs text-amber-700">
                  Drafted from roles that have since changed — rewrite to take a fresh draft, or leave your wording.
                </p>
              ) : null}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Stays put while the order scrolls, so the printed shape is one click away. */}
      <Tip label="See how this service prints, unsaved edits included">
        <Button
          className="fixed bottom-6 left-1/2 z-40 -translate-x-1/2 shadow-lg"
          onClick={() => setPreviewOpen(true)}
        >
          <Eye className="mr-2 h-4 w-4" />
          Preview
        </Button>
      </Tip>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>{service.name} — preview</DialogTitle>
            <DialogDescription>
              Both sheets as this service would print, at page width. Unsaved edits are included; the Sound Booth block
              uses the condensed lines as typed.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <h4 className="text-muted-foreground mb-1 text-sm font-medium">Musicians</h4>
              <FitWidth>
                <MusicServiceBlock service={preview} />
              </FitWidth>
            </div>
            <div>
              <h4 className="text-muted-foreground mb-1 text-sm font-medium">Sound Booth</h4>
              <FitWidth>
                <BoothServiceBlock service={preview} showRule={false} />
              </FitWidth>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/** The one place the inline markup is spelled out, so both cards say the same thing. */
function MarkupHint() {
  return (
    <>
      <code>*bold*</code>, <code>__italic__</code>, <code>_underline_</code>
    </>
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

/** A tooltip that says what a control does — every icon-only button gets one. */
function Tip({label, children}: {label: string; children: ReactElement}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

/**
 * Renders one print block at the real page width, scaled down to whatever the
 * container gives it — the preview is the print node, never a re-layout of it
 * (ADR 0021).
 */
function FitWidth({children}: {children: ReactNode}) {
  const outerRef = useRef<HTMLDivElement>(null)
  const innerRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  const [height, setHeight] = useState(0)

  useEffect(() => {
    const outer = outerRef.current
    const inner = innerRef.current
    if (!outer || !inner) return
    const measure = () => {
      const s = Math.min(1, outer.clientWidth / PAGE_WIDTH_PX)
      setScale(s)
      setHeight(inner.offsetHeight * s)
    }
    const observer = new ResizeObserver(measure)
    observer.observe(outer)
    observer.observe(inner)
    return () => observer.disconnect()
  }, [])

  return (
    <div ref={outerRef} className="overflow-hidden rounded border bg-white">
      <div style={{height}}>
        <div
          ref={innerRef}
          style={{
            width: PAGE_WIDTH_PX,
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
            padding: `16px ${PAGE_PADDING_X_PX}px`,
            boxSizing: 'border-box',
            backgroundColor: '#ffffff',
            color: '#000000',
            fontFamily: 'Arial, Helvetica, sans-serif',
          }}
        >
          {children}
        </div>
      </div>
    </div>
  )
}

function Toggle({
  on,
  onClick,
  title,
  children,
}: {
  on: boolean
  onClick: () => void
  title?: string
  children: React.ReactNode
}) {
  const button = (
    <Button
      type="button"
      size="icon"
      variant={on ? 'default' : 'outline'}
      onClick={onClick}
      className="h-7 w-7 shrink-0 text-xs"
    >
      {children}
    </Button>
  )
  return title ? <Tip label={title}>{button}</Tip> : button
}

/** Free text, with the notes written week after week offered as one-click fills. */
function NoteField({
  value,
  highlight,
  suggestions,
  placeholder,
  onChange,
  onHighlight,
}: {
  value: string
  highlight: boolean
  suggestions: string[]
  placeholder: string
  onChange: (v: string) => void
  onHighlight: (v: boolean) => void
}) {
  const unique = suggestions.filter((s, i) => s && suggestions.indexOf(s) === i)
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <Input
          defaultValue={value}
          placeholder={`${placeholder} — blank prints nothing`}
          onBlur={(e) => onChange(e.target.value)}
        />
        <Toggle on={highlight} title="Highlight this note on the printed sheet" onClick={() => onHighlight(!highlight)}>
          ▒
        </Toggle>
      </div>
      {unique.length ? (
        <div className="flex flex-wrap gap-1">
          {unique.slice(0, 8).map((s) => (
            <Button
              key={s}
              type="button"
              size="sm"
              variant="outline"
              className="h-6 px-2 text-xs"
              onClick={() => onChange(s)}
            >
              {s}
            </Button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

/**
 * One line of the Service Order. Everything used week to week sits on the one
 * visible row; the role defaults handle the rest, so the overrides live behind
 * a disclosure rather than facing you twelve times down the page.
 */
function LineRow({
  line,
  expanded,
  onToggleExpanded,
  onChange,
  onMove,
  onDelete,
}: {
  line: Draft
  expanded: boolean
  onToggleExpanded: () => void
  onChange: (patch: Partial<Draft>) => void
  onMove: (delta: number) => void
  onDelete: () => void
}) {
  const d = ROLE_DEFAULTS[line.role]
  const overridden =
    line.merged !== null ||
    line.align !== null ||
    line.booth !== 'auto' ||
    line.boothHighlight ||
    !!line.leftText ||
    !!line.boothLabel ||
    !!line.boothNote

  if (line.kind === 'page_break')
    return (
      <div className="text-muted-foreground flex items-center gap-2 rounded border border-dashed px-2 py-1 text-xs">
        <MoveButtons onMove={onMove} />
        <span className="flex-1">── page break ──</span>
        <Tip label="Delete this page break">
          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={onDelete}>
            <Trash2 className="h-3 w-3" />
          </Button>
        </Tip>
      </div>
    )

  return (
    <div className={`rounded border ${expanded ? 'bg-muted/30' : ''}`}>
      <div className="flex items-center gap-2 px-2 py-1">
        <MoveButtons onMove={onMove} />

        <Select value={line.role} onValueChange={(v) => onChange({role: v as MusicLineRole})}>
          <Tip label="What this line is — sets the left cell, the layout and whether the Sound Booth sheet shows it">
            <SelectTrigger size="sm" className="w-36 shrink-0">
              <SelectValue />
            </SelectTrigger>
          </Tip>
          <SelectContent>
            {ROLES.map((r) => (
              <SelectItem key={r} value={r}>
                {ROLE_LABELS[r]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {line.kind === 'song' ? (
          <>
            <SongButton
              value={{
                hymnId: line.hymnId,
                hymnBook: line.hymnBook,
                hymnNumber: line.hymnNumber,
                hymnTitle: line.hymnTitle,
                freeSongTitle: line.freeSongTitle,
                text: line.text,
              }}
              onChange={(patch) => onChange(patch as Partial<Draft>)}
            />
            <Tip label="Printed after the song, in light type — “(x2)”, “(& Tag)”">
              <div className="shrink-0">
                <Input
                  className="h-8 w-28 text-xs"
                  placeholder="(x2)"
                  value={line.suffix}
                  onChange={(e) => onChange({suffix: e.target.value})}
                />
              </div>
            </Tip>
          </>
        ) : (
          <Input
            className="h-8 flex-1 text-xs"
            placeholder="text"
            value={line.text}
            onChange={(e) => onChange({text: e.target.value})}
          />
        )}

        <Toggle
          on={line.highlight}
          onClick={() => onChange({highlight: !line.highlight})}
          title="Highlight this line on the Musicians sheet"
        >
          ▒
        </Toggle>
        <Tip label={overridden ? 'Overrides set — left cell, layout, Sound Booth' : 'More options for this line'}>
          <Button
            size="icon"
            variant="ghost"
            className={`h-7 w-7 ${overridden ? 'text-sky-600' : ''}`}
            onClick={onToggleExpanded}
          >
            <Settings2 className="h-3.5 w-3.5" />
          </Button>
        </Tip>
        <Tip label="Delete this line">
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onDelete}>
            <Trash2 className="h-3 w-3" />
          </Button>
        </Tip>
      </div>

      {expanded ? (
        <div className="space-y-2 border-t px-2 py-2 text-xs">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <Labelled label="Left cell">
              <Input
                className="h-7 text-xs"
                placeholder={d.leftLabel === null ? 'reference (auto)' : d.leftLabel || 'empty (auto)'}
                value={line.leftText}
                onChange={(e) => onChange({leftText: e.target.value})}
              />
            </Labelled>
            <Labelled label="Layout">
              <div className="flex gap-1">
                <Select
                  value={line.merged === null ? 'auto' : line.merged ? 'merged' : 'split'}
                  onValueChange={(v) => onChange({merged: v === 'auto' ? null : v === 'merged'})}
                >
                  <Tip label="Split fills both cells; merged spans the width of the page">
                    <SelectTrigger size="sm" className="flex-1">
                      <SelectValue />
                    </SelectTrigger>
                  </Tip>
                  <SelectContent>
                    <SelectItem value="auto">auto ({d.merged ? 'merged' : 'split'})</SelectItem>
                    <SelectItem value="split">split</SelectItem>
                    <SelectItem value="merged">merged</SelectItem>
                  </SelectContent>
                </Select>
                <Select
                  value={line.align ?? 'auto'}
                  onValueChange={(v) => onChange({align: v === 'auto' ? null : (v as 'left' | 'center')})}
                >
                  <Tip label="How a merged line sits across the page">
                    <SelectTrigger size="sm" className="flex-1">
                      <SelectValue />
                    </SelectTrigger>
                  </Tip>
                  <SelectContent>
                    <SelectItem value="auto">align: auto</SelectItem>
                    <SelectItem value="left">left</SelectItem>
                    <SelectItem value="center">centre</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </Labelled>
            {line.kind === 'song' ? (
              <label className="flex items-end gap-2 pb-1.5">
                <Checkbox checked={line.sticky} onCheckedChange={(v) => onChange({sticky: v === true})} />
                Keep this song when the week copies forward
              </label>
            ) : (
              <div />
            )}
          </div>

          {/* The four Sound Booth settings stay on one row, in the order they
              read on the sheet: whether it shows, its label, its note, its band. */}
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <Labelled label="Sound Booth">
              <Select value={line.booth} onValueChange={(v) => onChange({booth: v as OrderLine['booth']})}>
                <Tip label="Whether the sound team's sheet carries this line">
                  <SelectTrigger size="sm" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                </Tip>
                <SelectContent>
                  <SelectItem value="auto">auto ({d.booth})</SelectItem>
                  <SelectItem value="include">always show</SelectItem>
                  <SelectItem value="exclude">never show</SelectItem>
                </SelectContent>
              </Select>
            </Labelled>
            <Labelled label="Booth label">
              <Input
                className="h-7 text-xs"
                placeholder={d.boothLabel || 'auto'}
                value={line.boothLabel}
                onChange={(e) => onChange({boothLabel: e.target.value})}
              />
            </Labelled>
            <Labelled label="Booth note">
              <Input
                className="h-7 text-xs"
                placeholder={d.boothNote || 'not printed'}
                value={line.boothNote}
                onChange={(e) => onChange({boothNote: e.target.value})}
              />
            </Labelled>
            <Labelled label="Booth highlight">
              <Select
                value={line.boothHighlight ? 'yes' : 'no'}
                onValueChange={(v) => onChange({boothHighlight: v === 'yes'})}
              >
                <Tip label="Highlight this line on the Sound Booth sheet — set separately from the Musicians sheet">
                  <SelectTrigger size="sm" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                </Tip>
                <SelectContent>
                  <SelectItem value="no">No</SelectItem>
                  <SelectItem value="yes">Yes</SelectItem>
                </SelectContent>
              </Select>
            </Labelled>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function MoveButtons({onMove}: {onMove: (delta: number) => void}) {
  return (
    <div className="flex shrink-0 flex-col">
      <Tip label="Move this line up">
        <Button size="icon" variant="ghost" className="h-4 w-5" onClick={() => onMove(-1)}>
          <ChevronUp className="h-3 w-3" />
        </Button>
      </Tip>
      <Tip label="Move this line down">
        <Button size="icon" variant="ghost" className="h-4 w-5" onClick={() => onMove(1)}>
          <ChevronDown className="h-3 w-3" />
        </Button>
      </Tip>
    </div>
  )
}

function Labelled({label, children}: {label: string; children: React.ReactNode}) {
  return (
    <div className="space-y-1">
      <span className="text-muted-foreground">{label}</span>
      {children}
    </div>
  )
}
