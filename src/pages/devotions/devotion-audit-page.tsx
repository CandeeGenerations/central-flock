import {Badge} from '@/components/ui/badge'
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card'
import {PageSpinner} from '@/components/ui/spinner'
import {useQuery} from '@tanstack/react-query'
import {AlertTriangle, CheckCircle2, ChevronDown, ChevronUp} from 'lucide-react'
import {useState} from 'react'
import {Link} from 'react-router-dom'

function fmtDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', {month: 'short', day: 'numeric', year: 'numeric'})
}

interface AuditResult {
  missingNumbers: number[]
  missingDates: {after: string; before: string; days: number}[]
  duplicateDates: {date: string; devotions: {id: number; number: number}[]}[]
  noReference: {id: number; number: number; date: string; devotionType: string; guestSpeaker: string | null}[]
  guestsNoNumber: {id: number; number: number; date: string; guestSpeaker: string | null}[]
  guestsNoSpeaker: {id: number; number: number; date: string}[]
  speakerGaps: {speaker: string; missing: number[]; duplicates: number[]; range: string}[]
  totalDevotions: number
  numberRange: {min: number; max: number}
  issueCount: number
}

function fetchAudit() {
  return fetch('/api/devotions/audit', {credentials: 'include'}).then((r) => r.json()) as Promise<AuditResult>
}

export function DevotionAuditPage() {
  const {data: audit, isLoading} = useQuery({
    queryKey: ['devotion-audit'],
    queryFn: fetchAudit,
  })

  if (isLoading || !audit) return <PageSpinner />

  const hasIssues = audit.issueCount > 0

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Data Audit</h2>
      </div>

      {/* Summary Card */}
      <Card className={hasIssues ? 'border-amber-500/50' : 'border-green-500/50'}>
        <CardContent className="flex items-center gap-3 py-4">
          {hasIssues ? (
            <AlertTriangle className="h-6 w-6 text-amber-500 shrink-0" />
          ) : (
            <CheckCircle2 className="h-6 w-6 text-green-500 shrink-0" />
          )}
          <div>
            <p className="text-lg font-semibold">
              {hasIssues
                ? `${audit.issueCount} issue${audit.issueCount === 1 ? '' : 's'} found across ${audit.totalDevotions.toLocaleString()} devotions`
                : `No issues found across ${audit.totalDevotions.toLocaleString()} devotions`}
            </p>
            <p className="text-sm text-muted-foreground">
              Numbers #{audit.numberRange.min}&ndash;#{audit.numberRange.max}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Missing Devotion Numbers */}
      <AuditSection title="Missing Devotion Numbers" count={audit.missingNumbers.length}>
        <div className="flex flex-wrap gap-1.5">
          {audit.missingNumbers.map((n) => (
            <Badge key={n} variant="outline">
              #{n}
            </Badge>
          ))}
        </div>
      </AuditSection>

      {/* Date Gaps */}
      <AuditSection title="Date Gaps" count={audit.missingDates.length}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 px-3 font-medium text-muted-foreground">After</th>
                <th className="text-left py-2 px-3 font-medium text-muted-foreground">Before</th>
                <th className="text-right py-2 px-3 font-medium text-muted-foreground">Days</th>
              </tr>
            </thead>
            <tbody>
              {audit.missingDates.map((gap, i) => (
                <tr key={i} className="border-b last:border-0">
                  <td className="py-2 px-3">{fmtDate(gap.after)}</td>
                  <td className="py-2 px-3">{fmtDate(gap.before)}</td>
                  <td className="py-2 px-3 text-right">{gap.days}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </AuditSection>

      {/* Duplicate Dates */}
      <AuditSection title="Duplicate Dates" count={audit.duplicateDates.length}>
        <div className="space-y-3">
          {audit.duplicateDates.map((dup) => (
            <div key={dup.date} className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium">{fmtDate(dup.date)}:</span>
              {dup.devotions.map((d) => (
                <Link key={d.id} to={`/devotions/${d.id}`} className="text-primary hover:underline text-sm">
                  <Badge variant="outline">#{String(d.number).padStart(3, '0')}</Badge>
                </Link>
              ))}
            </div>
          ))}
        </div>
      </AuditSection>

      {/* Missing Bible References */}
      <AuditSection title="Missing Bible References" count={audit.noReference.length}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 px-3 font-medium text-muted-foreground">#</th>
                <th className="text-left py-2 px-3 font-medium text-muted-foreground">Date</th>
                <th className="text-left py-2 px-3 font-medium text-muted-foreground">Type</th>
                <th className="text-left py-2 px-3 font-medium text-muted-foreground">Speaker</th>
              </tr>
            </thead>
            <tbody>
              {audit.noReference.map((d) => (
                <tr key={d.id} className="border-b last:border-0">
                  <td className="py-2 px-3">
                    <Link to={`/devotions/${d.id}`} className="text-primary hover:underline font-medium">
                      #{String(d.number).padStart(3, '0')}
                    </Link>
                  </td>
                  <td className="py-2 px-3 text-muted-foreground">{fmtDate(d.date)}</td>
                  <td className="py-2 px-3">{d.devotionType}</td>
                  <td className="py-2 px-3 text-muted-foreground">{d.guestSpeaker || '\u2014'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </AuditSection>

      {/* Guests Missing Number */}
      <AuditSection title="Guests Missing Number" count={audit.guestsNoNumber.length}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 px-3 font-medium text-muted-foreground">#</th>
                <th className="text-left py-2 px-3 font-medium text-muted-foreground">Date</th>
                <th className="text-left py-2 px-3 font-medium text-muted-foreground">Speaker</th>
              </tr>
            </thead>
            <tbody>
              {audit.guestsNoNumber.map((d) => (
                <tr key={d.id} className="border-b last:border-0">
                  <td className="py-2 px-3">
                    <Link to={`/devotions/${d.id}`} className="text-primary hover:underline font-medium">
                      #{String(d.number).padStart(3, '0')}
                    </Link>
                  </td>
                  <td className="py-2 px-3 text-muted-foreground">{fmtDate(d.date)}</td>
                  <td className="py-2 px-3">{d.guestSpeaker || '\u2014'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </AuditSection>

      {/* Guests Missing Speaker */}
      <AuditSection title="Guests Missing Speaker" count={audit.guestsNoSpeaker.length}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 px-3 font-medium text-muted-foreground">#</th>
                <th className="text-left py-2 px-3 font-medium text-muted-foreground">Date</th>
              </tr>
            </thead>
            <tbody>
              {audit.guestsNoSpeaker.map((d) => (
                <tr key={d.id} className="border-b last:border-0">
                  <td className="py-2 px-3">
                    <Link to={`/devotions/${d.id}`} className="text-primary hover:underline font-medium">
                      #{String(d.number).padStart(3, '0')}
                    </Link>
                  </td>
                  <td className="py-2 px-3 text-muted-foreground">{fmtDate(d.date)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </AuditSection>

      {/* Guest Number Sequence Gaps */}
      <AuditSection
        title="Guest Number Sequence Gaps"
        count={audit.speakerGaps.filter((s) => s.missing.length > 0 || s.duplicates.length > 0).length}
      >
        <div className="space-y-4">
          {audit.speakerGaps.map((sg) => (
            <div key={sg.speaker} className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold">{sg.speaker}</span>
                <span className="text-xs text-muted-foreground">({sg.range})</span>
              </div>
              {sg.missing.length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-xs text-muted-foreground">Missing:</span>
                  {sg.missing.map((n) => (
                    <Badge key={n} variant="outline" className="text-xs">
                      #{n}
                    </Badge>
                  ))}
                </div>
              )}
              {sg.duplicates.length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-xs text-muted-foreground">Duplicates:</span>
                  {sg.duplicates.map((n) => (
                    <Badge key={n} variant="destructive" className="text-xs">
                      #{n}
                    </Badge>
                  ))}
                </div>
              )}
              {sg.missing.length === 0 && sg.duplicates.length === 0 && (
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                  <span className="text-xs text-muted-foreground">Sequence complete</span>
                </div>
              )}
            </div>
          ))}
        </div>
      </AuditSection>
    </div>
  )
}

function AuditSection({title, count, children}: {title: string; count: number; children: React.ReactNode}) {
  const hasIssues = count > 0
  const [open, setOpen] = useState(hasIssues)

  return (
    <Card className={!hasIssues ? 'opacity-60' : ''}>
      <CardHeader
        className={`select-none flex flex-row items-center justify-between ${hasIssues ? 'cursor-pointer' : ''}`}
        onClick={() => hasIssues && setOpen((o) => !o)}
      >
        <CardTitle className="flex items-center gap-2">
          {hasIssues ? (
            <AlertTriangle className="h-4 w-4 text-amber-500" />
          ) : (
            <CheckCircle2 className="h-4 w-4 text-green-500" />
          )}
          {title}
          <Badge variant={hasIssues ? 'destructive' : 'secondary'} className="ml-1">
            {count}
          </Badge>
        </CardTitle>
        {hasIssues && (open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />)}
      </CardHeader>
      {open && hasIssues && <CardContent>{children}</CardContent>}
    </Card>
  )
}
