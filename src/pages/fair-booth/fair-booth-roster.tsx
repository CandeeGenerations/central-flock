import {Badge} from '@/components/ui/badge'
import {computeInitialsForRoster, orderRoster, splitRosterColumns} from '@/lib/fair-booth-render'
import type {FairBoothRosterAttr, FairBoothSignup} from '@/lib/schedules-api'

interface FairBoothRosterProps {
  people: {id: number; firstName: string | null; lastName: string | null; isHispanic: boolean}[]
  rosterPersonIds: number[]
  rosterAttrs: FairBoothRosterAttr[]
  signups: FairBoothSignup[]
  minSignupsForBold: number
  onClickPerson: (personId: number) => void
}

export function FairBoothRoster({
  people,
  rosterPersonIds,
  rosterAttrs,
  signups,
  minSignupsForBold,
  onClickPerson,
}: FairBoothRosterProps) {
  const rosterSet = new Set(rosterPersonIds)
  const inRoster = people.filter((p) => rosterSet.has(p.id))
  const attrsByPerson = new Map(rosterAttrs.map((a) => [a.personId, a]))
  const overrides = new Map<number, string>()
  for (const a of rosterAttrs) {
    if (a.initialsOverride && a.initialsOverride.trim() !== '') overrides.set(a.personId, a.initialsOverride)
  }
  const initials = computeInitialsForRoster(
    inRoster.map((p) => ({
      id: p.id,
      firstName: p.firstName ?? '',
      lastName: p.lastName ?? '',
      isHispanic: p.isHispanic,
    })),
    overrides,
  )
  const signupCounts = new Map<number, number>()
  for (const s of signups) signupCounts.set(s.personId, (signupCounts.get(s.personId) ?? 0) + 1)
  const rosterRows = inRoster.map((p) => ({
    personId: p.id,
    firstName: p.firstName ?? '',
    lastName: p.lastName ?? '',
    fairRole: attrsByPerson.get(p.id)?.fairRole ?? ('worker' as const),
    initialsOverride: attrsByPerson.get(p.id)?.initialsOverride ?? null,
    signupCount: signupCounts.get(p.id) ?? 0,
    isHispanic: p.isHispanic,
  }))
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
      <div className="grid grid-cols-2 gap-3">
        <RosterColumn rows={left} initials={initials} minBold={minSignupsForBold} onClick={onClickPerson} />
        <RosterColumn rows={right} initials={initials} minBold={minSignupsForBold} onClick={onClickPerson} />
      </div>
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
}

function RosterColumn({rows, initials, minBold, onClick}: RosterColumnProps) {
  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr>
          <th className="border bg-gray-100 p-1 text-left text-gray-900">Name ({rows.length})</th>
          <th className="border bg-gray-100 p-1 text-left w-24 text-gray-900">Initials</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const fullName = [r.firstName, r.lastName].filter(Boolean).join(' ') || `Person ${r.personId}`
          const italic = r.signupCount === 0
          const bold = r.signupCount > 0 && r.signupCount < minBold
          const init = initials.get(r.personId) ?? '??'
          return (
            <tr key={r.personId} className="cursor-pointer hover:bg-muted/30" onClick={() => onClick(r.personId)}>
              <td className={`border p-1 ${italic ? 'italic' : ''} ${bold ? 'font-bold' : ''}`}>
                {fullName} ({r.signupCount})
                {r.isHispanic && (
                  <Badge variant="secondary" className="ml-1 text-xs">
                    H
                  </Badge>
                )}
              </td>
              <td className="border p-1 font-mono">{init}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
