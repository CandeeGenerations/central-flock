/**
 * The Scripture Check: proofreads a Scripture Block of a Gwendolyn Devotional against the Bible
 * Text. See CONTEXT.md (Scripture Check, Finding, Dismissal) and docs/adr/0039.
 *
 * `checkBlock` is deterministic and cheap enough to run on every keystroke and for every row of a
 * list. `explainNotFound` is the only part that calls the model, and anything it proposes is run
 * back through `checkBlock` before it is offered as a fix.
 */
import Anthropic from '@anthropic-ai/sdk'
import crypto from 'crypto'
import {eq} from 'drizzle-orm'

import {db, schema} from '../db/index.js'
import {effortConfig, resolveModel} from '../lib/ai-models.js'
import {
  type Alignment,
  type Token,
  align,
  bibleWord,
  findExact,
  findFuzzy,
  findReferenceIn,
  isClose,
  referenceFromVerses,
  resolveReference,
  sameBook,
  tokenize,
  verseCount,
  verseText,
} from '../lib/bible-text.js'

// Most severe first — the order Findings are listed in
export const FINDING_KINDS = [
  'missing_reference',
  'invalid_reference',
  'wrong_reference',
  'out_of_range',
  'wording_differs',
  'not_found',
  'reference_format',
] as const
export type FindingKind = (typeof FINDING_KINDS)[number]

export interface DiffWord {
  op: 'same' | 'del' | 'ins' | 'gap'
  word: string
}

export interface Candidate {
  reference: string
  text: string
}

export interface Finding {
  kind: FindingKind
  message: string
  basis: string
  fix?: {reference?: string; text?: string}
  candidates?: Candidate[]
  diff?: DiffWord[]
  aiNote?: string
  dismissed?: boolean
}

export interface BlockCheck {
  findings: Finding[]
  passage?: Candidate // the cited verses as the Bible Text has them
  aiChecked?: boolean
}

export interface Dismissal {
  kind: FindingKind
  basis: string
}

export interface ScriptureBlockInput {
  text: string
  reference: string
  dismissals?: Dismissal[]
  // The point just before the block. When the reference is blank but the lead-in names one
  // ("Proverbs 3:13 reminds us,"), that is the reference the block is checked against.
  leadIn?: string
}

// Fragments shorter than this are too common to search the whole Bible by
const SEARCH_MIN_WORDS = 4
// How far outside the cited verses a Fragment may sit and still count as Out of Range
const NEAR = 4
const MAX_CANDIDATES = 5
// A phrase that appears in more places than this is too common to anchor a search on its own
const MAX_WINDOWS = 60

interface Fragment {
  text: string
  tokens: Token[] // spans are offsets into the whole block text
  words: string[]
}

interface Placement {
  lo: number
  hi: number
  alignment?: Alignment // present when the words are close but not exact
}

interface FragState {
  frag: Fragment
  cited?: Placement
  exact: {lo: number; hi: number}[]
  fuzzy: Alignment[]
}

const hash = (s: string) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 12)

function snippet(text: string, words = 8): string {
  const parts = text.trim().split(/\s+/)
  return parts.length <= words ? text.trim() : `${parts.slice(0, words).join(' ')}…`
}

export function splitFragments(text: string): Fragment[] {
  // Her [bracketed glosses] explain a word ("stay [rely] upon") — they are hers, not quotation
  const glosses = [...text.matchAll(/\[[^\]]*\]/g)].map((m) => [m.index, m.index + m[0].length])
  const inGloss = (pos: number) => glosses.some(([a, b]) => pos >= a && pos < b)
  const bounds: [number, number][] = []
  let last = 0
  for (const m of text.matchAll(/…|\.\s?\.\s?\./g)) {
    bounds.push([last, m.index])
    last = m.index + m[0].length
  }
  bounds.push([last, text.length])
  const out: Fragment[] = []
  for (const [s, e] of bounds) {
    const tokens = tokenize(text.slice(s, e))
      .map((t) => ({...t, start: t.start + s, end: t.end + s}))
      .filter((t) => !inGloss(t.start))
    if (tokens.length) out.push({text: text.slice(s, e).trim(), tokens, words: tokens.map((t) => t.norm)})
  }
  return out
}

function passageOfVerses(verses: number[]): Candidate {
  const shown = verses.slice(0, 12)
  const text = shown.map(verseText).join(' ') + (verses.length > shown.length ? ' …' : '')
  return {reference: referenceFromVerses(verses), text}
}

function runs(verses: number[]): {lo: number; hi: number}[] {
  const out: {lo: number; hi: number}[] = []
  for (const v of verses) {
    const last = out[out.length - 1]
    if (last && v === last.hi + 1) last.hi = v
    else out.push({lo: v, hi: v})
  }
  return out
}

function windowAround(lo: number, hi: number): {lo: number; hi: number} {
  let wlo = lo
  let whi = hi
  while (wlo > 0 && lo - wlo < NEAR && sameBook(wlo - 1, lo)) wlo--
  while (whi + 1 < verseCount() && whi - hi < NEAR && sameBook(whi + 1, hi)) whi++
  return {lo: wlo, hi: whi}
}

/** Where a Fragment sits within verses lo..hi: verbatim if possible, else close enough to be a misquote. */
function placeIn(s: FragState, w: {lo: number; hi: number}): Placement | null {
  if (s.cited && s.cited.lo >= w.lo && s.cited.hi <= w.hi) return s.cited
  const ex = findExact(s.frag.words, w)[0]
  if (ex) return {lo: ex.verseLo, hi: ex.verseHi}
  if (s.frag.words.length >= 2) {
    const a = align(s.frag.words, w.lo, w.hi)
    if (a && isClose(a, s.frag.words.length)) return {lo: a.verseLo, hi: a.verseHi, alignment: a}
  }
  return null
}

function placeAll(states: FragState[], w: {lo: number; hi: number}): Map<FragState, Placement> | null {
  const placed = new Map<FragState, Placement>()
  for (const s of states) {
    const p = placeIn(s, w)
    if (!p) return null
    placed.set(s, p)
  }
  return placed
}

interface WindowResult {
  placed: Map<FragState, Placement>
  verses: number[] // tight contiguous span of the placements
}

/** Passages that contain every one of `required` — generated around the rarest anchor Fragment. */
function candidateWindows(required: FragState[], optional: FragState[]): WindowResult[] {
  const withOcc = required.map((s) => ({
    s,
    occ: s.exact.length ? s.exact : s.fuzzy.map((a) => ({lo: a.verseLo, hi: a.verseHi})),
  }))
  const searchable = withOcc.filter((x) => x.s.frag.words.length >= SEARCH_MIN_WORDS && x.occ.length)
  const pool = searchable.length ? searchable : withOcc.filter((x) => x.occ.length)
  if (!pool.length) return []
  const anchor = pool.reduce((a, b) => (b.occ.length < a.occ.length ? b : a))

  const results: WindowResult[] = []
  const seen = new Set<string>()
  for (const o of anchor.occ.slice(0, MAX_WINDOWS)) {
    const w = windowAround(o.lo, o.hi)
    const placed = placeAll(required, w)
    if (!placed) continue
    for (const s of optional) {
      const p = placeIn(s, w)
      if (p) placed.set(s, p)
    }
    const lo = Math.min(...[...placed.values()].map((p) => p.lo))
    const hi = Math.max(...[...placed.values()].map((p) => p.hi))
    const key = `${lo}-${hi}`
    if (seen.has(key)) continue
    seen.add(key)
    const verses: number[] = []
    for (let v = lo; v <= hi; v++) verses.push(v)
    results.push({placed, verses})
  }
  return results
}

function placementKey(placed: Map<FragState, Placement>, states: FragState[]): string {
  return states.map((s) => (placed.get(s) ? `${placed.get(s)!.lo}-${placed.get(s)!.hi}` : '')).join(',')
}

/** One Wording Differs Finding for the whole quotation: a word diff and the quotation with only those words fixed. */
function wordingFinding(
  text: string,
  frags: Fragment[],
  placed: Map<Fragment, Placement>,
): {diff: DiffWord[]; fixText: string; verses: string} | null {
  const diff: DiffWord[] = []
  const edits: {start: number; end: number; insert: string; order: number}[] = []
  const verses: string[] = []
  let changed = false
  frags.forEach((f, fi) => {
    if (fi > 0) diff.push({op: 'gap', word: '…'})
    const p = placed.get(f)
    const ops = p?.alignment?.ops
    if (!ops || ops.every((o) => o.op === 'same')) {
      for (const t of f.tokens) diff.push({op: 'same', word: t.raw})
      return
    }
    changed = true
    verses.push(`${p!.lo}-${p!.hi}`)
    let lastEnd = f.tokens[0].start
    for (const o of ops) {
      if (o.op === 'same') {
        diff.push({op: 'same', word: f.tokens[o.frag].raw})
        lastEnd = f.tokens[o.frag].end
      } else if (o.op === 'sub') {
        const t = f.tokens[o.frag]
        diff.push({op: 'del', word: t.raw}, {op: 'ins', word: bibleWord(o.bible)})
        edits.push({start: t.start, end: t.end, insert: bibleWord(o.bible), order: edits.length})
        lastEnd = t.end
      } else if (o.op === 'del') {
        const t = f.tokens[o.frag]
        diff.push({op: 'del', word: t.raw})
        // Take the following space with the word, or the preceding one if punctuation follows
        const after = text[t.end] === ' '
        edits.push({
          start: after ? t.start : t.start - (text[t.start - 1] === ' ' ? 1 : 0),
          end: after ? t.end + 1 : t.end,
          insert: '',
          order: edits.length,
        })
      } else {
        diff.push({op: 'ins', word: bibleWord(o.bible)})
        const at = lastEnd + (text.slice(lastEnd).match(/^[^\sA-Za-z0-9[]*/)?.[0].length ?? 0)
        edits.push({start: at, end: at, insert: ` ${bibleWord(o.bible)}`, order: edits.length})
      }
    }
  })
  if (!changed) return null
  let fixText = text
  for (const e of [...edits].sort((a, b) => b.start - a.start || b.order - a.order)) {
    fixText = fixText.slice(0, e.start) + e.insert + fixText.slice(e.end)
  }
  return {diff, fixText, verses: verses.join(',')}
}

export function checkBlock(block: ScriptureBlockInput): BlockCheck {
  const text = block.text ?? ''
  const given = (block.reference ?? '').trim()
  const fromLeadIn = !given && block.leadIn ? findReferenceIn(block.leadIn) : null
  const refText = given || fromLeadIn || ''
  const findings: Finding[] = []
  const frags = splitFragments(text)

  let refState: 'missing' | 'invalid' | 'ok' = 'missing'
  let invalidMessage = ''
  let cited: {canonical: string; verses: number[]; set: Set<number>} | null = null
  if (refText) {
    const r = resolveReference(refText)
    if (!r.ok) {
      refState = 'invalid'
      invalidMessage = r.message
    } else {
      refState = 'ok'
      cited = {canonical: r.canonical, verses: r.verses, set: new Set(r.verses)}
      // A reference in the lead-in is prose — its formatting is hers
      if (!fromLeadIn && r.canonical !== refText) {
        findings.push({
          kind: 'reference_format',
          message: `Write it as ${r.canonical}.`,
          basis: hash(`f|${refText}`),
          fix: {reference: r.canonical},
        })
      }
    }
  }

  const passage = cited ? passageOfVerses(cited.verses) : undefined
  if (frags.length === 0) return finish(findings, block, passage)

  // Where is each Fragment?
  const states: FragState[] = frags.map((frag) => {
    const exactOcc = findExact(frag.words).map((o) => ({lo: o.verseLo, hi: o.verseHi}))
    let citedPlacement: Placement | undefined
    if (cited) {
      const inside = exactOcc.find((o) => {
        for (let v = o.lo; v <= o.hi; v++) if (!cited!.set.has(v)) return false
        return true
      })
      if (inside) citedPlacement = inside
      else if (exactOcc.length === 0) {
        let best: Alignment | null = null
        for (const r of runs(cited.verses)) {
          const a = align(frag.words, r.lo, r.hi)
          if (a && (!best || a.matches > best.matches)) best = a
        }
        if (best && isClose(best, frag.words.length)) {
          citedPlacement = {lo: best.verseLo, hi: best.verseHi, alignment: best}
        }
      }
    }
    const fuzzy = !citedPlacement && exactOcc.length === 0 ? findFuzzy(frag.words) : []
    return {frag, cited: citedPlacement, exact: exactOcc, fuzzy}
  })

  const located = states.filter((s) => s.cited || s.exact.length || s.fuzzy.length)
  const notCited = states.filter((s) => !s.cited)
  const locatedElsewhere = located.filter((s) => !s.cited)

  const unlocated = states.filter((s) => !located.includes(s))
  const citedPlacements = () => new Map(states.filter((s) => s.cited).map((s) => [s, s.cited!]))

  const locationKind: FindingKind =
    refState === 'missing' ? 'missing_reference' : refState === 'invalid' ? 'invalid_reference' : 'wrong_reference'
  const locationLead =
    refState === 'missing'
      ? 'No reference given.'
      : refState === 'invalid'
        ? `${refText}${fromLeadIn ? ' (named in the lead-in)' : ''} doesn't exist — ${invalidMessage}.`
        : `Not in ${cited?.canonical}${fromLeadIn ? ' (named in the lead-in)' : ''}.`

  /** Adds a location Finding; returns the settled placements when exactly one passage fits. */
  const pushLocation = (
    kind: FindingKind,
    message: string,
    windows: WindowResult[],
    extraVerses: number[] = [],
  ): Map<FragState, Placement> | null => {
    const cands = windows.map((w) => passageOfVerses([...extraVerses, ...w.verses]))
    const unique = [...new Map(cands.map((c) => [c.reference, c])).values()].slice(0, MAX_CANDIDATES)
    const placedKey = windows.length === 1 ? placementKey(windows[0].placed, states) : 'ambiguous'
    const finding: Finding = {kind, message, basis: hash(`l|${refText}|${placedKey}`)}
    if (unique.length === 1) {
      finding.fix = {reference: unique[0].reference}
      finding.message += ` Found in ${unique[0].reference}.`
      finding.candidates = unique
    } else if (unique.length > 1) {
      finding.message += ` These words appear in ${unique.length} places — pick the right one.`
      finding.candidates = unique
    }
    findings.push(finding)
    return unique.length === 1 ? windows[0].placed : null
  }

  // The placements the wording is judged against; null while the location is unsettled
  let chosen: Map<FragState, Placement> | null = null

  if (cited && notCited.length === 0) {
    chosen = citedPlacements()
  } else if (cited) {
    // Does stretching the cited range a few verses explain the rest? Only when some of it is in range —
    // "Isa 41:9" quoting all of 41:10 is a wrong reference, not a short one.
    const lo = Math.min(...cited.verses)
    const hi = Math.max(...cited.verses)
    const w = windowAround(lo, hi)
    const near = sameBook(lo, hi) && states.some((s) => s.cited) ? placeAll(locatedElsewhere, w) : null
    if (near) {
      for (const s of unlocated) {
        const p = placeIn(s, w)
        if (p) near.set(s, p)
      }
    }
    if (near && near.size > 0) {
      const all = [...cited.verses, ...[...near.values()].flatMap((p) => range(p.lo, p.hi))]
      const span = range(Math.min(...all), Math.max(...all))
      const fix = referenceFromVerses(span)
      const [outside, p] = [...near.entries()][0]
      chosen = new Map([...citedPlacements(), ...near])
      findings.push({
        kind: 'out_of_range',
        message: `Partly outside ${cited.canonical}: "${snippet(outside.frag.text, 6)}" is ${referenceFromVerses(
          range(p.lo, p.hi),
        )}. Use ${fix}.`,
        basis: hash(`l|${refText}|${placementKey(chosen, states)}`),
        fix: {reference: fix},
        candidates: [passageOfVerses(span)],
      })
    } else if (states.some((s) => s.cited) && locatedElsewhere.length) {
      // A blend: part of it is here, part is from somewhere else entirely
      const settled = pushLocation(
        'out_of_range',
        `Partly outside ${cited.canonical}: "${snippet(locatedElsewhere[0].frag.text, 6)}" is from elsewhere.`,
        candidateWindows(locatedElsewhere, []),
        cited.verses,
      )
      if (settled) chosen = new Map([...citedPlacements(), ...settled])
    } else if (locatedElsewhere.length) {
      chosen = pushLocation(locationKind, locationLead, candidateWindows(locatedElsewhere, unlocated))
    } else {
      chosen = citedPlacements()
    }
  } else if (located.length) {
    chosen = pushLocation(locationKind, locationLead, candidateWindows(located, unlocated))
  } else {
    findings.push({kind: locationKind, message: locationLead, basis: hash(`l|${refText}|`)})
  }

  const finalPlaced: Map<FragState, Placement> = chosen ?? citedPlacements()
  const byFrag = new Map<Fragment, Placement>([...finalPlaced].map(([s, p]) => [s.frag, p]))

  const wording = wordingFinding(text, frags, byFrag)
  if (wording) {
    const where = referenceFromVerses([...byFrag.values()].filter((p) => p.alignment).flatMap((p) => range(p.lo, p.hi)))
    findings.push({
      kind: 'wording_differs',
      message: `The wording differs from ${where} in the AKJV.`,
      basis: hash(`w|${text}|${wording.verses}`),
      fix: {text: wording.fixText},
      diff: wording.diff,
    })
  }

  // Placed nowhere. While the passage is unsettled (ambiguous), a Fragment found somewhere still counts as found.
  const missing = states.filter((s) => !finalPlaced.has(s) && (chosen !== null || !located.includes(s)))
  if (missing.length) {
    findings.push({
      kind: 'not_found',
      message:
        missing.length === 1
          ? `Couldn't find "${snippet(missing[0].frag.text)}" in the Bible Text.`
          : `Couldn't find ${missing.length} parts of this quotation in the Bible Text.`,
      basis: hash(`n|${text}|${cited?.canonical ?? ''}`),
    })
  }

  return finish(findings, block, passage)
}

function range(lo: number, hi: number): number[] {
  const out: number[] = []
  for (let v = lo; v <= hi; v++) out.push(v)
  return out
}

function finish(findings: Finding[], block: ScriptureBlockInput, passage?: Candidate): BlockCheck {
  const dismissed = new Set((block.dismissals ?? []).map((d) => `${d.kind}|${d.basis}`))
  for (const f of findings) if (dismissed.has(`${f.kind}|${f.basis}`)) f.dismissed = true
  findings.sort((a, b) => FINDING_KINDS.indexOf(a.kind) - FINDING_KINDS.indexOf(b.kind))
  return passage ? {findings, passage} : {findings}
}

export function openFindingCount(check: BlockCheck): number {
  return check.findings.filter((f) => !f.dismissed).length
}

/** Keep only the Dismissals that still match a current Finding, so stale ones don't pile up. */
export function pruneDismissals(block: ScriptureBlockInput): Dismissal[] | undefined {
  if (!block.dismissals?.length) return undefined
  const current = new Set(checkBlock({...block, dismissals: []}).findings.map((f) => `${f.kind}|${f.basis}`))
  const kept = block.dismissals.filter((d) => current.has(`${d.kind}|${d.basis}`))
  return kept.length ? kept : undefined
}

// ---------------------------------------------------------------------------
// AI fallback: only for Not Found, and only ever confirmed by the Bible Text

const LOCATION_KINDS: FindingKind[] = ['missing_reference', 'invalid_reference', 'wrong_reference', 'out_of_range']

const AI_SYSTEM = `You identify Bible passages. The church uses the Authorized King James Version (AKJV).
You will be given a quotation from a devotional and the reference its author gave. The quotation may
elide words with "…", paraphrase, blend verses, or come from another translation.
Reply with exactly two tags and nothing else:
<reference>the AKJV reference the quotation comes from, e.g. "Isaiah 41:10" or "Habakkuk 3:17-19"; leave empty if you cannot tell</reference>
<note>one short sentence on how the quotation differs from the AKJV</note>`

function configuredModel(): string {
  const row = db
    .select({value: schema.settings.value})
    .from(schema.settings)
    .where(eq(schema.settings.key, 'defaultAiModel'))
    .get()
  return resolveModel(row?.value)
}

export async function explainNotFound(block: ScriptureBlockInput, check = checkBlock(block)): Promise<BlockCheck> {
  const notFound = check.findings.find((f) => f.kind === 'not_found')
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!notFound || !apiKey) return check

  let aiRef: string
  let note: string
  try {
    const model = configuredModel()
    const client = new Anthropic({apiKey})
    const response = await client.messages.create({
      model,
      max_tokens: 1024,
      ...effortConfig(model, 'low'),
      system: AI_SYSTEM,
      messages: [
        {role: 'user', content: `Quotation: ${block.text}\nReference given: ${block.reference.trim() || '(none)'}`},
      ],
    })
    const out = response.content.find((b) => b.type === 'text')
    const reply = out && out.type === 'text' ? out.text : ''
    aiRef = reply.match(/<reference>([\s\S]*?)<\/reference>/)?.[1].trim() ?? ''
    note = reply.match(/<note>([\s\S]*?)<\/note>/)?.[1].trim() ?? ''
  } catch (err) {
    console.warn('[scripture-check] AI fallback failed:', err instanceof Error ? err.message : err)
    return check
  }

  const resolved = aiRef ? resolveReference(aiRef) : null
  const refText = (block.reference ?? '').trim() || (block.leadIn ? findReferenceIn(block.leadIn) : null) || ''
  const given = resolveReference(refText)
  const sameAsGiven = resolved?.ok && given.ok && resolved.canonical === given.canonical
  if (resolved?.ok && !sameAsGiven) {
    const recheck = checkBlock({...block, reference: resolved.canonical})
    const confirmed = !recheck.findings.some((f) => f.kind === 'not_found' || LOCATION_KINDS.includes(f.kind))
    if (confirmed) {
      const kind: FindingKind = !refText ? 'missing_reference' : given.ok ? 'wrong_reference' : 'invalid_reference'
      const lead = !refText
        ? 'No reference given.'
        : given.ok
          ? `Not in ${given.canonical}.`
          : `${refText} doesn't exist.`
      const findings: Finding[] = [
        {
          kind,
          message: `${lead} Found in ${resolved.canonical} (located with AI help, confirmed against the Bible Text).`,
          basis: hash(`l|${refText}|ai|${resolved.canonical}`),
          fix: {reference: resolved.canonical},
          candidates: [passageOfVerses(resolved.verses)],
          ...(note ? {aiNote: note} : {}),
        },
        ...recheck.findings.filter((f) => f.kind === 'wording_differs'),
      ]
      return {...finish(findings, block, check.passage), aiChecked: true}
    }
  }

  const guess = [aiRef, note].filter(Boolean).join(' — ')
  return {
    ...check,
    findings: check.findings.map((f) =>
      f === notFound && guess ? {...f, aiNote: `AI guess, not confirmed by the Bible Text: ${guess}`} : f,
    ),
    aiChecked: true,
  }
}
