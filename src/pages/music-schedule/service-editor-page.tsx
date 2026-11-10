import {CopyOrderDialog} from '@/components/music-schedule/editor/copy-order-dialog'
import {type Draft, newKey, toInput} from '@/components/music-schedule/editor/draft'
import {OrderList} from '@/components/music-schedule/editor/order-list'
import {PreviewPanel} from '@/components/music-schedule/editor/preview-panel'
import {
  DetailsStrip,
  type ServiceFieldsDraft,
  ServiceSettings,
  fieldsOf,
} from '@/components/music-schedule/editor/service-fields'
import {SaveStatus} from '@/components/music-schedule/save-status'
import {Button} from '@/components/ui/button'
import {Input} from '@/components/ui/input'
import {Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle} from '@/components/ui/sheet'
import {PageSpinner} from '@/components/ui/spinner'
import {UnsavedChangesDialog} from '@/components/unsaved-changes-dialog'
import {combineStatus, useAutosave} from '@/hooks/use-autosave'
import {useUnsavedChanges} from '@/hooks/use-unsaved-changes'
import {fetchServiceTimes} from '@/lib/attendance-api'
import {
  type MusicService,
  type MusicWeek,
  fetchMusicWeek,
  musicScheduleKeys,
  rewriteBoothLine,
  saveBoothLines,
  saveMusicLines,
  saveServiceAsDefault,
  updateMusicService,
} from '@/lib/music-schedule-api'
import {type MusicBoothSlot, formatServiceTime} from '@/lib/music-schedule-core'
import {cn} from '@/lib/utils'
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'
import {ArrowLeft, Eye, Highlighter, Info, RefreshCw} from 'lucide-react'
import {useEffect, useRef, useState} from 'react'
import {useNavigate, useParams} from 'react-router-dom'
import {toast} from 'sonner'

const SLOT_LABELS: Record<MusicBoothSlot, string> = {
  motto_verse_theme: 'Motto / Verse / Theme',
  prayer_announcements: 'Prayer, Announcements, Pastor’s Selection',
}

type BoothDraft = {slot: MusicBoothSlot; text: string; highlight: boolean; stale: boolean}

const draftsOf = (s: MusicService): Draft[] => s.lines.map((l) => ({...l, key: newKey()}))
const boothOf = (s: MusicService): BoothDraft[] =>
  s.boothLines.map((b) => ({slot: b.slot, text: b.text, highlight: b.highlight, stale: b.stale}))

export function MusicServiceEditorPage() {
  const {id, serviceId} = useParams<{id: string; serviceId: string}>()
  const weekId = Number(id)
  const svcId = Number(serviceId)

  const {data: week} = useQuery({
    queryKey: musicScheduleKeys.detail(weekId),
    queryFn: () => fetchMusicWeek(weekId),
    enabled: Number.isFinite(weekId),
  })
  const service = week?.services.find((s) => s.id === svcId)
  if (!week || !service) return <PageSpinner />
  // Keyed on the service: its autosaves must never carry edits across to another one.
  return <ServiceEditor key={svcId} week={week} initial={service} />
}

function ServiceEditor({week, initial}: {week: MusicWeek; initial: MusicService}) {
  const weekId = week.id
  const svcId = initial.id
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const {data: serviceTimes} = useQuery({queryKey: ['service-times'], queryFn: () => fetchServiceTimes()})

  // The live service from the query, for what this page doesn't edit (date, defaults).
  const service = week.services.find((s) => s.id === svcId) ?? initial

  // Local copies are the truth while editing; a refetch never overwrites them.
  const [lines, setLines] = useState<Draft[]>(() => draftsOf(initial))
  const [booth, setBooth] = useState<BoothDraft[]>(() => boothOf(initial))
  const [fields, setFields] = useState<ServiceFieldsDraft>(() => fieldsOf(initial))
  const linesRef = useRef(lines)
  const boothRef = useRef(booth)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [copyOpen, setCopyOpen] = useState(false)

  const refreshWeek = () => queryClient.invalidateQueries({queryKey: musicScheduleKeys.detail(weekId)})

  const linesSave = useAutosave<Draft[]>({
    save: (ls) => saveMusicLines(weekId, svcId, ls.map(toInput)).then(refreshWeek),
  })
  const boothSave = useAutosave<BoothDraft[]>({
    save: (bs) =>
      saveBoothLines(
        weekId,
        svcId,
        bs.map(({slot, text, highlight}) => ({slot, text, highlight})),
      ).then((r) => {
        // Adopt only what the server decides — whether a line is stale — never the text.
        setBooth((prev) =>
          prev.map((b) => ({...b, stale: r.boothLines.find((x) => x.slot === b.slot)?.stale ?? false})),
        )
        return refreshWeek()
      }),
  })
  const fieldsSave = useAutosave<Record<string, unknown>>({
    save: (patch) => updateMusicService(weekId, svcId, patch as Partial<MusicService>).then(refreshWeek),
    merge: (a, b) => ({...a, ...b}),
  })

  const saves = [linesSave, boothSave, fieldsSave]
  const status = combineStatus(saves.map((s) => s.status))
  const dirty = saves.some((s) => s.dirty) || status === 'error'
  const flushAll = async () => {
    await Promise.all(saves.map((s) => s.flush()))
  }
  const retryAll = () => saves.forEach((s) => s.retry())

  // Leaving saves at once; the "unsaved changes" dialog only appears if that failed.
  const blocker = useUnsavedChanges(dirty)
  const [leaveFailed, setLeaveFailed] = useState(false)
  useEffect(() => {
    if (blocker.state !== 'blocked') return
    let cancelled = false
    void flushAll().then(() => {
      if (cancelled) return
      if (saves.some((s) => s.isDirty())) setLeaveFailed(true)
      else blocker.proceed()
    })
    return () => {
      cancelled = true
    }
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [blocker.state])
  useEffect(() => {
    if (blocker.state !== 'blocked') setLeaveFailed(false)
  }, [blocker.state])

  // Deep link from the week view: /…/service/:serviceId#line-<id>
  useEffect(() => {
    const hash = window.location.hash
    if (!hash.startsWith('#line-')) return
    const line = linesRef.current.find((l) => l.id === Number(hash.slice('#line-'.length)))
    if (!line) return
    setSelectedKey(line.key)
    requestAnimationFrame(() =>
      document.querySelector(`[data-line-key="${line.key}"]`)?.scrollIntoView({block: 'center'}),
    )
  }, [])

  /* ------------------------------------------------------------- writes */

  const writeLines = (next: Draft[], immediate: boolean) => {
    linesRef.current = next
    setLines(next)
    linesSave.schedule(next, {immediate})
  }

  const changeLine = (key: string, patch: Partial<Draft>, opts?: {immediate?: boolean}) =>
    writeLines(
      linesRef.current.map((l) => (l.key === key ? {...l, ...patch} : l)),
      !!opts?.immediate,
    )

  const deleteLine = (key: string) => {
    const at = linesRef.current.findIndex((l) => l.key === key)
    const removed = linesRef.current[at]
    if (!removed) return
    writeLines(
      linesRef.current.filter((l) => l.key !== key),
      true,
    )
    if (selectedKey === key) setSelectedKey(null)
    toast('Line deleted', {
      duration: 6000,
      action: {
        label: 'Undo',
        onClick: () => {
          const cur = linesRef.current
          writeLines([...cur.slice(0, at), removed, ...cur.slice(at)], true)
        },
      },
    })
  }

  const writeBooth = (next: BoothDraft[], immediate: boolean) => {
    boothRef.current = next
    setBooth(next)
    boothSave.schedule(next, {immediate})
  }

  const changeFields = (patch: Partial<ServiceFieldsDraft>, opts?: {immediate?: boolean}) => {
    setFields((f) => ({...f, ...patch}))
    fieldsSave.schedule(patch, {immediate: !!opts?.immediate})
  }

  /** Take the server's copy again — after something on the server rewrote this service. */
  const reseed = async (what: {lines?: boolean; booth?: boolean; fields?: boolean}) => {
    const fresh = await queryClient.fetchQuery({
      queryKey: musicScheduleKeys.detail(weekId),
      queryFn: () => fetchMusicWeek(weekId),
    })
    const s = fresh.services.find((x) => x.id === svcId)
    if (!s) return
    if (what.lines) {
      linesRef.current = draftsOf(s)
      setLines(linesRef.current)
      setSelectedKey(null)
    }
    if (what.booth) {
      boothRef.current = boothOf(s)
      setBooth(boothRef.current)
    }
    if (what.fields) setFields(fieldsOf(s))
  }

  const rewrite = useMutation({
    mutationFn: async (slot: MusicBoothSlot) => {
      await linesSave.flush()
      await boothSave.flush()
      return rewriteBoothLine(weekId, svcId, slot)
    },
    onSuccess: () => reseed({booth: true}),
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed to rewrite'),
  })

  const saveDefault = useMutation({
    mutationFn: async () => {
      await linesSave.flush()
      return saveServiceAsDefault(weekId, svcId)
    },
    onSuccess: (r) => toast.success(`Saved ${r.lines} lines as the default for this service`),
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed to save default'),
  })

  const switchServiceTime = (serviceTimeId: number | null) => {
    // The Service Time carries the name, time and headings — clear this week's overrides.
    setFields((f) => ({...f, name: '', time: null}))
    fieldsSave.schedule({serviceTimeId, name: '', time: null}, {immediate: true})
  }

  /* ------------------------------------------------------------- render */

  // What the sheets would print right now, unsaved edits included.
  const preview: MusicService = {
    ...service,
    ...fields,
    name: fields.name || service.nameDefault,
    time: fields.time ?? service.timeDefault,
    musicHeading: fields.musicHeading || service.musicHeadingDefault || service.name,
    boothHeading: fields.boothHeading || service.boothHeadingDefault || service.name,
    lines,
    boothLines: service.boothLines.map((bl) => {
      const local = booth.find((b) => b.slot === bl.slot)
      return local ? {...bl, text: local.text, highlight: local.highlight} : bl
    }),
  }

  const previewPanel = (
    <PreviewPanel
      service={preview}
      lines={lines}
      photos={week.scanPhotos ?? []}
      onSelectLine={(key) => {
        setSelectedKey(key)
        setPreviewOpen(false)
        requestAnimationFrame(() =>
          document.querySelector(`[data-line-key="${key}"]`)?.scrollIntoView({block: 'center', behavior: 'smooth'}),
        )
      }}
    />
  )

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Back to the week"
          className="pointer-coarse:h-10 pointer-coarse:w-10"
          onClick={() => navigate(`/schedules/music/${weekId}`)}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h2 className="text-2xl font-bold">{preview.name}</h2>
        <span className="text-muted-foreground text-sm">
          {service.date} · {formatServiceTime(preview.time)}
          {fields.episodeNumber != null ? ` · #${fields.episodeNumber}` : ''}
        </span>
        {fields.standalone ? (
          <span className="rounded bg-violet-100 px-2 py-0.5 text-xs text-violet-800 dark:bg-violet-950 dark:text-violet-200">
            Standalone
          </span>
        ) : null}
        {fields.occasion ? <span className="text-sm italic">{fields.occasion}</span> : null}
        <div className="ml-auto flex items-center gap-2">
          <SaveStatus status={status} onRetry={retryAll} />
          <Button
            size="sm"
            variant="outline"
            className="lg:hidden pointer-coarse:h-10"
            onClick={() => setPreviewOpen(true)}
          >
            <Eye className="mr-1 h-4 w-4" />
            Preview
          </Button>
          <ServiceSettings
            service={service}
            fields={fields}
            serviceTimes={serviceTimes ?? []}
            onChange={changeFields}
            onServiceTime={switchServiceTime}
            onCopyOrder={() => setCopyOpen(true)}
            onSaveDefault={() => saveDefault.mutate()}
            savingDefault={saveDefault.isPending}
          />
        </div>
      </div>

      {fields.standalone && week.laterWeekExists ? (
        <p className="flex items-start gap-2 rounded border border-sky-300 bg-sky-50 p-3 text-sm text-sky-900 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-100">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          The next week was already created from this order, and marking this service Standalone doesn&rsquo;t change
          it. If that week should have the usual order back, open its service and use Copy order from….
        </p>
      ) : null}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-4">
          <DetailsStrip fields={fields} onChange={changeFields} />

          <section className="space-y-2">
            <div className="flex items-center gap-2">
              <h3 className="font-medium">Service Order</h3>
              <span
                className="text-muted-foreground cursor-help text-xs underline decoration-dotted"
                title="Bold, italic and underline are inline markup — *bold*, __italic__, _underline_ — so they mark the words that need them."
              >
                markup?
              </span>
            </div>
            <OrderList
              lines={lines}
              selectedKey={selectedKey}
              onSelect={setSelectedKey}
              onLines={(next) => writeLines(next, true)}
              onChangeLine={changeLine}
              onDeleteLine={deleteLine}
            />
          </section>

          <section className="space-y-2">
            <h3 className="font-medium">Sound Booth lines</h3>
            {booth.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                None — they appear once this service has a Motto/Verse/Theme or a Pastor&rsquo;s Selection line.
              </p>
            ) : null}
            {booth.map((b, i) => (
              <div key={b.slot} className="space-y-1">
                <span className="text-muted-foreground text-xs">{SLOT_LABELS[b.slot]}</span>
                <div className="flex items-center gap-1">
                  <Input
                    value={b.text}
                    onChange={(e) =>
                      writeBooth(
                        boothRef.current.map((x, idx) => (idx === i ? {...x, text: e.target.value} : x)),
                        false,
                      )
                    }
                  />
                  <Button
                    type="button"
                    size="icon"
                    variant={b.highlight ? 'default' : 'outline'}
                    aria-label="Highlight this line on the Sound Booth sheet"
                    title="Highlight this line on the Sound Booth sheet"
                    className="h-9 w-9 shrink-0 pointer-coarse:h-10 pointer-coarse:w-10"
                    onClick={() =>
                      writeBooth(
                        boothRef.current.map((x, idx) => (idx === i ? {...x, highlight: !x.highlight} : x)),
                        true,
                      )
                    }
                  >
                    <Highlighter className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0 pointer-coarse:h-10"
                    title="Replace this wording with a fresh draft from the Service Order"
                    disabled={rewrite.isPending}
                    onClick={() => rewrite.mutate(b.slot)}
                  >
                    <RefreshCw className="mr-1 h-3 w-3" /> Rewrite
                  </Button>
                </div>
                {b.stale ? (
                  <p className="text-xs text-amber-700">
                    Drafted from roles that have since changed — Rewrite for a fresh draft, or keep your wording.
                  </p>
                ) : null}
              </div>
            ))}
          </section>
        </div>

        <aside className="sticky top-4 hidden max-h-[calc(100vh-2rem)] overflow-y-auto lg:block">{previewPanel}</aside>
      </div>

      {/* Below lg (iPad portrait): the same panel slides in from the right and
          stays non-modal, so the order behind it still scrolls. */}
      <Sheet open={previewOpen} onOpenChange={setPreviewOpen} modal={false}>
        <SheetContent side="right" className={cn('w-[90vw] overflow-y-auto p-3 sm:max-w-[90vw] lg:hidden')}>
          <SheetHeader className="p-0 pr-10">
            <SheetTitle>Preview</SheetTitle>
            <SheetDescription className="sr-only">How this service prints, unsaved edits included</SheetDescription>
          </SheetHeader>
          {previewPanel}
        </SheetContent>
      </Sheet>

      <CopyOrderDialog
        open={copyOpen}
        onOpenChange={setCopyOpen}
        weekId={weekId}
        serviceId={svcId}
        currentLines={lines}
        beforeCopy={async () => {
          await linesSave.flush()
          await boothSave.flush()
          await fieldsSave.flush()
        }}
        onCopied={() => reseed({lines: true, booth: true, fields: true})}
      />

      {leaveFailed ? (
        <UnsavedChangesDialog
          blocker={blocker}
          onSave={async () => {
            await flushAll()
            // Still unsaved: throw so the dialog keeps the page instead of leaving.
            if (saves.some((s) => s.isDirty())) throw new Error('Not saved')
          }}
          what="your edits to this service"
        />
      ) : null}
    </div>
  )
}
