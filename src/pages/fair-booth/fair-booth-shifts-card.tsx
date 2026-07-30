// The Shifts Card: one person's Shifts for one fair, rendered at Facebook-story
// geometry (1080x1920) so it drops into a story or an iMessage thread without
// cropping. Inline styles throughout — html-to-image captures this node with
// skipFonts, so it must not depend on Tailwind or on webfont embedding.
import {
  SHIFT_ROLE_LABEL,
  type ShiftDay,
  computePersonShifts,
  formatShiftDate,
  formatShiftRanges,
} from '@/lib/fair-booth-render'
import type {FairSignup} from '@/lib/fair-booth-render'

import {SHIFTS_CARD_HEIGHT, SHIFTS_CARD_WIDTH} from './fair-booth-exports'

interface TypeScale {
  title: number
  name: number
  intro: number
  bullet: number
  sub: number
  gap: number
  logo: number
}

// Content height varies hugely between a 2-shift volunteer and a 9-day fair
// manager, so the type scales in steps to keep the canvas fixed. Driven off the
// line count rather than a DOM measure: deterministic, and it can't loop.
const SCALES: {maxLines: number; scale: TypeScale}[] = [
  {maxLines: 5, scale: {title: 104, name: 58, intro: 40, bullet: 46, sub: 40, gap: 34, logo: 230}},
  {maxLines: 9, scale: {title: 92, name: 50, intro: 35, bullet: 40, sub: 35, gap: 26, logo: 190}},
  {maxLines: 14, scale: {title: 80, name: 44, intro: 31, bullet: 34, sub: 30, gap: 19, logo: 150}},
  {maxLines: Infinity, scale: {title: 68, name: 38, intro: 27, bullet: 28, sub: 25, gap: 13, logo: 110}},
]

function countLines(days: ShiftDay[]): number {
  return days.reduce((n, d) => n + 1 + (d.groups.length > 1 ? d.groups.length : 0), 0)
}

function scaleFor(days: ShiftDay[]): TypeScale {
  const lines = countLines(days)
  return SCALES.find((s) => lines <= s.maxLines)!.scale
}

interface Props {
  signups: FairSignup[]
  personId: number
  displayName: string
  introText: string
  logoPath: string | null
  // Rendered at 1/N scale for on-screen preview; the capture always reads the
  // untransformed node.
  previewScale?: number
}

export function FairBoothShiftsCard({signups, personId, displayName, introText, logoPath, previewScale}: Props) {
  const days = computePersonShifts(signups, personId)
  const t = scaleFor(days)

  const card = (
    <div
      style={{
        width: SHIFTS_CARD_WIDTH,
        height: SHIFTS_CARD_HEIGHT,
        background: '#ffffff',
        color: '#111111',
        fontFamily: 'Arial, Helvetica, sans-serif',
        padding: '110px 90px',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
      }}
    >
      {logoPath && (
        <img
          src={logoPath}
          alt=""
          style={{maxHeight: t.logo, maxWidth: 560, flexShrink: 0, objectFit: 'contain', marginBottom: 44}}
          crossOrigin="anonymous"
        />
      )}
      {/* width:100% + nowrap: under align-items:center these shrink to fit
          content, and html-to-image then wraps the text without growing the
          box — the name lands on top of a two-line title. */}
      <div
        style={{
          width: '100%',
          flexShrink: 0,
          whiteSpace: 'nowrap',
          fontFamily: '"DM Serif Display", Georgia, serif',
          fontSize: t.title,
          lineHeight: 1.15,
          height: Math.round(t.title * 1.15),
          fontWeight: 400,
        }}
      >
        Your Shifts
      </div>
      <div
        style={{
          width: '100%',
          flexShrink: 0,
          fontSize: t.name,
          lineHeight: 1.25,
          fontWeight: 700,
          marginTop: 18,
          letterSpacing: 0.5,
        }}
      >
        {displayName}
      </div>
      {introText.trim() && (
        <div
          style={{
            width: '100%',
            flexShrink: 0,
            fontSize: t.intro,
            lineHeight: 1.45,
            marginTop: 44,
            maxWidth: 820,
            whiteSpace: 'pre-wrap',
            color: '#333333',
          }}
        >
          {introText}
        </div>
      )}
      <div
        style={{
          marginTop: 56,
          width: '100%',
          flexShrink: 0,
          textAlign: 'left',
          display: 'flex',
          flexDirection: 'column',
          gap: t.gap,
        }}
      >
        {days.map((day) => {
          const mixed = day.groups.length > 1
          if (!mixed) {
            const g = day.groups[0]
            return (
              <div key={day.dayDate} style={{fontSize: t.bullet, lineHeight: 1.3, display: 'flex', gap: 18}}>
                <span aria-hidden>•</span>
                <span>
                  <span style={{fontWeight: 700}}>{formatShiftDate(day.dayDate)}</span>
                  {' — '}
                  {formatShiftRanges(g.ranges)}
                  {/* A lone plain Worker line stays quiet; only leadership is called out. */}
                  {g.shiftRole !== 'worker' && (
                    <span style={{color: '#555555'}}>{`  (${SHIFT_ROLE_LABEL[g.shiftRole]})`}</span>
                  )}
                </span>
              </div>
            )
          }
          // Role changed mid-day: date once, one sub-bullet per role, every one
          // labelled — an unlabelled sibling would read as a mistake.
          return (
            <div key={day.dayDate} style={{fontSize: t.bullet, lineHeight: 1.3}}>
              <div style={{display: 'flex', gap: 18}}>
                <span aria-hidden>•</span>
                <span style={{fontWeight: 700}}>{formatShiftDate(day.dayDate)}</span>
              </div>
              {day.groups.map((g) => (
                <div
                  key={g.shiftRole}
                  style={{
                    fontSize: t.sub,
                    marginTop: Math.round(t.gap * 0.35),
                    marginLeft: 62,
                    display: 'flex',
                    gap: 16,
                  }}
                >
                  <span aria-hidden>–</span>
                  <span>
                    {formatShiftRanges(g.ranges)}
                    <span style={{color: '#555555'}}>{`  (${SHIFT_ROLE_LABEL[g.shiftRole]})`}</span>
                  </span>
                </div>
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )

  if (!previewScale) return card
  return (
    <div
      style={{
        width: SHIFTS_CARD_WIDTH * previewScale,
        height: SHIFTS_CARD_HEIGHT * previewScale,
        overflow: 'hidden',
      }}
    >
      <div style={{transform: `scale(${previewScale})`, transformOrigin: 'top left'}}>{card}</div>
    </div>
  )
}
