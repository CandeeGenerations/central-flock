/**
 * The Correction Note: a suggested text to Gwendolyn, in the style it is actually sent, listing how her scripture would change — what
 * she sent (her Original, or the current blocks when there is none) against the current blocks
 * with every open Finding's fix applied. So it is ready before anything is edited, and stays right
 * after. Findings with no single fix become questions. Derived, never stored, never sent — offered
 * for copying. Reference Format changes ("Isa." → "Isaiah") are left out. See CONTEXT.md.
 */
import {findReferenceIn, resolveReference, tokenize} from '../lib/bible-text.js'
import {parseDevotional} from './gwendolyn-parse.js'
import type {BlockCheck} from './scripture-check.js'

interface BlockLike {
  type: string
  text: string
  reference?: string
}

interface Scripture {
  text: string
  reference: string
  leadInRef: string // a reference named by the point before, used when `reference` is blank
}

// One thing to raise with her. `inline` follows "I was looking back at this one and …" when it is
// the only item; `bullet` stands alone in a list. Fixes end with asking permission; questions ask.
interface Item {
  kind: 'fix' | 'question'
  inline: string
  bullet: string
}

function canonicalOrRaw(ref: string): string {
  const r = resolveReference(ref)
  return r.ok ? r.canonical : ref.trim()
}

function words(text: string): string[] {
  return tokenize(text).map((t) => t.norm)
}

function overlap(a: string, b: string): number {
  const wa = new Set(words(a))
  return words(b).filter((w) => wa.has(w)).length
}

function scriptureOf(blocks: BlockLike[]): {s: Scripture; index: number}[] {
  return blocks.flatMap((b, index) => {
    if (b.type !== 'scripture') return []
    const prev = blocks[index - 1]
    const leadInRef = prev?.type === 'point' ? (findReferenceIn(prev.text) ?? '') : ''
    return [{s: {text: b.text, reference: (b.reference ?? '').trim(), leadInRef}, index}]
  })
}

/** Pair her Scripture Blocks with the current ones: in order when the counts match, else by shared words. */
function pairBlocks<T extends {s: Scripture}>(original: Scripture[], current: T[]): [Scripture, T][] {
  if (original.length === current.length) return original.map((o, i) => [o, current[i]])
  const used = new Set<number>()
  const pairs: [Scripture, T][] = []
  for (const c of current) {
    let best = -1
    let bestScore = 0
    original.forEach((o, i) => {
      const score = used.has(i) ? 0 : overlap(o.text, c.s.text)
      if (score > bestScore) {
        best = i
        bestScore = score
      }
    })
    if (best >= 0) {
      used.add(best)
      pairs.push([original[best], c])
    }
  }
  return pairs
}

/** The changed stretch of wording, with a couple of words either side for context. */
function changedPhrase(from: string, to: string): {was: string; now: string} {
  const a = tokenize(from)
  const b = tokenize(to)
  let start = 0
  while (start < a.length && start < b.length && a[start].norm === b[start].norm) start++
  let endA = a.length
  let endB = b.length
  while (endA > start && endB > start && a[endA - 1].norm === b[endB - 1].norm) {
    endA--
    endB--
  }
  const lo = Math.max(0, start - 2)
  // Cut from the original text, so her punctuation survives ("in you, and that")
  const phrase = (source: string, t: typeof a, end: number) => {
    const hi = Math.min(t.length, Math.max(end, lo + 1) + 2)
    return `${lo > 0 ? '…' : ''}${source.slice(t[lo].start, t[hi - 1].end)}${hi < t.length ? '…' : ''}`
  }
  return {was: phrase(from, a, endA), now: phrase(to, b, endB)}
}

function snippet(text: string): string {
  const parts = text.trim().split(/\s+/)
  if (parts.length <= 7) return text.trim()
  return `${parts
    .slice(0, 7)
    .join(' ')
    .replace(/[\s.,;:…]+$/, '')}…`
}

const quote = (text: string) => `“${text}”`

function joinOr(items: string[]): string {
  return items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} or ${items[items.length - 1]}`
}

/** The block as it would read with every open (undismissed) fix applied, plus questions for the rest. */
function withOpenFixes(s: Scripture, check: BlockCheck | null | undefined): {s: Scripture; questions: Item[]} {
  let {text, reference} = s
  const questions: Item[] = []
  for (const f of check?.findings ?? []) {
    if (f.dismissed || f.kind === 'reference_format') continue
    if (f.fix?.reference) reference = f.fix.reference
    if (f.fix?.text) text = f.fix.text
    if (!f.fix && (f.candidates?.length ?? 0) > 1) {
      const ask = `this verse ${quote(snippet(s.text))} could be ${joinOr(f.candidates!.map((c) => c.reference))}. Which did you mean?`
      questions.push({kind: 'question', inline: `noticed ${ask}`, bullet: ask})
    }
    if (f.kind === 'not_found') {
      const ask = `couldn't find this verse ${quote(snippet(s.text))}. Which verse is it from?`
      questions.push({kind: 'question', inline: ask, bullet: `I ${ask}`})
    }
  }
  return {s: {...s, text, reference}, questions}
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

export function buildCorrectionNote(d: {
  rawInput: string | null
  blocks: BlockLike[]
  checks: (BlockCheck | null)[] // index-aligned with blocks
}): string | null {
  const current = scriptureOf(d.blocks)
  const sent = d.rawInput?.trim()
    ? scriptureOf(parseDevotional(d.rawInput).blocks).map((x) => x.s)
    : current.map((x) => x.s)
  const proposed = current.map((c) => withOpenFixes(c.s, d.checks[c.index]))

  const items: Item[] = []
  for (const [o, p] of pairBlocks(sent, proposed)) {
    const oldRef = o.reference || o.leadInRef
    const newRef = p.s.reference || p.s.leadInRef
    if (canonicalOrRaw(oldRef) !== canonicalOrRaw(newRef)) {
      const say = `this verse ${quote(snippet(p.s.text))} is ${newRef || 'unreferenced'}. ${
        oldRef ? `You have ${oldRef}.` : "You don't have a reference on it."
      }`
      items.push({kind: 'fix', inline: `noticed ${say}`, bullet: say})
    }
    if (words(o.text).join(' ') !== words(p.s.text).join(' ')) {
      const {was, now} = changedPhrase(o.text, p.s.text)
      const say = `this verse${newRef ? ` in ${newRef}` : ''} reads ${quote(now)}. You have ${quote(was)}.`
      items.push({kind: 'fix', inline: `noticed ${say}`, bullet: say})
    }
    items.push(...p.questions)
  }
  if (items.length === 0) return null

  // Her own style: "I was looking back at this one and noticed this verse “…” is Habakkuk 3:17-19.
  // You have Habakkuk 3:17-18. Is it okay to change and fix that?"
  const fixes = items.filter((i) => i.kind === 'fix').length
  const ask =
    fixes === 0 ? '' : fixes === 1 ? ' Is it okay to change and fix that?' : ' Is it okay to change and fix those?'
  if (items.length === 1) return `I was looking back at this one and ${items[0].inline}${ask}`
  const bullets = items.map((i) => `• ${capitalize(i.bullet)}`).join('\n')
  return `I was looking back at this one and noticed a few things:\n${bullets}${ask ? `\n${ask.trim()}` : ''}`
}
