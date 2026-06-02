import {Button} from '@/components/ui/button'
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card'
import {PageSpinner} from '@/components/ui/spinner'
import {fetchFairBoothSchedule, fetchSchedulesSettings, schedulesKeys} from '@/lib/schedules-api'
import {useQuery} from '@tanstack/react-query'
import {ArrowLeft, FileDown, FileImage} from 'lucide-react'
import {useRef, useState} from 'react'
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
  const [rosterPersonId, setRosterPersonId] = useState<number | null>(null)
  const [blank, setBlank] = useState(false)
  const [exporting, setExporting] = useState(false)
  const printGridRef = useRef<HTMLDivElement | null>(null)
  const printRosterRef = useRef<HTMLDivElement | null>(null)

  const {data: detail, isLoading} = useQuery({
    queryKey: schedulesKeys.fairBooth(scheduleId),
    queryFn: () => fetchFairBoothSchedule(scheduleId),
  })
  const {data: settings} = useQuery({queryKey: schedulesKeys.settings, queryFn: fetchSchedulesSettings})

  if (isLoading || !detail || !settings) return <PageSpinner />
  const {schedule, people, rosterPersonIds, rosterAttrs, signups} = detail
  if (!schedule.scopeStart) return <div className="p-4">Schedule missing scope start.</div>
  const rosterSize = rosterPersonIds.length
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
        <h2 className="text-2xl font-bold">
          {settings.fairBooth.titlePrefix} {schedule.scopeLabel} ({rosterSize})
        </h2>
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
            <FairBoothGrid
              scopeStart={schedule.scopeStart}
              signups={signups}
              people={people}
              rosterAttrs={rosterAttrs}
              blank={blank}
              scheduleId={scheduleId}
            />
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
        <div ref={printGridRef} style={{background: '#fff', padding: 16}}>
          {settings.logoPath && (
            <img src={settings.logoPath} alt="" style={{height: 64, margin: '0 auto 8px', display: 'block'}} />
          )}
          <h3 style={{textAlign: 'center', fontSize: 18, fontWeight: 'bold', marginBottom: 8}}>
            {settings.fairBooth.titlePrefix} {schedule.scopeLabel} ({rosterSize})
          </h3>
          <FairBoothGrid
            scopeStart={schedule.scopeStart}
            signups={signups}
            people={people}
            rosterAttrs={rosterAttrs}
            blank={blank}
          />
          <FooterBlocks blocks={settings.fairBooth.gridPageFooterBlocks} />
        </div>
        <div ref={printRosterRef} style={{background: '#fff', padding: 16}}>
          {settings.logoPath && (
            <img src={settings.logoPath} alt="" style={{height: 64, margin: '0 auto 8px', display: 'block'}} />
          )}
          <h3 style={{textAlign: 'center', fontSize: 18, fontWeight: 'bold', marginBottom: 8}}>
            {settings.fairBooth.titlePrefix} — Roster
          </h3>
          <FairBoothRoster
            people={people}
            rosterPersonIds={rosterPersonIds}
            rosterAttrs={rosterAttrs}
            signups={signups}
            minSignupsForBold={settings.fairBooth.minSignupsForBold}
            onClickPerson={() => {}}
          />
          <FooterBlocks blocks={settings.fairBooth.rosterPageFooterBlocks} />
        </div>
      </div>
    </div>
  )
}

function FooterBlocks({blocks}: {blocks: {kind: 'quote' | 'note' | 'spacer'; text: string; bold?: boolean}[]}) {
  if (!blocks || blocks.length === 0) return null
  return (
    <div className="mt-4 text-center text-sm space-y-1">
      {blocks.map((b, i) => {
        if (b.kind === 'spacer') return <div key={i} className="h-2" />
        if (b.kind === 'quote')
          return (
            <p key={i} className={`italic ${b.bold ? 'font-bold' : ''}`}>
              &ldquo;{b.text}&rdquo;
            </p>
          )
        return (
          <p key={i} className={b.bold ? 'font-bold' : ''}>
            {b.text}
          </p>
        )
      })}
    </div>
  )
}
