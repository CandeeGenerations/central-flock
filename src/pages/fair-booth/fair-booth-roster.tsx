import {Badge} from '@/components/ui/badge'
import {computeInitialsForRoster, fairRoleStars, orderRoster, splitRosterColumns} from '@/lib/fair-booth-render'
import type {FairBoothFairRole, FairBoothRosterAttr, FairBoothSignup} from '@/lib/schedules-api'

interface FairBoothRosterProps {
  people: {id: number; firstName: string | null; lastName: string | null; isHispanic: boolean}[]
  rosterPersonIds: number[]
  rosterAttrs: FairBoothRosterAttr[]
  signups: FairBoothSignup[]
  minSignupsForBold: number
  onClickPerson: (personId: number) => void
  blankRowsPerColumn?: number
  singleColumn?: boolean
  clickable?: boolean
  forceLight?: boolean
}

export function FairBoothRoster({
  people,
  rosterPersonIds,
  rosterAttrs,
  signups,
  minSignupsForBold,
  onClickPerson,
  blankRowsPerColumn = 4,
  singleColumn = false,
  clickable = true,
  forceLight = false,
}: FairBoothRosterProps) {
  const rosterSet = new Set(rosterPersonIds)
  const signedUpIds = new Set(signups.map((s) => s.personId))
  const inRoster = people.filter((p) => rosterSet.has(p.id) && signedUpIds.has(p.id))
  const attrsByPerson = new Map(rosterAttrs.map((a) => [a.personId, a]))
  const overrides = new Map<number, string>()
  for (const a of rosterAttrs) {
    if (a.initialsOverride && a.initialsOverride.trim() !== '') overrides.set(a.personId, a.initialsOverride)
  }
  function effectiveName(p: {id: number; firstName: string | null; lastName: string | null}): {
    first: string
    last: string
  } {
    const ov = attrsByPerson.get(p.id)?.nameOverride
    if (ov && ov.trim() !== '') {
      const parts = ov.trim().split(/\s+/)
      return {first: parts[0] ?? '', last: parts.slice(1).join(' ')}
    }
    return {first: p.firstName ?? '', last: p.lastName ?? ''}
  }
  const initials = computeInitialsForRoster(
    inRoster.map((p) => {
      const n = effectiveName(p)
      return {id: p.id, firstName: n.first, lastName: n.last, isHispanic: p.isHispanic}
    }),
    overrides,
  )
  const signupCounts = new Map<number, number>()
  for (const s of signups) signupCounts.set(s.personId, (signupCounts.get(s.personId) ?? 0) + 1)
  const rosterRows = inRoster.map((p) => {
    const n = effectiveName(p)
    return {
      personId: p.id,
      firstName: n.first,
      lastName: n.last,
      fairRole: attrsByPerson.get(p.id)?.fairRole ?? ('worker' as const),
      initialsOverride: attrsByPerson.get(p.id)?.initialsOverride ?? null,
      signupCount: signupCounts.get(p.id) ?? 0,
      isHispanic: p.isHispanic,
    }
  })
  const ordered = orderRoster(rosterRows)
  const {left, right} = splitRosterColumns(ordered)
  // Orphans: people with signups but no longer on roster.
  const orphans = people
    .filter((p) => !rosterSet.has(p.id) && (signupCounts.get(p.id) ?? 0) > 0)
    .map((p) => ({
      personId: p.id,
      firstName: p.firstName ?? '',
      lastName: p.lastName ?? '',
      signupCount: signupCounts.get(p.id) ?? 0,
    }))

  return (
    <div className="space-y-3">
      {singleColumn ? (
        <RosterColumn
          rows={ordered}
          initials={initials}
          minBold={minSignupsForBold}
          onClick={clickable ? onClickPerson : () => {}}
          blankRows={blankRowsPerColumn}
          clickable={clickable}
          forceLight={forceLight}
        />
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <RosterColumn
            rows={left}
            initials={initials}
            minBold={minSignupsForBold}
            onClick={clickable ? onClickPerson : () => {}}
            blankRows={blankRowsPerColumn}
            clickable={clickable}
            forceLight={forceLight}
          />
          <RosterColumn
            rows={right}
            initials={initials}
            minBold={minSignupsForBold}
            onClick={clickable ? onClickPerson : () => {}}
            blankRows={blankRowsPerColumn}
            clickable={clickable}
            forceLight={forceLight}
          />
        </div>
      )}
      {orphans.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-300 rounded p-2 text-xs space-y-1">
          <div className="font-semibold text-yellow-900">No longer on roster Group:</div>
          {orphans.map((o) => (
            <div key={o.personId}>
              {o.firstName} {o.lastName} — {o.signupCount} shifts
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

interface RosterColumnProps {
  rows: {
    personId: number
    firstName: string
    lastName: string
    fairRole: string
    initialsOverride: string | null
    signupCount: number
    isHispanic: boolean
  }[]
  initials: Map<number, string>
  minBold: number
  onClick: (personId: number) => void
  blankRows: number
  clickable?: boolean
  forceLight?: boolean
}

function RosterColumn({
  rows,
  initials,
  minBold,
  onClick,
  blankRows,
  clickable = true,
  forceLight = false,
}: RosterColumnProps) {
  const headerBg = forceLight ? 'bg-gray-100' : 'bg-muted'
  const headerText = forceLight ? 'text-gray-900' : 'text-foreground'
  const cellText = forceLight ? 'text-gray-900' : ''
  const borderColor = forceLight ? 'border-gray-400' : ''
  return (
    <div className={`rounded-md overflow-hidden border ${borderColor}`}>
      <table className="w-full text-sm" style={{borderCollapse: 'separate', borderSpacing: 0}}>
        <thead>
          <tr>
            <th className={`border-r border-b ${borderColor} p-1 text-left ${headerText} ${headerBg}`}>
              Name ({rows.length})
            </th>
            <th className={`border-b ${borderColor} p-1 text-left w-24 ${headerText} ${headerBg}`}>Initials</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const fullName = [r.firstName, r.lastName].filter(Boolean).join(' ') || `Person ${r.personId}`
            const italic = r.signupCount === 0
            const bold = r.signupCount > 0 && r.signupCount < minBold
            const init = initials.get(r.personId) ?? '??'
            return (
              <tr
                key={r.personId}
                className={clickable ? 'cursor-pointer hover:bg-muted/30' : ''}
                onClick={clickable ? () => onClick(r.personId) : undefined}
              >
                <td className={`border-r border-b ${borderColor} p-1 ${cellText} ${italic ? 'italic' : ''} ${bold ? 'font-bold' : ''}`}>
                  {fullName} ({r.signupCount})
                  {r.isHispanic && !forceLight && (
                    <Badge variant="secondary" className="ml-1 text-xs">
                      H
                    </Badge>
                  )}
                </td>
                <td className={`border-b ${borderColor} p-1 font-mono ${cellText}`}>
                  {init}
                  {fairRoleStars(r.fairRole as FairBoothFairRole)}
                </td>
              </tr>
            )
          })}
          {Array.from({length: blankRows}).map((_, i) => (
            <tr key={`blank-${i}`}>
              <td className={`border-r border-b ${borderColor} p-1`}>&nbsp;</td>
              <td className={`border-b ${borderColor} p-1`}>&nbsp;</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
