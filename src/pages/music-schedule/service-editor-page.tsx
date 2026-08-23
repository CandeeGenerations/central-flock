import {Button} from '@/components/ui/button'
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card'
import {Checkbox} from '@/components/ui/checkbox'
import {Input} from '@/components/ui/input'
import {Label} from '@/components/ui/label'
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select'
import {PageSpinner} from '@/components/ui/spinner'
import {fetchPeople} from '@/lib/api'
import {
  type LineInput,
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
import {ArrowLeft, ChevronDown, ChevronUp, Plus, RefreshCw, Settings2, Trash2} from 'lucide-react'
import {useEffect, useState} from 'react'
import {useNavigate, useParams} from 'react-router-dom'
import {toast} from 'sonner'

import {SongButton} from './song-picker'

const ROLES = Object.keys(ROLE_LABELS) as MusicLineRole[]

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
  const {data: preachers} = useQuery({
    queryKey: ['people', 'preachers'],
    queryFn: () => fetchPeople({isPreacher: '1', limit: 200}),
  })

  const service = week?.services.find((s) => s.id === svcId)
  const [lines, setLines] = useState<Draft[]>([])
  const [booth, setBooth] = useState<{slot: MusicBoothSlot; text: string; highlight: boolean; stale: boolean}[]>([])
  const [expanded, setExpanded] = useState<string | null>(null)

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
            <Button size="sm" variant="outline" onClick={() => saveDefault.mutate()} disabled={saveDefault.isPending}>
              Save as default order
            </Button>
          ) : null}
          <Button size="sm" onClick={() => saveLines.mutate()} disabled={saveLines.isPending}>
            Save service
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Service</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <Field label="Music Sheet heading">
            <Input
              defaultValue={service.musicHeading}
              onBlur={(e) => patchService.mutate({musicHeading: e.target.value})}
            />
          </Field>
          <Field label="Sound Booth heading">
            <Input
              defaultValue={service.boothHeading}
              onBlur={(e) => patchService.mutate({boothHeading: e.target.value})}
            />
          </Field>
          <Field label="Time">
            <Input
              type="time"
              defaultValue={service.time ?? ''}
              onBlur={(e) => patchService.mutate({time: e.target.value || null})}
            />
          </Field>
          <Field label="Episode number">
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => patchService.mutate({episodeNumber: Math.max(1, (service.episodeNumber ?? 1) - 1)})}
              >
                −
              </Button>
              <span className="w-14 text-center text-sm">
                {service.episodeNumber != null ? `#${service.episodeNumber}` : '—'}
              </span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => patchService.mutate({episodeNumber: (service.episodeNumber ?? 0) + 1})}
              >
                +
              </Button>
              <label className="ml-3 flex items-center gap-2 text-sm">
                <Checkbox
                  checked={service.uploaded}
                  onCheckedChange={(v) => patchService.mutate({uploaded: v === true})}
                />
                uploaded
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={service.meeting}
                  onCheckedChange={(v) => patchService.mutate({meeting: v === true})}
                />
                meeting
              </label>
            </div>
          </Field>

          <Field label="Title">
            <Input defaultValue={service.title} onBlur={(e) => patchService.mutate({title: e.target.value})} />
          </Field>
          <Field label="Title note (prints only when set)">
            <NoteField
              value={service.titleNote}
              highlight={service.titleHighlight}
              preachers={(preachers?.data ?? []).map((p) => `${p.firstName} ${p.lastName}`.trim())}
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
              preachers={(preachers?.data ?? []).map((p) => `${p.firstName} ${p.lastName}`.trim())}
              onChange={(scriptureNote) => patchService.mutate({scriptureNote})}
              onHighlight={(scriptureHighlight) => patchService.mutate({scriptureHighlight})}
            />
          </Field>
        </CardContent>
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
            <Button
              size="sm"
              variant="outline"
              onClick={() => setLines((p) => [...p, emptyLine('page_break', p.length)])}
            >
              <Plus className="mr-1 h-3 w-3" /> Page break
            </Button>
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
            Wrap a word in _underscores_ to underline it. Everything else — the left cell, the layout, what the Sound
            Booth sheet does with a line — defaults from the role; open a line only when this week needs something
            different.
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
                  onClick={() => setBooth((p) => p.map((x, idx) => (idx === i ? {...x, highlight: !x.highlight} : x)))}
                >
                  ▒
                </Toggle>
                <Button size="sm" variant="outline" onClick={() => rewrite.mutate(b.slot)}>
                  <RefreshCw className="mr-1 h-3 w-3" /> Rewrite
                </Button>
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
    </div>
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
  return (
    <Button
      type="button"
      size="icon"
      variant={on ? 'default' : 'outline'}
      title={title}
      onClick={onClick}
      className="h-7 w-7 shrink-0 text-xs"
    >
      {children}
    </Button>
  )
}

/** Free text, with the preacher list offered as one-click fills. */
function NoteField({
  value,
  highlight,
  preachers,
  onChange,
  onHighlight,
}: {
  value: string
  highlight: boolean
  preachers: string[]
  onChange: (v: string) => void
  onHighlight: (v: boolean) => void
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <Input defaultValue={value} placeholder="(blank = not printed)" onBlur={(e) => onChange(e.target.value)} />
        <Toggle on={highlight} onClick={() => onHighlight(!highlight)}>
          ▒
        </Toggle>
      </div>
      {preachers.length ? (
        <div className="flex flex-wrap gap-1">
          {preachers.slice(0, 8).map((p) => (
            <Button
              key={p}
              type="button"
              size="sm"
              variant="outline"
              className="h-6 px-2 text-xs"
              onClick={() => onChange(`(${p})`)}
            >
              {p}
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
    line.bold !== null ||
    line.booth !== 'auto' ||
    !!line.leftText ||
    !!line.boothLabel ||
    !!line.boothNote

  if (line.kind === 'page_break')
    return (
      <div className="text-muted-foreground flex items-center gap-2 rounded border border-dashed px-2 py-1 text-xs">
        <MoveButtons onMove={onMove} />
        <span className="flex-1">── page break ──</span>
        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={onDelete}>
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>
    )

  return (
    <div className={`rounded border ${expanded ? 'bg-muted/30' : ''}`}>
      <div className="flex items-center gap-2 px-2 py-1">
        <MoveButtons onMove={onMove} />

        <Select value={line.role} onValueChange={(v) => onChange({role: v as MusicLineRole})}>
          <SelectTrigger size="sm" className="w-36 shrink-0">
            <SelectValue />
          </SelectTrigger>
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
            <Input
              className="h-8 w-28 shrink-0 text-xs"
              placeholder="(x2)"
              value={line.suffix}
              onChange={(e) => onChange({suffix: e.target.value})}
            />
          </>
        ) : (
          <Input
            className="h-8 flex-1 text-xs"
            placeholder="text"
            value={line.text}
            onChange={(e) => onChange({text: e.target.value})}
          />
        )}

        <Toggle on={line.highlight} onClick={() => onChange({highlight: !line.highlight})} title="Highlight">
          ▒
        </Toggle>
        <Button
          size="icon"
          variant="ghost"
          className={`h-7 w-7 ${overridden ? 'text-sky-600' : ''}`}
          title={overridden ? 'Overrides set' : 'More options'}
          onClick={onToggleExpanded}
        >
          <Settings2 className="h-3.5 w-3.5" />
        </Button>
        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onDelete}>
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>

      {expanded ? (
        <div className="grid gap-2 border-t px-2 py-2 text-xs sm:grid-cols-2 lg:grid-cols-3">
          <Labelled label="Left cell">
            <Input
              className="h-7 text-xs"
              placeholder={d.leftLabel === null ? 'reference (auto)' : d.leftLabel || 'empty (auto)'}
              value={line.leftText}
              onChange={(e) => onChange({leftText: e.target.value})}
            />
          </Labelled>
          <Labelled label="Style">
            <div className="flex gap-1">
              <Toggle
                on={line.bold ?? (line.kind === 'song' || d.bold)}
                onClick={() => onChange({bold: !(line.bold ?? (line.kind === 'song' || d.bold))})}
                title="Bold"
              >
                B
              </Toggle>
              <Toggle on={line.italic} onClick={() => onChange({italic: !line.italic})} title="Italic">
                <i>I</i>
              </Toggle>
            </div>
          </Labelled>
          <Labelled label="Layout">
            <div className="flex gap-1">
              <Select
                value={line.merged === null ? 'auto' : line.merged ? 'merged' : 'split'}
                onValueChange={(v) => onChange({merged: v === 'auto' ? null : v === 'merged'})}
              >
                <SelectTrigger size="sm" className="flex-1">
                  <SelectValue />
                </SelectTrigger>
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
                <SelectTrigger size="sm" className="flex-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">align: auto</SelectItem>
                  <SelectItem value="left">left</SelectItem>
                  <SelectItem value="center">centre</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </Labelled>
          <Labelled label="Sound Booth">
            <Select value={line.booth} onValueChange={(v) => onChange({booth: v as OrderLine['booth']})}>
              <SelectTrigger size="sm" className="w-full">
                <SelectValue />
              </SelectTrigger>
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
          {line.kind === 'song' ? (
            <label className="flex items-center gap-2 pt-1">
              <Checkbox checked={line.sticky} onCheckedChange={(v) => onChange({sticky: v === true})} />
              Keep this song when the week copies forward
            </label>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function MoveButtons({onMove}: {onMove: (delta: number) => void}) {
  return (
    <div className="flex shrink-0 flex-col">
      <Button size="icon" variant="ghost" className="h-4 w-5" onClick={() => onMove(-1)}>
        <ChevronUp className="h-3 w-3" />
      </Button>
      <Button size="icon" variant="ghost" className="h-4 w-5" onClick={() => onMove(1)}>
        <ChevronDown className="h-3 w-3" />
      </Button>
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
