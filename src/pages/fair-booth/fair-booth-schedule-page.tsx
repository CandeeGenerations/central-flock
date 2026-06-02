import {Button} from '@/components/ui/button'
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card'
import {Input} from '@/components/ui/input'
import {PageSpinner} from '@/components/ui/spinner'
import {deriveFairDays} from '@/lib/fair-booth-render'
import {
  fetchFairBoothSchedule,
  fetchSchedulesSettings,
  schedulesKeys,
  updateFairBoothSchedule,
} from '@/lib/schedules-api'
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'
import {ArrowLeft, ChevronLeft, ChevronRight, FileDown, FileImage, Pencil} from 'lucide-react'
import {useEffect, useRef, useState} from 'react'
import {Link, useNavigate, useParams} from 'react-router-dom'
import {toast} from 'sonner'

import {exportFairBoothJpg, exportFairBoothPdf} from './fair-booth-exports'
import {FairBoothGrid} from './fair-booth-grid'
import {FairBoothRoster} from './fair-booth-roster'
import {FairBoothRosterModal} from './fair-booth-roster-modal'

export function FairBoothSchedulePage() {
  const {id} = useParams<{id: string}>()
  const navigate = useNavigate()
  const scheduleId = Number(id)
  const queryClient = useQueryClient()
  const [rosterPersonId, setRosterPersonId] = useState<number | null>(null)
  const [blank, setBlank] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [mobileDayIdx, setMobileDayIdx] = useState(0)
  const [editingLabel, setEditingLabel] = useState(false)
  const [labelDraft, setLabelDraft] = useState('')

  const renameMutation = useMutation({
    mutationFn: (scopeLabel: string) => updateFairBoothSchedule(scheduleId, {scopeLabel}),
    onSuccess: () => {
      queryClient.invalidateQueries({queryKey: schedulesKeys.fairBooth(scheduleId)})
      queryClient.invalidateQueries({queryKey: schedulesKeys.fairBoothList})
      setEditingLabel(false)
      toast.success('Renamed')
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
  })
  const printGridRef = useRef<HTMLDivElement | null>(null)
  const printRosterRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)')
    const apply = () => setIsMobile(mq.matches)
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])

  const {data: detail, isLoading} = useQuery({
    queryKey: schedulesKeys.fairBooth(scheduleId),
    queryFn: () => fetchFairBoothSchedule(scheduleId),
  })
  const {data: settings} = useQuery({queryKey: schedulesKeys.settings, queryFn: fetchSchedulesSettings})

  if (isLoading || !detail || !settings) return <PageSpinner />
  const {schedule, people, rosterPersonIds, rosterAttrs, signups} = detail
  if (!schedule.scopeStart) return <div className="p-4">Schedule missing scope start.</div>
  const signedUpIds = new Set(signups.map((s) => s.personId))
  const rosterSize = rosterPersonIds.filter((pid) => signedUpIds.has(pid)).length
  const filenameBase = `fair-booth-${schedule.scopeLabel.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`

  async function withExport(fn: () => Promise<void>) {
    setExporting(true)
    try {
      await new Promise((r) => setTimeout(r, 80))
      await fn()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Export failed')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <Button variant="ghost" size="icon" onClick={() => navigate('/schedules/fair-booth')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        {editingLabel ? (
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold">{settings.fairBooth.titlePrefix}</span>
            <Input
              autoFocus
              value={labelDraft}
              onChange={(e) => setLabelDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && labelDraft.trim()) renameMutation.mutate(labelDraft.trim())
                if (e.key === 'Escape') setEditingLabel(false)
              }}
              className="h-9 w-72"
            />
            <Button size="sm" onClick={() => labelDraft.trim() && renameMutation.mutate(labelDraft.trim())} disabled={renameMutation.isPending}>
              Save
            </Button>
            <Button size="sm" variant="outline" onClick={() => setEditingLabel(false)}>
              Cancel
            </Button>
            <span className="text-2xl font-bold">({rosterSize})</span>
          </div>
        ) : (
          <h2 className="text-2xl font-bold flex items-center gap-2">
            {settings.fairBooth.titlePrefix} {schedule.scopeLabel} ({rosterSize})
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => {
                setLabelDraft(schedule.scopeLabel)
                setEditingLabel(true)
              }}
            >
              <Pencil className="h-4 w-4" />
            </Button>
          </h2>
        )}
        <div className="ml-auto flex gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            disabled={exporting}
            onClick={() =>
              withExport(async () => {
                if (!printGridRef.current || !printRosterRef.current) return
                await exportFairBoothPdf(printGridRef.current, printRosterRef.current, filenameBase)
              })
            }
          >
            <FileDown className="h-4 w-4 mr-1" /> Export PDF
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={exporting}
            onClick={() =>
              withExport(async () => {
                if (!printGridRef.current) return
                await exportFairBoothJpg(printGridRef.current, filenameBase)
              })
            }
          >
            <FileImage className="h-4 w-4 mr-1" /> Export JPG
          </Button>
          <Button
            variant={blank ? 'default' : 'outline'}
            size="sm"
            disabled={exporting}
            onClick={async () => {
              setBlank(true)
              await new Promise((r) => setTimeout(r, 120))
              await withExport(async () => {
                if (!printGridRef.current || !printRosterRef.current) return
                await exportFairBoothPdf(printGridRef.current, printRosterRef.current, `${filenameBase}-blank`)
              })
              setBlank(false)
            }}
          >
            Export Blank PDF
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Schedule</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            {isMobile ? (
              <MobileGridNav
                scheduleId={scheduleId}
                scopeStart={schedule.scopeStart}
                signups={signups}
                people={people}
                rosterAttrs={rosterAttrs}
                blank={blank}
                dayIdx={mobileDayIdx}
                setDayIdx={setMobileDayIdx}
              />
            ) : (
              <FairBoothGrid
                scopeStart={schedule.scopeStart}
                signups={signups}
                people={people}
                rosterAttrs={rosterAttrs}
                blank={blank}
                scheduleId={scheduleId}
              />
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Roster</CardTitle>
        </CardHeader>
        <CardContent>
          <FairBoothRoster
            people={people}
            rosterPersonIds={rosterPersonIds}
            rosterAttrs={rosterAttrs}
            signups={signups}
            minSignupsForBold={settings.fairBooth.minSignupsForBold}
            onClickPerson={(pid) => setRosterPersonId(pid)}
            blankRowsPerColumn={0}
            singleColumn={isMobile}
            clickable={!isMobile}
          />
        </CardContent>
      </Card>

      <p className="text-muted-foreground text-xs">
        Tip: click any day column in the grid to edit that day. Click a name on the roster to edit fair role and
        initials. To change who's on the roster, edit the configured Groups in{' '}
        <Link to="/schedules/settings" className="underline">
          Settings
        </Link>
        .
      </p>

      {rosterPersonId !== null && (
        <FairBoothRosterModal
          scheduleId={scheduleId}
          personId={rosterPersonId}
          person={people.find((p) => p.id === rosterPersonId)!}
          attrs={rosterAttrs.find((a) => a.personId === rosterPersonId) ?? null}
          signupCount={signups.filter((s) => s.personId === rosterPersonId).length}
          onClose={() => setRosterPersonId(null)}
        />
      )}

      {/* Hidden print-only renderings — capture targets for PDF/JPG/blank. */}
      <div style={{position: 'fixed', left: '-99999px', top: 0, width: '1100px', background: '#fff'}}>
        <div
          ref={printGridRef}
          style={{
            background: '#fff',
            padding: 24,
            fontFamily: 'Arial, sans-serif',
            color: '#000',
          }}
        >
          <div style={{textAlign: 'center', marginBottom: 24}}>
            {settings.logoPath && (
              <img
                src={settings.logoPath}
                alt=""
                style={{maxHeight: 80, margin: '0 auto 8px', display: 'block', objectFit: 'contain'}}
                crossOrigin="anonymous"
              />
            )}
            <h2 style={{fontSize: 20, fontWeight: 700, color: '#000', margin: 0}}>
              {settings.fairBooth.titlePrefix} {schedule.scopeLabel} ({rosterSize})
            </h2>
          </div>
          <FairBoothGrid
            scopeStart={schedule.scopeStart}
            signups={signups}
            people={people}
            rosterAttrs={rosterAttrs}
            blank={blank}
          />
          <PrintLegend />
          <FooterBlocks blocks={settings.fairBooth.gridPageFooterBlocks} />
        </div>
        <div
          ref={printRosterRef}
          style={{
            background: '#fff',
            padding: 24,
            fontFamily: 'Arial, sans-serif',
            color: '#000',
          }}
        >
          <div style={{textAlign: 'center', marginBottom: 24}}>
            {settings.logoPath && (
              <img
                src={settings.logoPath}
                alt=""
                style={{maxHeight: 80, margin: '0 auto 8px', display: 'block', objectFit: 'contain'}}
                crossOrigin="anonymous"
              />
            )}
            <h2 style={{fontSize: 20, fontWeight: 700, color: '#000', margin: 0}}>
              {settings.fairBooth.titlePrefix} {schedule.scopeLabel} — Roster ({rosterSize})
            </h2>
          </div>
          <FairBoothRoster
            people={people}
            rosterPersonIds={rosterPersonIds}
            rosterAttrs={rosterAttrs}
            signups={signups}
            minSignupsForBold={settings.fairBooth.minSignupsForBold}
            onClickPerson={() => {}}
            forceLight
            blankRowsPerColumn={blank ? 5 : 4}
          />
          <FooterBlocks blocks={settings.fairBooth.rosterPageFooterBlocks} />
        </div>
      </div>
    </div>
  )
}

interface MobileGridNavProps {
  scheduleId: number
  scopeStart: string
  signups: Parameters<typeof FairBoothGrid>[0]['signups']
  people: Parameters<typeof FairBoothGrid>[0]['people']
  rosterAttrs: Parameters<typeof FairBoothGrid>[0]['rosterAttrs']
  blank: boolean
  dayIdx: number
  setDayIdx: (n: number) => void
}

function MobileGridNav({
  scheduleId,
  scopeStart,
  signups,
  people,
  rosterAttrs,
  blank,
  dayIdx,
  setDayIdx,
}: MobileGridNavProps) {
  let days: ReturnType<typeof deriveFairDays>
  try {
    days = deriveFairDays(scopeStart)
  } catch {
    return <div className="text-destructive p-2 text-sm">Invalid scope start.</div>
  }
  const safeIdx = Math.min(Math.max(0, dayIdx), days.length - 1)
  const day = days[safeIdx]
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Button variant="outline" size="icon" disabled={safeIdx === 0} onClick={() => setDayIdx(safeIdx - 1)}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm font-medium">
          Day {safeIdx + 1} of {days.length}
        </span>
        <Button
          variant="outline"
          size="icon"
          disabled={safeIdx === days.length - 1}
          onClick={() => setDayIdx(safeIdx + 1)}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
      <FairBoothGrid
        scopeStart={scopeStart}
        signups={signups}
        people={people}
        rosterAttrs={rosterAttrs}
        blank={blank}
        scheduleId={scheduleId}
        onlyDate={day.date}
      />
    </div>
  )
}

function PrintLegend() {
  const headcount = [
    {bg: '#fecaca', label: '≤ 3 people'},
    {bg: '#fed7aa', label: '4 people'},
    {bg: '#fef08a', label: '5 people'},
    {bg: '#a5f3fc', label: '6 people'},
    {bg: '#bfdbfe', label: '7 people'},
    {bg: '#bbf7d0', label: '8 people'},
    {bg: '#e9d5ff', label: 'More than 8 people'},
  ]
  const coverage = [
    {bg: '#86efac', label: 'Hispanic — full day coverage'},
    {bg: '#fdba74', label: 'Hispanic — partial coverage'},
    {bg: '#fca5a5', label: 'No Hispanic coverage'},
  ]
  const swatch = (bg: string) => ({
    display: 'inline-block' as const,
    width: 26,
    height: 16,
    background: bg,
    border: '1px solid #555',
    borderRadius: 4,
    verticalAlign: 'middle' as const,
    marginRight: 10,
  })
  const sectionHeader: React.CSSProperties = {
    fontSize: 13,
    fontWeight: 700,
    textTransform: 'uppercase',
    marginBottom: 8,
    letterSpacing: 1,
  }
  const item: React.CSSProperties = {padding: '3px 0'}
  return (
    <div style={{marginTop: 24, fontSize: 13, color: '#111'}}>
      <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 24}}>
        <div>
          <div style={sectionHeader}>Headcount</div>
          {headcount.map((h) => (
            <div key={h.label} style={item}>
              <span style={swatch(h.bg)} />
              {h.label}
            </div>
          ))}
        </div>
        <div>
          <div style={sectionHeader}>Day header</div>
          {coverage.map((c) => (
            <div key={c.label} style={item}>
              <span style={swatch(c.bg)} />
              {c.label}
            </div>
          ))}
        </div>
        <div>
          <div style={sectionHeader}>Markers</div>
          <div style={{...item, fontFamily: 'monospace'}}>—&nbsp;&nbsp;Unit Leader</div>
          <div style={{...item, fontFamily: 'monospace'}}>——&nbsp;&nbsp;Asst Unit Leader</div>
          <div style={{...item, fontFamily: 'monospace'}}>———&nbsp;&nbsp;Worker</div>
          <div style={{...item, fontFamily: 'monospace'}}>★&nbsp;&nbsp;Worker (whole-fair role)</div>
          <div style={{...item, fontFamily: 'monospace'}}>★★&nbsp;&nbsp;Asst Unit Leader</div>
          <div style={{...item, fontFamily: 'monospace'}}>★★★&nbsp;&nbsp;Unit Leader</div>
          <div style={{...item, fontFamily: 'monospace'}}>★★★★&nbsp;&nbsp;Asst Fair Manager</div>
          <div style={{...item, fontFamily: 'monospace'}}>★★★★★&nbsp;&nbsp;Fair Manager</div>
        </div>
      </div>
    </div>
  )
}

function FooterBlocks({blocks}: {blocks: {kind: 'quote' | 'note' | 'spacer'; text: string; bold?: boolean}[]}) {
  if (!blocks || blocks.length === 0) return null
  return (
    <div style={{marginTop: 48, textAlign: 'center', color: '#000'}}>
      {blocks.map((b, i) => {
        if (b.kind === 'spacer') return <div key={i} style={{height: 8}} />
        if (b.kind === 'quote')
          return (
            <div
              key={i}
              style={{
                fontFamily: '"DM Serif Display", serif',
                fontStyle: 'italic',
                fontSize: 16,
                lineHeight: 1.35,
                marginBottom: 8,
                fontWeight: b.bold ? 700 : 400,
                whiteSpace: 'pre-wrap',
              }}
            >
              {b.text}
            </div>
          )
        return (
          <div key={i} style={{fontSize: 14, lineHeight: 1.4, marginBottom: 8, fontWeight: b.bold ? 700 : 400}}>
            {b.text}
          </div>
        )
      })}
    </div>
  )
}
