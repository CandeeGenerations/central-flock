import {Badge} from '@/components/ui/badge'
import {Button} from '@/components/ui/button'
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card'
import {PageSpinner} from '@/components/ui/spinner'
import {fixChainRoot} from '@/lib/devotion-api'
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'
import {AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, Wrench} from 'lucide-react'
import {useState} from 'react'
import {Link} from 'react-router-dom'
import {toast} from 'sonner'

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
  brokenChains: {
    id: number
    number: number
    date: string
    bibleReference: string | null
    referencedDevotions: number[]
    missing: {number: number; date: string; type: string}[]
  }[]
  mismatchedRevisits: {
    id: number
    number: number
    date: string
    bibleReference: string
    originalNumber: number
    originalDate: string
    originalBibleReference: string | null
  }[]
  chainLineageIssues: {
    id: number
    number: number
    date: string
    rootNumber: number | null
    issueType: 'root-not-found' | 'root-is-revisit' | 'inconsistent-root' | 'missing-siblings'
    detail: string
    related: {number: number; date: string}[]
  }[]
  totalDevotions: number
  numberRange: {min: number; max: number}
  issueCount: number
}

function fetchAudit() {
  return fetch('/api/devotions/audit', {credentials: 'include'}).then((r) => r.json()) as Promise<AuditResult>
}

export function DevotionAuditPage() {
  const qc = useQueryClient()
  const {data: audit, isLoading} = useQuery({
    queryKey: ['devotion-audit'],
    queryFn: fetchAudit,
    refetchOnMount: 'always',
  })

  const fixRootMutation = useMutation({
    mutationFn: (id: number) => fixChainRoot(id),
    onSuccess: (data, id) => {
      qc.invalidateQueries({queryKey: ['devotion-audit']})
      qc.invalidateQueries({queryKey: ['devotion', String(id)]})
      qc.invalidateQueries({queryKey: ['devotion-chain-audit', String(id)]})
      const tail = data.newChain[data.newChain.length - 1]
      toast.success(
        data.resolved
          ? `Chain extended to #${String(tail).padStart(3, '0')} (${data.newChain.length} entries)`
          : `Chain extended but still terminates at a revisit — investigate #${tail}`,
      )
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to fix chain'),
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
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {audit.missingNumbers.map((n) => (
              <Link
                key={n}
                to={`/devotions/missing?number=${n}`}
                className="rounded-md hover:bg-accent transition-colors"
              >
                <Badge variant="outline">#{n}</Badge>
              </Link>
            ))}
          </div>
          <Link to="/devotions/missing" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
            Add a missing devotion →
          </Link>
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

      {/* Broken Revisit Chains */}
      <AuditSection title="Broken Revisit Chains" count={audit.brokenChains.length}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 px-3 font-medium text-muted-foreground">Revisit</th>
                <th className="text-left py-2 px-3 font-medium text-muted-foreground">Date</th>
                <th className="text-left py-2 px-3 font-medium text-muted-foreground">Scripture</th>
                <th className="text-left py-2 px-3 font-medium text-muted-foreground">Current Chain</th>
                <th className="text-left py-2 px-3 font-medium text-muted-foreground">Missing</th>
              </tr>
            </thead>
            <tbody>
              {audit.brokenChains.map((bc) => (
                <tr key={bc.id} className="border-b last:border-0 align-top">
                  <td className="py-2 px-3">
                    <Link to={`/devotions/${bc.id}`} className="text-primary hover:underline font-medium">
                      #{String(bc.number).padStart(3, '0')}
                    </Link>
                  </td>
                  <td className="py-2 px-3 text-muted-foreground whitespace-nowrap">{fmtDate(bc.date)}</td>
                  <td className="py-2 px-3 text-muted-foreground">{bc.bibleReference || '—'}</td>
                  <td className="py-2 px-3">
                    <div className="flex flex-wrap gap-1">
                      {bc.referencedDevotions.length === 0 ? (
                        <span className="text-xs text-muted-foreground">empty</span>
                      ) : (
                        bc.referencedDevotions.map((n) => (
                          <Badge key={n} variant="outline" className="text-xs">
                            #{String(n).padStart(3, '0')}
                          </Badge>
                        ))
                      )}
                    </div>
                  </td>
                  <td className="py-2 px-3">
                    <div className="flex flex-wrap gap-1">
                      {bc.missing.map((m) => (
                        <Badge key={m.number} variant="destructive" className="text-xs">
                          #{String(m.number).padStart(3, '0')} ({m.type})
                        </Badge>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </AuditSection>

      {/* Chain Lineage Issues */}
      <AuditSection title="Chain Lineage Issues" count={audit.chainLineageIssues.length}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 px-3 font-medium text-muted-foreground">Revisit</th>
                <th className="text-left py-2 px-3 font-medium text-muted-foreground">Date</th>
                <th className="text-left py-2 px-3 font-medium text-muted-foreground">Root</th>
                <th className="text-left py-2 px-3 font-medium text-muted-foreground">Issue</th>
                <th className="text-left py-2 px-3 font-medium text-muted-foreground">Details</th>
                <th className="text-right py-2 px-3 font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {audit.chainLineageIssues.map((li) => (
                <tr key={li.id} className="border-b last:border-0 align-top">
                  <td className="py-2 px-3">
                    <Link to={`/devotions/${li.id}`} className="text-primary hover:underline font-medium">
                      #{String(li.number).padStart(3, '0')}
                    </Link>
                  </td>
                  <td className="py-2 px-3 text-muted-foreground whitespace-nowrap">{fmtDate(li.date)}</td>
                  <td className="py-2 px-3 text-muted-foreground whitespace-nowrap">
                    {li.rootNumber != null ? `#${String(li.rootNumber).padStart(3, '0')}` : '—'}
                  </td>
                  <td className="py-2 px-3">
                    <Badge
                      variant={li.issueType === 'missing-siblings' ? 'outline' : 'destructive'}
                      className="text-xs"
                    >
                      {li.issueType}
                    </Badge>
                  </td>
                  <td className="py-2 px-3">
                    <div className="space-y-1">
                      <div className="text-muted-foreground">{li.detail}</div>
                      {li.related.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {li.related.map((r) => (
                            <Badge key={r.number} variant="outline" className="text-xs">
                              #{String(r.number).padStart(3, '0')}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="py-2 px-3 text-right">
                    {li.issueType === 'root-is-revisit' && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => fixRootMutation.mutate(li.id)}
                        disabled={fixRootMutation.isPending}
                      >
                        <Wrench className="h-3.5 w-3.5" />
                        Fix
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </AuditSection>

      {/* Revisits with Mismatched Verses */}
      <AuditSection title="Revisits with Mismatched Verses" count={audit.mismatchedRevisits.length}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 px-3 font-medium text-muted-foreground">Revisit</th>
                <th className="text-left py-2 px-3 font-medium text-muted-foreground">Date</th>
                <th className="text-left py-2 px-3 font-medium text-muted-foreground">Revisit Scripture</th>
                <th className="text-left py-2 px-3 font-medium text-muted-foreground">Original</th>
                <th className="text-left py-2 px-3 font-medium text-muted-foreground">Original Scripture</th>
              </tr>
            </thead>
            <tbody>
              {audit.mismatchedRevisits.map((m) => (
                <tr key={m.id} className="border-b last:border-0 align-top">
                  <td className="py-2 px-3">
                    <Link to={`/devotions/${m.id}`} className="text-primary hover:underline font-medium">
                      #{String(m.number).padStart(3, '0')}
                    </Link>
                  </td>
                  <td className="py-2 px-3 text-muted-foreground whitespace-nowrap">{fmtDate(m.date)}</td>
                  <td className="py-2 px-3">{m.bibleReference}</td>
                  <td className="py-2 px-3 whitespace-nowrap">
                    <span className="text-muted-foreground">
                      #{String(m.originalNumber).padStart(3, '0')} · {fmtDate(m.originalDate)}
                    </span>
                  </td>
                  <td className="py-2 px-3 text-muted-foreground">{m.originalBibleReference || '—'}</td>
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
