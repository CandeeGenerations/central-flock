import Anthropic from '@anthropic-ai/sdk'
import {and, asc, desc, eq, inArray, like, or, sql} from 'drizzle-orm'
import {Router} from 'express'
import fs from 'fs'
import path from 'path'
import {fileURLToPath} from 'url'
import * as XLSX from 'xlsx'
import {YoutubeTranscript} from 'youtube-transcript'

import {db, schema} from '../db/index.js'
import {AI_MODELS} from '../lib/ai-models.js'
import {parseReference, referenceKeys} from '../lib/bible-reference.js'
import {asyncHandler, isUniqueConstraintError} from '../lib/route-helpers.js'
import {generateDevotionPassage} from '../services/devotion-generation.js'
import {importDevotions, parseSheetRows} from '../services/devotion-import.js'
import {parseDevotionImage} from '../services/devotion-ocr.js'

const anthropic = new Anthropic()

const __devotionsDir = path.dirname(fileURLToPath(import.meta.url))
const SCAN_IMAGES_DIR = path.join(__devotionsDir, '..', '..', 'data', 'scan-images')

export const devotionsRouter = Router()

export function cleanupOrphanedScanImages(): {deleted: number; kept: number} {
  if (!fs.existsSync(SCAN_IMAGES_DIR)) return {deleted: 0, kept: 0}

  const files = fs.readdirSync(SCAN_IMAGES_DIR)
  const drafts = db.select({imagePath: schema.scanDrafts.imagePath}).from(schema.scanDrafts).all()

  const activePaths = new Set(drafts.map((d) => d.imagePath).filter(Boolean))

  let deleted = 0
  let kept = 0
  for (const file of files) {
    const relativePath = `/data/scan-images/${file}`
    if (activePaths.has(relativePath)) {
      kept++
    } else {
      try {
        fs.unlinkSync(path.join(SCAN_IMAGES_DIR, file))
        deleted++
      } catch {
        /* ignore */
      }
    }
  }

  if (deleted > 0) console.log(`Cleaned up ${deleted} orphaned scan image(s)`)
  return {deleted, kept}
}

const TOGGLE_FIELDS = ['produced', 'rendered', 'youtube', 'facebookInstagram', 'podcast', 'flagged'] as const
type ToggleField = (typeof TOGGLE_FIELDS)[number]

// Returns ids of revisits that currently have unresolved chain audit issues
// (prior verse-matching devotions in the same lineage, not in the chain, not ignored).
function computeRevisitsWithChainIssues(): number[] {
  const all = db
    .select({
      id: schema.devotions.id,
      number: schema.devotions.number,
      date: schema.devotions.date,
      devotionType: schema.devotions.devotionType,
      bibleReference: schema.devotions.bibleReference,
      referencedDevotions: schema.devotions.referencedDevotions,
      chainIgnores: schema.devotions.chainIgnores,
    })
    .from(schema.devotions)
    .where(sql`${schema.devotions.bibleReference} IS NOT NULL`)
    .all()

  const parseChainRaw = (raw: string | null): number[] => {
    if (!raw) return []
    try {
      return JSON.parse(raw) as number[]
    } catch {
      return []
    }
  }
  const byNum = new Map(all.map((d) => [d.number, d]))
  const rootOriginalOf = (d: (typeof all)[number]): number | null => {
    if (d.devotionType !== 'revisit') return d.number
    const chain = parseChainRaw(d.referencedDevotions)
    return chain.length > 0 ? chain[chain.length - 1] : null
  }

  const verseIndex = new Map<string, {number: number; date: string; type: string}[]>()
  for (const d of all) {
    if (!d.bibleReference || d.devotionType === 'guest') continue
    const parsed = parseReference(d.bibleReference)
    const keys = new Set(parsed.flatMap((r) => referenceKeys(r)))
    for (const k of keys) {
      if (!verseIndex.has(k)) verseIndex.set(k, [])
      verseIndex.get(k)!.push({number: d.number, date: d.date, type: d.devotionType})
    }
  }

  const issueIds: number[] = []
  for (const d of all) {
    if (d.devotionType !== 'revisit' || !d.bibleReference) continue
    const parsed = parseReference(d.bibleReference)
    const keys = new Set(parsed.flatMap((r) => referenceKeys(r)))
    if (keys.size === 0) continue

    const chain = parseChainRaw(d.referencedDevotions)
    const currentOriginal = chain.length > 0 ? chain[chain.length - 1] : null
    const originalInChain = chain.some((n) => {
      const ancestor = byNum.get(n)
      return ancestor ? ancestor.devotionType !== 'revisit' : false
    })
    const chainSet = new Set(chain)
    const ignoreSet = new Set(parseChainRaw(d.chainIgnores))

    for (const k of keys) {
      const entries = verseIndex.get(k) || []
      let flagged = false
      for (const e of entries) {
        if (e.number === d.number) continue
        if (e.date > d.date) continue
        if (e.date === d.date && e.number >= d.number) continue
        if (chainSet.has(e.number)) continue
        if (ignoreSet.has(e.number)) continue
        if (currentOriginal != null) {
          const candidate = byNum.get(e.number)
          const cOriginal = candidate ? rootOriginalOf(candidate) : null
          if (cOriginal != null && cOriginal !== currentOriginal) continue
        }
        if (originalInChain && e.type !== 'revisit') continue
        flagged = true
        break
      }
      if (flagged) {
        issueIds.push(d.id)
        break
      }
    }
  }
  return issueIds
}

// GET /api/devotions/audit - Data quality report
devotionsRouter.get(
  '/audit',
  asyncHandler(async (_req, res) => {
    const all = db.select().from(schema.devotions).orderBy(asc(schema.devotions.number)).all()

    const numbers = new Set(all.map((d) => d.number))
    const minNum = all.length > 0 ? all[0].number : 0
    const maxNum = all.length > 0 ? all[all.length - 1].number : 0

    // Missing numbers in sequence
    const knownMissing = new Set([644, 645])
    const missingNumbers: number[] = []
    for (let i = 1; i <= maxNum; i++) {
      if (!numbers.has(i) && !knownMissing.has(i)) missingNumbers.push(i)
    }

    // Date gaps
    const dates = all.map((d) => d.date).sort()
    const missingDates: {after: string; before: string; days: number}[] = []
    for (let i = 1; i < dates.length; i++) {
      const prev = new Date(dates[i - 1] + 'T12:00:00')
      const curr = new Date(dates[i] + 'T12:00:00')
      const diffDays = Math.round((curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24))
      if (diffDays > 1) {
        missingDates.push({after: dates[i - 1], before: dates[i], days: diffDays - 1})
      }
    }

    // Duplicate dates
    const dateCounts = new Map<string, {id: number; number: number}[]>()
    for (const d of all) {
      if (!dateCounts.has(d.date)) dateCounts.set(d.date, [])
      dateCounts.get(d.date)!.push({id: d.id, number: d.number})
    }
    const duplicateDates = [...dateCounts.entries()]
      .filter(([, devos]) => devos.length > 1)
      .map(([date, devotions]) => ({date, devotions}))

    // Missing bible reference (exclude future empty ones)
    const today = new Date().toISOString().slice(0, 10)
    const noReference = all
      .filter((d) => !d.bibleReference && d.date <= today)
      .map((d) => ({
        id: d.id,
        number: d.number,
        date: d.date,
        devotionType: d.devotionType,
        guestSpeaker: d.guestSpeaker,
      }))

    // Guest devotions missing guest number
    const guestsNoNumber = all
      .filter((d) => d.devotionType === 'guest' && d.guestNumber == null)
      .map((d) => ({id: d.id, number: d.number, date: d.date, guestSpeaker: d.guestSpeaker}))

    // Guest devotions missing speaker
    const guestsNoSpeaker = all
      .filter((d) => d.devotionType === 'guest' && !d.guestSpeaker)
      .map((d) => ({id: d.id, number: d.number, date: d.date}))

    // Guest number sequence gaps per speaker
    const speakerGaps: {speaker: string; missing: number[]; duplicates: number[]; range: string}[] = []
    for (const speaker of ['Tyler', 'Gabe', 'Ed']) {
      const speakerDevos = all
        .filter((d) => d.guestSpeaker === speaker && d.guestNumber != null)
        .sort((a, b) => a.guestNumber! - b.guestNumber!)

      if (speakerDevos.length === 0) continue

      const nums = speakerDevos.map((d) => d.guestNumber!)
      const min = nums[0]
      const max = nums[nums.length - 1]
      const numSet = new Set(nums)
      const missing: number[] = []
      for (let i = min; i <= max; i++) {
        if (!numSet.has(i)) missing.push(i)
      }
      const dupes = [...new Set(nums.filter((n, i) => nums.indexOf(n) !== i))]

      speakerGaps.push({
        speaker,
        missing,
        duplicates: dupes,
        range: `#${min} - #${max} (${speakerDevos.length} devotions)`,
      })
    }

    // Duplicate scripture references (original, favorite, guest only — not revisits)
    const refMap = new Map<
      string,
      {
        id: number
        number: number
        date: string
        devotionType: string
        guestSpeaker: string | null
        bibleReference: string
      }[]
    >()
    for (const d of all) {
      if (!d.bibleReference || d.devotionType === 'revisit') continue
      const parsed = parseReference(d.bibleReference)
      for (const ref of parsed) {
        const keys = referenceKeys(ref)
        for (const key of keys) {
          if (!refMap.has(key)) refMap.set(key, [])
          refMap.get(key)!.push({
            id: d.id,
            number: d.number,
            date: d.date,
            devotionType: d.devotionType,
            guestSpeaker: d.guestSpeaker,
            bibleReference: d.bibleReference,
          })
        }
      }
    }
    const duplicateScriptures = [...refMap.entries()]
      .map(([reference, devos]) => {
        // Deduplicate same devotion appearing multiple times (from range expansion)
        const seen = new Set<number>()
        const unique = devos.filter((d) => {
          if (seen.has(d.id)) return false
          seen.add(d.id)
          return true
        })
        return {reference, count: unique.length, devotions: unique}
      })
      .filter((d) => d.count > 1)
      .sort((a, b) => b.count - a.count)

    // Broken revisit chains: revisits whose referencedDevotions doesn't include all
    // prior devotions (original + earlier revisits) sharing any verse key.
    // Index: verseKey -> list of {number, date} sorted by date.
    // Guest devotions are excluded — they're not part of the revisit chain model.
    const verseIndex = new Map<string, {number: number; date: string; type: string}[]>()
    for (const d of all) {
      if (!d.bibleReference || d.devotionType === 'guest') continue
      const parsed = parseReference(d.bibleReference)
      const keys = new Set(parsed.flatMap((r) => referenceKeys(r)))
      for (const k of keys) {
        if (!verseIndex.has(k)) verseIndex.set(k, [])
        verseIndex.get(k)!.push({number: d.number, date: d.date, type: d.devotionType})
      }
    }
    for (const arr of verseIndex.values()) arr.sort((a, b) => a.date.localeCompare(b.date))

    const brokenChains: {
      id: number
      number: number
      date: string
      bibleReference: string | null
      referencedDevotions: number[]
      missing: {number: number; date: string; type: string}[]
    }[] = []

    const byNum = new Map(all.map((d) => [d.number, d]))
    const parseChainRaw = (raw: string | null): number[] => {
      if (!raw) return []
      try {
        return JSON.parse(raw) as number[]
      } catch {
        return []
      }
    }
    const rootOriginalOfAudit = (d: (typeof all)[number]): number | null => {
      if (d.devotionType !== 'revisit') return d.number
      const chain = parseChainRaw(d.referencedDevotions)
      return chain.length > 0 ? chain[chain.length - 1] : null
    }

    for (const d of all) {
      if (d.devotionType !== 'revisit' || !d.bibleReference) continue
      const parsed = parseReference(d.bibleReference)
      const keys = new Set(parsed.flatMap((r) => referenceKeys(r)))
      if (keys.size === 0) continue

      const chain: number[] = parseChainRaw(d.referencedDevotions)
      const currentOriginal = chain.length > 0 ? chain[chain.length - 1] : null
      const originalInChain = chain.some((n) => {
        const ancestor = byNum.get(n)
        return ancestor ? ancestor.devotionType !== 'revisit' : false
      })

      // Gather all prior devotions (by date) that share any verse key.
      // Filter to the same lineage (matching root-original) and suppress extra originals
      // once an original is already in the chain.
      const priorMap = new Map<number, {number: number; date: string; type: string}>()
      for (const k of keys) {
        const entries = verseIndex.get(k) || []
        for (const e of entries) {
          if (e.number === d.number) continue
          if (e.date > d.date) continue
          if (e.date === d.date && e.number >= d.number) continue
          if (currentOriginal != null) {
            const candidate = byNum.get(e.number)
            const cOriginal = candidate ? rootOriginalOfAudit(candidate) : null
            if (cOriginal != null && cOriginal !== currentOriginal) continue
          }
          if (originalInChain && e.type !== 'revisit') continue
          priorMap.set(e.number, e)
        }
      }

      const ignores: number[] = (() => {
        try {
          return d.chainIgnores ? (JSON.parse(d.chainIgnores) as number[]) : []
        } catch {
          return []
        }
      })()
      const ignoreSet = new Set(ignores)
      const chainSet = new Set(chain)
      const missing = [...priorMap.values()].filter((e) => !chainSet.has(e.number) && !ignoreSet.has(e.number))
      if (missing.length > 0) {
        missing.sort((a, b) => a.date.localeCompare(b.date))
        brokenChains.push({
          id: d.id,
          number: d.number,
          date: d.date,
          bibleReference: d.bibleReference,
          referencedDevotions: chain,
          missing,
        })
      }
    }
    brokenChains.sort((a, b) => b.number - a.number)

    // Chain lineage issues: checks based on the topology of `referencedDevotions` alone,
    // independent of verse-reference text. Catches the cases where verses have typos /
    // subtle differences that the verse-key audit misses, but the chain still records
    // relationships correctly (or incorrectly).
    //
    // Three sub-checks per revisit:
    //   1. `root-not-found` — chain ends at a number that doesn't exist in the DB
    //   2. `root-is-revisit` — chain ends at a revisit instead of an original/guest
    //   3. `inconsistent-root` — an ancestor revisit in the chain points to a different root
    //   4. `missing-siblings` — another revisit sharing the same root original is earlier
    //      in time but not in this revisit's chain (and not explicitly ignored)
    type LineageIssueType = 'root-not-found' | 'root-is-revisit' | 'inconsistent-root' | 'missing-siblings'
    const chainLineageIssues: {
      id: number
      number: number
      date: string
      rootNumber: number | null
      issueType: LineageIssueType
      detail: string
      related: {number: number; date: string}[]
    }[] = []

    // Group revisits by their chain's root-original number (chain[last]).
    const byRoot = new Map<number, (typeof all)[number][]>()
    for (const d of all) {
      if (d.devotionType !== 'revisit') continue
      const chain = parseChainRaw(d.referencedDevotions)
      if (chain.length === 0) continue
      const root = chain[chain.length - 1]
      if (!byRoot.has(root)) byRoot.set(root, [])
      byRoot.get(root)!.push(d)
    }
    for (const arr of byRoot.values()) arr.sort((a, b) => a.date.localeCompare(b.date))

    for (const d of all) {
      if (d.devotionType !== 'revisit') continue
      const chain = parseChainRaw(d.referencedDevotions)
      if (chain.length === 0) continue
      const rootNum = chain[chain.length - 1]
      const root = byNum.get(rootNum)

      const ignoreSet: Set<number> = (() => {
        try {
          return new Set(d.chainIgnores ? (JSON.parse(d.chainIgnores) as number[]) : [])
        } catch {
          return new Set<number>()
        }
      })()

      if (!root) {
        chainLineageIssues.push({
          id: d.id,
          number: d.number,
          date: d.date,
          rootNumber: rootNum,
          issueType: 'root-not-found',
          detail: `Chain ends at #${rootNum}, which doesn't exist in the database.`,
          related: [],
        })
        continue
      }

      if (root.devotionType === 'revisit') {
        chainLineageIssues.push({
          id: d.id,
          number: d.number,
          date: d.date,
          rootNumber: rootNum,
          issueType: 'root-is-revisit',
          detail: `Chain ends at revisit #${rootNum} — should terminate at an original.`,
          related: [{number: rootNum, date: root.date}],
        })
        continue
      }

      const inconsistent: {number: number; date: string; otherRoot: number}[] = []
      for (let i = 0; i < chain.length - 1; i++) {
        const ancestor = byNum.get(chain[i])
        if (!ancestor || ancestor.devotionType !== 'revisit') continue
        const ancestorChain = parseChainRaw(ancestor.referencedDevotions)
        if (ancestorChain.length === 0) continue
        const otherRoot = ancestorChain[ancestorChain.length - 1]
        if (otherRoot !== rootNum) {
          inconsistent.push({number: ancestor.number, date: ancestor.date, otherRoot})
        }
      }
      if (inconsistent.length > 0) {
        chainLineageIssues.push({
          id: d.id,
          number: d.number,
          date: d.date,
          rootNumber: rootNum,
          issueType: 'inconsistent-root',
          detail: `Chain mixes lineages: ${inconsistent.map((x) => `#${x.number} → root #${x.otherRoot}`).join(', ')}`,
          related: inconsistent.map((x) => ({number: x.number, date: x.date})),
        })
        continue
      }

      const siblings = byRoot.get(rootNum) ?? []
      const chainSet = new Set(chain)
      const missing = siblings.filter(
        (s) => s.number !== d.number && s.date < d.date && !chainSet.has(s.number) && !ignoreSet.has(s.number),
      )
      if (missing.length > 0) {
        chainLineageIssues.push({
          id: d.id,
          number: d.number,
          date: d.date,
          rootNumber: rootNum,
          issueType: 'missing-siblings',
          detail: `Missing ${missing.length} earlier sibling${missing.length === 1 ? '' : 's'} sharing root original #${rootNum}`,
          related: missing.map((s) => ({number: s.number, date: s.date})),
        })
      }
    }
    chainLineageIssues.sort((a, b) => b.number - a.number)

    // Revisit/original verse mismatch: each revisit's bible reference should share
    // at least one verse key with the original at the end of its chain. If it doesn't,
    // either the chain was linked to the wrong original or the reference drifted.
    const mismatchedRevisits: {
      id: number
      number: number
      date: string
      bibleReference: string
      originalNumber: number
      originalDate: string
      originalBibleReference: string | null
    }[] = []
    for (const d of all) {
      if (d.devotionType !== 'revisit' || !d.bibleReference) continue
      const chain = parseChainRaw(d.referencedDevotions)
      if (chain.length === 0) continue
      const original = byNum.get(chain[chain.length - 1])
      if (!original || original.devotionType === 'revisit' || !original.bibleReference) continue

      const revisitKeys = new Set(parseReference(d.bibleReference).flatMap((r) => referenceKeys(r)))
      const originalKeys = new Set(parseReference(original.bibleReference).flatMap((r) => referenceKeys(r)))
      if (revisitKeys.size === 0 || originalKeys.size === 0) continue

      let overlap = false
      for (const k of revisitKeys) {
        if (originalKeys.has(k)) {
          overlap = true
          break
        }
      }
      if (!overlap) {
        mismatchedRevisits.push({
          id: d.id,
          number: d.number,
          date: d.date,
          bibleReference: d.bibleReference,
          originalNumber: original.number,
          originalDate: original.date,
          originalBibleReference: original.bibleReference,
        })
      }
    }
    mismatchedRevisits.sort((a, b) => b.number - a.number)

    const issueCount =
      missingNumbers.length +
      missingDates.length +
      duplicateDates.length +
      noReference.length +
      guestsNoNumber.length +
      guestsNoSpeaker.length +
      speakerGaps.reduce((sum, s) => sum + s.missing.length + s.duplicates.length, 0) +
      brokenChains.length +
      mismatchedRevisits.length +
      chainLineageIssues.length

    res.json({
      missingNumbers,
      missingDates,
      duplicateDates,
      noReference,
      guestsNoNumber,
      guestsNoSpeaker,
      speakerGaps,
      duplicateScriptures,
      brokenChains,
      mismatchedRevisits,
      chainLineageIssues,
      totalDevotions: all.length,
      numberRange: {min: minNum, max: maxNum},
      issueCount,
    })
  }),
)

// GET /api/devotions/stats - Dashboard statistics
devotionsRouter.get(
  '/stats',
  asyncHandler(async (_req, res) => {
    const total = db
      .select({count: sql<number>`count(*)`})
      .from(schema.devotions)
      .get()!.count

    const byType = db
      .select({
        type: schema.devotions.devotionType,
        count: sql<number>`count(*)`,
      })
      .from(schema.devotions)
      .groupBy(schema.devotions.devotionType)
      .all()

    const bySpeaker = db
      .select({
        speaker: schema.devotions.guestSpeaker,
        count: sql<number>`count(*)`,
      })
      .from(schema.devotions)
      .where(eq(schema.devotions.devotionType, 'guest'))
      .groupBy(schema.devotions.guestSpeaker)
      .all()

    // Completion rate window: from the first of the current month onward.
    // Past devotions are considered "shipped" and don't affect the rate; this-month-and-future
    // shows in-flight progress without letting old completed backlog dilute it.
    const now = new Date()
    const windowStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`

    const completionRates = db
      .select({
        total: sql<number>`count(*)`,
        produced: sql<number>`sum(case when ${schema.devotions.produced} = 1 then 1 else 0 end)`,
        rendered: sql<number>`sum(case when ${schema.devotions.rendered} = 1 then 1 else 0 end)`,
        youtube: sql<number>`sum(case when ${schema.devotions.youtube} = 1 then 1 else 0 end)`,
        facebookInstagram: sql<number>`sum(case when ${schema.devotions.facebookInstagram} = 1 then 1 else 0 end)`,
        podcast: sql<number>`sum(case when ${schema.devotions.podcast} = 1 then 1 else 0 end)`,
      })
      .from(schema.devotions)
      .where(sql`${schema.devotions.date} >= ${windowStart}`)
      .get()!

    const byYear = db
      .select({
        year: sql<string>`substr(${schema.devotions.date}, 1, 4)`,
        count: sql<number>`count(*)`,
      })
      .from(schema.devotions)
      .groupBy(sql`substr(${schema.devotions.date}, 1, 4)`)
      .orderBy(asc(sql`substr(${schema.devotions.date}, 1, 4)`))
      .all()

    const latestNumber =
      db
        .select({max: sql<number>`max(${schema.devotions.number})`})
        .from(schema.devotions)
        .get()?.max || 0

    // Next-up incomplete devotions: sort by date ascending from window start,
    // so the soonest upcoming work appears first.
    const recentIncomplete = db
      .select()
      .from(schema.devotions)
      .where(
        and(
          sql`${schema.devotions.date} >= ${windowStart}`,
          or(
            eq(schema.devotions.produced, false),
            eq(schema.devotions.rendered, false),
            eq(schema.devotions.youtube, false),
            eq(schema.devotions.facebookInstagram, false),
            eq(schema.devotions.podcast, false),
          ),
        ),
      )
      .orderBy(asc(schema.devotions.date))
      .limit(10)
      .all()

    const windowTotal = completionRates.total
    res.json({
      total,
      byType,
      bySpeaker,
      completionRates: {
        produced: windowTotal > 0 ? Math.round((completionRates.produced / windowTotal) * 100) : 0,
        rendered: windowTotal > 0 ? Math.round((completionRates.rendered / windowTotal) * 100) : 0,
        youtube: windowTotal > 0 ? Math.round((completionRates.youtube / windowTotal) * 100) : 0,
        facebookInstagram: windowTotal > 0 ? Math.round((completionRates.facebookInstagram / windowTotal) * 100) : 0,
        podcast: windowTotal > 0 ? Math.round((completionRates.podcast / windowTotal) * 100) : 0,
        windowStart,
        windowTotal,
      },
      byYear,
      latestNumber,
      recentIncomplete,
    })
  }),
)

// GET /api/devotions/stats/scriptures - Most used scriptures (parsed + normalized)
devotionsRouter.get(
  '/stats/scriptures',
  asyncHandler(async (req, res) => {
    const {search, limit = '50'} = req.query

    const all = db
      .select()
      .from(schema.devotions)
      .where(
        and(sql`${schema.devotions.bibleReference} IS NOT NULL`, sql`${schema.devotions.devotionType} != 'revisit'`),
      )
      .all()

    const refMap = new Map<string, Set<number>>()
    for (const d of all) {
      if (!d.bibleReference) continue
      const parsed = parseReference(d.bibleReference)
      for (const ref of parsed) {
        const keys = referenceKeys(ref)
        for (const key of keys) {
          if (!refMap.has(key)) refMap.set(key, new Set())
          refMap.get(key)!.add(d.id)
        }
      }
    }

    let results = [...refMap.entries()]
      .map(([reference, ids]) => ({reference, count: ids.size}))
      .filter((r) => r.count > 1)
      .sort((a, b) => b.count - a.count)

    if (search && typeof search === 'string') {
      const s = search.toLowerCase()
      results = results.filter((r) => r.reference.toLowerCase().includes(s))
    }

    res.json(results.slice(0, Number(limit)))
  }),
)

// GET /api/devotions/scriptures/duplicates - All duplicate scripture references
devotionsRouter.get(
  '/scriptures/duplicates',
  asyncHandler(async (_req, res) => {
    const all = db
      .select()
      .from(schema.devotions)
      .where(
        and(sql`${schema.devotions.bibleReference} IS NOT NULL`, sql`${schema.devotions.devotionType} != 'revisit'`),
      )
      .orderBy(asc(schema.devotions.number))
      .all()

    const refMap = new Map<
      string,
      {
        id: number
        number: number
        date: string
        devotionType: string
        guestSpeaker: string | null
        bibleReference: string
      }[]
    >()
    for (const d of all) {
      if (!d.bibleReference) continue
      const parsed = parseReference(d.bibleReference)
      for (const ref of parsed) {
        const keys = referenceKeys(ref)
        for (const key of keys) {
          if (!refMap.has(key)) refMap.set(key, [])
          const group = refMap.get(key)!
          if (!group.some((e) => e.id === d.id)) {
            group.push({
              id: d.id,
              number: d.number,
              date: d.date,
              devotionType: d.devotionType,
              guestSpeaker: d.guestSpeaker,
              bibleReference: d.bibleReference,
            })
          }
        }
      }
    }

    const results = [...refMap.entries()]
      .filter(([, devos]) => devos.length > 1)
      .map(([reference, devotions]) => ({reference, count: devotions.length, devotions}))
      .sort((a, b) => b.count - a.count)

    res.json(results)
  }),
)

// GET /api/devotions/by-numbers?numbers=1,2,3 - Fetch multiple devotions by their number
devotionsRouter.get(
  '/by-numbers',
  asyncHandler(async (req, res) => {
    const {numbers} = req.query
    if (!numbers || typeof numbers !== 'string') {
      res.json([])
      return
    }
    const nums = numbers
      .split(',')
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n) && n > 0)
    if (nums.length === 0) {
      res.json([])
      return
    }
    const result = db.select().from(schema.devotions).where(inArray(schema.devotions.number, nums)).all()
    res.json(result)
  }),
)

// GET /api/devotions/scriptures/lookup - Search for verse usage with parsed matching
devotionsRouter.get(
  '/scriptures/lookup',
  asyncHandler(async (req, res) => {
    const {search, includeRevisits} = req.query
    if (!search || typeof search !== 'string' || search.length < 2) {
      res.json([])
      return
    }

    const includeRev = includeRevisits === 'true'

    const all = db
      .select()
      .from(schema.devotions)
      .where(
        and(
          sql`${schema.devotions.bibleReference} IS NOT NULL`,
          ...(includeRev ? [] : [sql`${schema.devotions.devotionType} != 'revisit'`]),
        ),
      )
      .orderBy(asc(schema.devotions.number))
      .all()

    // Parse the search term into reference keys
    const searchRefs = parseReference(search)
    const searchKeys = new Set(searchRefs.flatMap((r) => referenceKeys(r)))

    // Also do a simple text match as fallback
    const searchLower = search.toLowerCase()

    // For each devotion, compute its "rootOriginal" = last entry of chain for revisits,
    // else its own number. Used by callers to group by chain lineage.
    const rootOriginalOf = (d: (typeof all)[number]): number | null => {
      if (d.devotionType !== 'revisit') return d.number
      if (!d.referencedDevotions) return null
      try {
        const chain = JSON.parse(d.referencedDevotions) as number[]
        return chain.length > 0 ? chain[chain.length - 1] : null
      } catch {
        return null
      }
    }

    // Build matches: group by normalized verse key
    const groups = new Map<
      string,
      {
        id: number
        number: number
        date: string
        devotionType: string
        guestSpeaker: string | null
        bibleReference: string
        originalNumber: number | null
      }[]
    >()

    for (const d of all) {
      if (!d.bibleReference) continue

      const refs = parseReference(d.bibleReference)
      const devoKeys = refs.flatMap((r) => referenceKeys(r))
      const matchedKeys = devoKeys.filter((k) => searchKeys.has(k))

      // Also check text match
      const textMatch = d.bibleReference.toLowerCase().includes(searchLower)

      if (matchedKeys.length > 0 || textMatch) {
        const groupKey = matchedKeys.length > 0 ? matchedKeys[0] : d.bibleReference
        if (!groups.has(groupKey)) groups.set(groupKey, [])
        const entry = {
          id: d.id,
          number: d.number,
          date: d.date,
          devotionType: d.devotionType,
          guestSpeaker: d.guestSpeaker,
          bibleReference: d.bibleReference,
          originalNumber: rootOriginalOf(d),
        }
        // Avoid duplicate entries in the same group
        const existing = groups.get(groupKey)!
        if (!existing.some((e) => e.id === d.id)) {
          existing.push(entry)
        }
      }
    }

    const results = [...groups.entries()]
      .map(([reference, devotions]) => ({reference, count: devotions.length, devotions}))
      .sort((a, b) => b.count - a.count)

    res.json(results)
  }),
)

// GET /api/devotions/stats/speakers - Speaker breakdown
devotionsRouter.get(
  '/stats/speakers',
  asyncHandler(async (_req, res) => {
    const speakers = db
      .select({
        speaker: sql<string>`COALESCE(${schema.devotions.guestSpeaker}, 'Main')`,
        count: sql<number>`count(*)`,
      })
      .from(schema.devotions)
      .groupBy(sql`COALESCE(${schema.devotions.guestSpeaker}, 'Main')`)
      .orderBy(desc(sql`count(*)`))
      .all()

    // Per-year breakdown
    const byYear = db
      .select({
        speaker: sql<string>`COALESCE(${schema.devotions.guestSpeaker}, 'Main')`,
        year: sql<string>`substr(${schema.devotions.date}, 1, 4)`,
        count: sql<number>`count(*)`,
      })
      .from(schema.devotions)
      .groupBy(sql`COALESCE(${schema.devotions.guestSpeaker}, 'Main')`, sql`substr(${schema.devotions.date}, 1, 4)`)
      .orderBy(asc(sql`substr(${schema.devotions.date}, 1, 4)`))
      .all()

    res.json({speakers, byYear})
  }),
)

// GET /api/devotions/months - Distinct months with data
devotionsRouter.get(
  '/months',
  asyncHandler(async (_req, res) => {
    const months = db
      .select({month: sql<string>`substr(${schema.devotions.date}, 1, 7)`})
      .from(schema.devotions)
      .groupBy(sql`substr(${schema.devotions.date}, 1, 7)`)
      .orderBy(desc(sql`substr(${schema.devotions.date}, 1, 7)`))
      .all()

    res.json(months.map((m) => m.month))
  }),
)

// GET /api/devotions/next-number - Next sequential number
devotionsRouter.get(
  '/next-number',
  asyncHandler(async (_req, res) => {
    const result = db
      .select({max: sql<number>`max(${schema.devotions.number})`})
      .from(schema.devotions)
      .get()

    res.json({next: (result?.max || 0) + 1})
  }),
)

// GET /api/devotions - List with pagination, filtering, sorting
devotionsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const {
      search,
      dateFrom,
      dateTo,
      months,
      devotionType,
      guestSpeaker,
      status,
      pipelineMissing,
      flagged,
      chainIssues,
      page = '1',
      limit = '50',
      sort = 'date',
      sortDir = 'desc',
    } = req.query
    const offset = (Number(page) - 1) * Number(limit)
    const conditions = []

    if (search && typeof search === 'string') {
      const searchNum = search.replace(/^#/, '')
      const isNumber = /^\d+$/.test(searchNum)
      conditions.push(
        or(
          like(schema.devotions.songName, `%${search}%`),
          like(schema.devotions.bibleReference, `%${search}%`),
          like(schema.devotions.notes, `%${search}%`),
          like(schema.devotions.title, `%${search}%`),
          ...(isNumber ? [eq(schema.devotions.number, Number(searchNum))] : []),
        ),
      )
    }

    if (dateFrom && typeof dateFrom === 'string') {
      conditions.push(sql`${schema.devotions.date} >= ${dateFrom}`)
    }
    if (dateTo && typeof dateTo === 'string') {
      conditions.push(sql`${schema.devotions.date} <= ${dateTo}`)
    }
    if (months && typeof months === 'string') {
      const monthList = months
        .split(',')
        .map((m) => m.trim())
        .filter((m) => /^\d{4}-\d{2}$/.test(m))
      if (monthList.length > 0) {
        const monthConditions = monthList.map((ym) => {
          const [y, m] = ym.split('-').map(Number)
          const lastDay = new Date(y, m, 0).getDate()
          const from = `${ym}-01`
          const to = `${ym}-${String(lastDay).padStart(2, '0')}`
          return and(sql`${schema.devotions.date} >= ${from}`, sql`${schema.devotions.date} <= ${to}`)
        })
        const monthOr = monthConditions.length === 1 ? monthConditions[0] : or(...monthConditions)
        if (monthOr) conditions.push(monthOr)
      }
    }
    if (devotionType && typeof devotionType === 'string') {
      const types = devotionType
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean) as ('original' | 'favorite' | 'guest' | 'revisit')[]
      if (types.length === 1) {
        conditions.push(eq(schema.devotions.devotionType, types[0]))
      } else if (types.length > 1) {
        conditions.push(inArray(schema.devotions.devotionType, types))
      }
    }
    if (guestSpeaker && typeof guestSpeaker === 'string') {
      const speakers = guestSpeaker
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
      if (speakers.length === 1) {
        conditions.push(eq(schema.devotions.guestSpeaker, speakers[0]))
      } else if (speakers.length > 1) {
        conditions.push(inArray(schema.devotions.guestSpeaker, speakers))
      }
    }
    if (status && typeof status === 'string') {
      if (status === 'complete') {
        conditions.push(
          and(
            eq(schema.devotions.produced, true),
            eq(schema.devotions.rendered, true),
            eq(schema.devotions.youtube, true),
            eq(schema.devotions.facebookInstagram, true),
            eq(schema.devotions.podcast, true),
          ),
        )
      } else if (status === 'incomplete') {
        conditions.push(
          or(
            eq(schema.devotions.produced, false),
            eq(schema.devotions.rendered, false),
            eq(schema.devotions.youtube, false),
            eq(schema.devotions.facebookInstagram, false),
            eq(schema.devotions.podcast, false),
          ),
        )
      }
    }

    if (pipelineMissing && typeof pipelineMissing === 'string') {
      const allowed = ['produced', 'rendered', 'youtube', 'facebookInstagram', 'podcast'] as const
      const steps = pipelineMissing
        .split(',')
        .map((s) => s.trim())
        .filter((s): s is (typeof allowed)[number] => (allowed as readonly string[]).includes(s))
      if (steps.length > 0) {
        for (const s of steps) conditions.push(eq(schema.devotions[s], false))
      }
    }

    if (flagged === 'true') {
      conditions.push(eq(schema.devotions.flagged, true))
    }

    if (chainIssues === 'true') {
      const issueIds = computeRevisitsWithChainIssues()
      conditions.push(issueIds.length > 0 ? inArray(schema.devotions.id, issueIds) : sql`1 = 0`)
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined

    const getOrderBy = () => {
      const dir = sortDir === 'asc' ? asc : desc
      switch (sort) {
        case 'number':
          return [dir(schema.devotions.number)]
        case 'date':
          return [dir(schema.devotions.date)]
        case 'devotionType':
          return [dir(schema.devotions.devotionType)]
        default:
          return [dir(schema.devotions.date)]
      }
    }

    const [data, countResult] = await Promise.all([
      db
        .select()
        .from(schema.devotions)
        .where(where)
        .limit(Number(limit))
        .offset(offset)
        .orderBy(...getOrderBy()),
      db
        .select({count: sql<number>`count(*)`})
        .from(schema.devotions)
        .where(where),
    ])

    // Annotate each revisit in the page with chainAuditStatus: 'ok' | 'issues' | null.
    // Build a verse-key index once over the full table (cheap — a few thousand rows).
    const pageHasRevisits = data.some((d) => d.devotionType === 'revisit')
    const annotated = !pageHasRevisits
      ? data.map((d) => ({...d, chainAuditStatus: null as 'ok' | 'issues' | null}))
      : (() => {
          const all = db
            .select({
              id: schema.devotions.id,
              number: schema.devotions.number,
              date: schema.devotions.date,
              devotionType: schema.devotions.devotionType,
              bibleReference: schema.devotions.bibleReference,
              referencedDevotions: schema.devotions.referencedDevotions,
            })
            .from(schema.devotions)
            .where(sql`${schema.devotions.bibleReference} IS NOT NULL`)
            .all()

          const parseChainRaw = (raw: string | null): number[] => {
            if (!raw) return []
            try {
              return JSON.parse(raw) as number[]
            } catch {
              return []
            }
          }
          const byNum = new Map(all.map((d) => [d.number, d]))
          const rootOriginalOf = (d: (typeof all)[number]): number | null => {
            if (d.devotionType !== 'revisit') return d.number
            const chain = parseChainRaw(d.referencedDevotions)
            return chain.length > 0 ? chain[chain.length - 1] : null
          }

          // Verse index: key -> list of {number, date, type}, excluding guests.
          const verseIndex = new Map<string, {number: number; date: string; type: string}[]>()
          for (const d of all) {
            if (!d.bibleReference || d.devotionType === 'guest') continue
            const parsed = parseReference(d.bibleReference)
            const keys = new Set(parsed.flatMap((r) => referenceKeys(r)))
            for (const k of keys) {
              if (!verseIndex.has(k)) verseIndex.set(k, [])
              verseIndex.get(k)!.push({number: d.number, date: d.date, type: d.devotionType})
            }
          }

          return data.map((d) => {
            if (d.devotionType !== 'revisit' || !d.bibleReference) {
              return {...d, chainAuditStatus: null as 'ok' | 'issues' | null}
            }
            const parsed = parseReference(d.bibleReference)
            const keys = new Set(parsed.flatMap((r) => referenceKeys(r)))
            if (keys.size === 0) return {...d, chainAuditStatus: 'ok' as 'ok' | 'issues' | null}

            const chain = parseChainRaw(d.referencedDevotions)
            const currentOriginal = chain.length > 0 ? chain[chain.length - 1] : null
            const originalInChain = chain.some((n) => {
              const ancestor = byNum.get(n)
              return ancestor ? ancestor.devotionType !== 'revisit' : false
            })
            const chainSet = new Set(chain)
            const ignores: number[] = (() => {
              try {
                return d.chainIgnores ? (JSON.parse(d.chainIgnores) as number[]) : []
              } catch {
                return []
              }
            })()
            const ignoreSet = new Set(ignores)

            let hasIssue = false
            outer: for (const k of keys) {
              const entries = verseIndex.get(k) || []
              for (const e of entries) {
                if (e.number === d.number) continue
                if (e.date > d.date) continue
                if (e.date === d.date && e.number >= d.number) continue
                if (chainSet.has(e.number)) continue
                if (ignoreSet.has(e.number)) continue
                if (currentOriginal != null) {
                  const candidate = byNum.get(e.number)
                  const cOriginal = candidate ? rootOriginalOf(candidate) : null
                  if (cOriginal != null && cOriginal !== currentOriginal) continue
                }
                if (originalInChain && e.type !== 'revisit') continue
                hasIssue = true
                break outer
              }
            }

            return {...d, chainAuditStatus: (hasIssue ? 'issues' : 'ok') as 'ok' | 'issues' | null}
          })
        })()

    res.json({
      data: annotated,
      total: countResult[0].count,
      page: Number(page),
      limit: Number(limit),
    })
  }),
)

// GET /api/devotions/scan-drafts - List saved scan drafts
devotionsRouter.get(
  '/scan-drafts',
  asyncHandler(async (_req, res) => {
    const drafts = db
      .select({
        id: schema.scanDrafts.id,
        month: schema.scanDrafts.month,
        year: schema.scanDrafts.year,
        createdAt: schema.scanDrafts.createdAt,
        count: sql<number>`json_array_length(json_extract(${schema.scanDrafts.data}, '$.devotions'))`,
      })
      .from(schema.scanDrafts)
      .orderBy(desc(schema.scanDrafts.createdAt))
      .all()

    res.json(drafts)
  }),
)

// GET /api/devotions/scan-drafts/:id - Get a saved scan draft
devotionsRouter.get(
  '/scan-drafts/:id',
  asyncHandler(async (req, res) => {
    const draft = db
      .select()
      .from(schema.scanDrafts)
      .where(eq(schema.scanDrafts.id, Number(req.params.id)))
      .get()

    if (!draft) {
      res.status(404).json({error: 'Draft not found'})
      return
    }
    res.json({...draft, data: JSON.parse(draft.data)})
  }),
)

// POST /api/devotions/scan-drafts - Save a scan draft
devotionsRouter.post(
  '/scan-drafts',
  asyncHandler(async (req, res) => {
    const {month, year, devotions, image} = req.body

    let imagePath: string | null = null
    if (image) {
      fs.mkdirSync(SCAN_IMAGES_DIR, {recursive: true})
      const filename = `scan-${Date.now()}.jpg`
      imagePath = path.join(SCAN_IMAGES_DIR, filename)
      // Strip data URL prefix if present
      const base64 = image.includes(',') ? image.split(',')[1] : image
      fs.writeFileSync(imagePath, Buffer.from(base64, 'base64'))
      imagePath = `/data/scan-images/${filename}`
    }

    const result = db
      .insert(schema.scanDrafts)
      .values({
        month,
        year,
        data: JSON.stringify({devotions}),
        imagePath,
      })
      .returning()
      .get()

    res.status(201).json(result)
  }),
)

// PUT /api/devotions/scan-drafts/:id - Update a scan draft
devotionsRouter.put(
  '/scan-drafts/:id',
  asyncHandler(async (req, res) => {
    const {month, year, devotions, image} = req.body
    const id = Number(req.params.id)

    // Handle image: if new image provided, save it and remove old one
    let imagePath: string | undefined
    if (image) {
      const existing = db
        .select({imagePath: schema.scanDrafts.imagePath})
        .from(schema.scanDrafts)
        .where(eq(schema.scanDrafts.id, id))
        .get()

      if (existing?.imagePath) {
        const oldPath = path.join(__devotionsDir, '..', '..', existing.imagePath)
        try {
          fs.unlinkSync(oldPath)
        } catch {
          /* ignore */
        }
      }

      fs.mkdirSync(SCAN_IMAGES_DIR, {recursive: true})
      const filename = `scan-${Date.now()}.jpg`
      const fullPath = path.join(SCAN_IMAGES_DIR, filename)
      const base64 = image.includes(',') ? image.split(',')[1] : image
      fs.writeFileSync(fullPath, Buffer.from(base64, 'base64'))
      imagePath = `/data/scan-images/${filename}`
    }

    const updates: Record<string, unknown> = {
      month,
      year,
      data: JSON.stringify({devotions}),
    }
    if (imagePath) updates.imagePath = imagePath

    db.update(schema.scanDrafts).set(updates).where(eq(schema.scanDrafts.id, id)).run()

    res.json({id})
  }),
)

// DELETE /api/devotions/scan-drafts/:id - Delete a scan draft
devotionsRouter.delete(
  '/scan-drafts/:id',
  asyncHandler(async (req, res) => {
    const draft = db
      .select({imagePath: schema.scanDrafts.imagePath})
      .from(schema.scanDrafts)
      .where(eq(schema.scanDrafts.id, Number(req.params.id)))
      .get()

    if (draft?.imagePath) {
      const fullPath = path.join(__devotionsDir, '..', '..', draft.imagePath)
      try {
        fs.unlinkSync(fullPath)
      } catch {
        /* file may not exist */
      }
    }

    db.delete(schema.scanDrafts)
      .where(eq(schema.scanDrafts.id, Number(req.params.id)))
      .run()
    res.json({success: true})
  }),
)

// POST /api/devotions/scan-drafts/cleanup - Remove orphaned scan images
devotionsRouter.post(
  '/scan-drafts/cleanup',
  asyncHandler(async (_req, res) => {
    const cleaned = cleanupOrphanedScanImages()
    res.json(cleaned)
  }),
)

// POST /api/devotions/generate-passage - Generate one passage on demand
devotionsRouter.post(
  '/generate-passage',
  asyncHandler(async (_req, res) => {
    const passages = await generateDevotionPassage(1)
    res.json(passages[0])
  }),
)

// POST /api/devotions/pool/generate - Batch generate N passages into pool
devotionsRouter.post(
  '/pool/generate',
  asyncHandler(async (req, res) => {
    const count = Math.min(Math.max(Number(req.body.count) || 1, 1), 20)
    const passages = await generateDevotionPassage(count)

    for (const p of passages) {
      db.insert(schema.generatedPassages)
        .values({
          title: p.title,
          bibleReference: p.bibleReference,
          talkingPoints: p.talkingPoints,
        })
        .run()
    }

    res.json({generated: passages.length, passages})
  }),
)

// GET /api/devotions/pool - List pool passages
devotionsRouter.get(
  '/pool',
  asyncHandler(async (req, res) => {
    const usedFilter = req.query.used
    const limit = Number(req.query.limit) || 100

    let query = db
      .select()
      .from(schema.generatedPassages)
      .orderBy(desc(schema.generatedPassages.createdAt))
      .limit(limit)

    if (usedFilter === 'true') {
      query = query.where(eq(schema.generatedPassages.used, true)) as typeof query
    } else if (usedFilter === 'false') {
      query = query.where(eq(schema.generatedPassages.used, false)) as typeof query
    }

    const rows = query.all()

    // Enrich with scripture usage counts
    const uniqueRefs = [...new Set(rows.map((r) => r.bibleReference).filter(Boolean))]
    const usageCounts = new Map<string, number>()

    if (uniqueRefs.length > 0) {
      const allDevotions = db
        .select({bibleReference: schema.devotions.bibleReference})
        .from(schema.devotions)
        .where(
          and(sql`${schema.devotions.bibleReference} IS NOT NULL`, sql`${schema.devotions.devotionType} != 'revisit'`),
        )
        .all()

      for (const ref of uniqueRefs) {
        const refParsed = parseReference(ref)
        const refKeys = new Set(refParsed.flatMap((r) => referenceKeys(r)))
        let count = 0
        for (const d of allDevotions) {
          if (!d.bibleReference) continue
          const dParsed = parseReference(d.bibleReference)
          const dKeys = dParsed.flatMap((r) => referenceKeys(r))
          if (dKeys.some((k) => refKeys.has(k))) count++
        }
        usageCounts.set(ref, count)
      }
    }

    const enriched = rows.map((r) => ({
      ...r,
      scriptureUsageCount: usageCounts.get(r.bibleReference) ?? 0,
    }))

    res.json(enriched)
  }),
)

// POST /api/devotions/pool/assign - Assign pool passage to a devotion
devotionsRouter.post(
  '/pool/assign',
  asyncHandler(async (req, res) => {
    const {passageId, devotionId} = req.body as {passageId: number; devotionId: number}

    const passage = db.select().from(schema.generatedPassages).where(eq(schema.generatedPassages.id, passageId)).get()

    if (!passage) {
      res.status(404).json({error: 'Passage not found'})
      return
    }

    // Update devotion with passage content
    db.update(schema.devotions)
      .set({
        title: passage.title,
        bibleReference: passage.bibleReference,
        talkingPoints: passage.talkingPoints,
        ...(passage.subcode ? {subcode: passage.subcode} : {}),
        updatedAt: sql`datetime('now')`,
      })
      .where(eq(schema.devotions.id, devotionId))
      .run()

    // Mark passage as used
    db.update(schema.generatedPassages)
      .set({
        used: true,
        devotionId,
        usedAt: sql`datetime('now')`,
      })
      .where(eq(schema.generatedPassages.id, passageId))
      .run()

    const updatedPassage = db
      .select()
      .from(schema.generatedPassages)
      .where(eq(schema.generatedPassages.id, passageId))
      .get()

    const updatedDevotion = db.select().from(schema.devotions).where(eq(schema.devotions.id, devotionId)).get()

    res.json({passage: updatedPassage, devotion: updatedDevotion})
  }),
)

// POST /api/devotions/pool/pull-for-scan - Pull passages from pool for scan auto-assign
devotionsRouter.post(
  '/pool/pull-for-scan',
  asyncHandler(async (req, res) => {
    const count = Math.min(Math.max(Number(req.body.count) || 1, 1), 30)

    // Pull available passages from pool
    const available = db
      .select()
      .from(schema.generatedPassages)
      .where(eq(schema.generatedPassages.used, false))
      .orderBy(asc(schema.generatedPassages.createdAt))
      .limit(count)
      .all()

    const fromPool = available.map((p) => ({
      id: p.id,
      title: p.title,
      bibleReference: p.bibleReference,
      talkingPoints: p.talkingPoints,
      subcode: p.subcode,
    }))

    // If not enough in pool, generate the remainder
    const shortage = count - fromPool.length
    const generated: typeof fromPool = []
    if (shortage > 0) {
      const newPassages = await generateDevotionPassage(shortage)
      for (const p of newPassages) {
        const inserted = db
          .insert(schema.generatedPassages)
          .values({
            title: p.title,
            bibleReference: p.bibleReference,
            talkingPoints: p.talkingPoints,
          })
          .returning()
          .get()
        generated.push({
          id: inserted.id,
          title: inserted.title,
          bibleReference: inserted.bibleReference,
          talkingPoints: inserted.talkingPoints,
          subcode: inserted.subcode,
        })
      }
    }

    const passages = [...fromPool, ...generated]
    res.json({passages, fromPool: fromPool.length, generated: generated.length})
  }),
)

// PUT /api/devotions/pool/:id - Update a pool passage
devotionsRouter.put(
  '/pool/:id',
  asyncHandler(async (req, res) => {
    const passage = db
      .select()
      .from(schema.generatedPassages)
      .where(eq(schema.generatedPassages.id, Number(req.params.id)))
      .get()

    if (!passage) {
      res.status(404).json({error: 'Passage not found'})
      return
    }

    const result = db
      .update(schema.generatedPassages)
      .set({
        title: req.body.title ?? passage.title,
        bibleReference: req.body.bibleReference ?? passage.bibleReference,
        talkingPoints: req.body.talkingPoints ?? passage.talkingPoints,
        subcode: req.body.subcode !== undefined ? req.body.subcode || null : passage.subcode,
        recorded: req.body.recorded ?? passage.recorded,
      })
      .where(eq(schema.generatedPassages.id, passage.id))
      .returning()
      .get()

    res.json(result)
  }),
)

// DELETE /api/devotions/pool/:id - Delete an unused pool passage
devotionsRouter.delete(
  '/pool/:id',
  asyncHandler(async (req, res) => {
    const passage = db
      .select()
      .from(schema.generatedPassages)
      .where(eq(schema.generatedPassages.id, Number(req.params.id)))
      .get()

    if (!passage) {
      res.status(404).json({error: 'Passage not found'})
      return
    }
    if (passage.used) {
      res.status(409).json({error: 'Cannot delete a used passage'})
      return
    }

    db.delete(schema.generatedPassages).where(eq(schema.generatedPassages.id, passage.id)).run()

    res.json({success: true})
  }),
)

// GET /api/devotions/:id/chain-audit - Compute expected revisit chain based on verse overlap
devotionsRouter.get(
  '/:id/chain-audit',
  asyncHandler(async (req, res) => {
    const devotion = db
      .select()
      .from(schema.devotions)
      .where(eq(schema.devotions.id, Number(req.params.id)))
      .get()

    if (!devotion) {
      res.status(404).json({error: 'Devotion not found'})
      return
    }

    if (devotion.devotionType !== 'revisit' || !devotion.bibleReference) {
      res.json({currentChain: [], proposedChain: [], missing: [], ignored: []})
      return
    }

    const parsed = parseReference(devotion.bibleReference)
    const keys = new Set(parsed.flatMap((r) => referenceKeys(r)))
    if (keys.size === 0) {
      res.json({currentChain: [], proposedChain: [], missing: [], ignored: []})
      return
    }

    const currentChain: number[] = (() => {
      try {
        return devotion.referencedDevotions ? (JSON.parse(devotion.referencedDevotions) as number[]) : []
      } catch {
        return []
      }
    })()
    // The current devotion's "root original" — the oldest devo in its chain.
    // Used to filter out priors that belong to a different chain lineage.
    const currentOriginal = currentChain.length > 0 ? currentChain[currentChain.length - 1] : null
    const chainSet = new Set(currentChain)

    // Find all prior devotions (originals + revisits, excluding guests) that share
    // any verse key with this devotion
    const all = db
      .select()
      .from(schema.devotions)
      .where(sql`${schema.devotions.bibleReference} IS NOT NULL`)
      .all()

    const byNumber = new Map(all.map((d) => [d.number, d]))
    const parseChain = (raw: string | null): number[] => {
      if (!raw) return []
      try {
        return JSON.parse(raw) as number[]
      } catch {
        return []
      }
    }
    const rootOriginalOf = (d: (typeof all)[number]): number | null => {
      if (d.devotionType !== 'revisit') return d.number
      const chain = parseChain(d.referencedDevotions)
      return chain.length > 0 ? chain[chain.length - 1] : null
    }

    // If the chain already includes an original-type devo, skip flagging other originals
    // as missing — the user has already asserted the correct original.
    const originalInChain = currentChain.some((n) => {
      const ancestor = byNumber.get(n)
      return ancestor ? ancestor.devotionType !== 'revisit' : false
    })

    const priorMap = new Map<
      number,
      {number: number; id: number; date: string; type: string; bibleReference: string | null; songName: string | null}
    >()
    for (const d of all) {
      if (d.number === devotion.number) continue
      if (d.devotionType === 'guest') continue
      if (d.date > devotion.date) continue
      if (d.date === devotion.date && d.number >= devotion.number) continue
      if (!d.bibleReference) continue
      const dParsed = parseReference(d.bibleReference)
      const dKeys = dParsed.flatMap((r) => referenceKeys(r))
      if (!dKeys.some((k) => keys.has(k))) continue

      // Lineage filter: only consider priors that share the same root-original as the current devo.
      if (currentOriginal != null) {
        const dOriginal = rootOriginalOf(d)
        if (dOriginal != null && dOriginal !== currentOriginal) continue
      }

      // Suppress other originals once an original is already in this chain.
      if (originalInChain && d.devotionType !== 'revisit') continue

      priorMap.set(d.number, {
        number: d.number,
        id: d.id,
        date: d.date,
        type: d.devotionType,
        bibleReference: d.bibleReference,
        songName: d.songName,
      })
    }

    const ignores: number[] = (() => {
      try {
        return devotion.chainIgnores ? (JSON.parse(devotion.chainIgnores) as number[]) : []
      } catch {
        return []
      }
    })()
    const ignoreSet = new Set(ignores)

    // Proposed chain: all matching prior devotions (minus ignored) sorted by date DESC,
    // matching the existing chain convention (nearest parent first, original last)
    const sortedPriors = [...priorMap.values()]
      .filter((p) => !ignoreSet.has(p.number))
      .sort((a, b) => b.date.localeCompare(a.date) || b.number - a.number)
    const proposedChain = sortedPriors.map((p) => p.number)

    const missing = sortedPriors.filter((p) => !chainSet.has(p.number))

    res.json({currentChain, proposedChain, missing, ignored: ignores})
  }),
)

// POST /api/devotions/:id/chain-insert - Insert a devotion number into this revisit's chain
// and cascade the insert into any ancestor revisit whose date is AFTER the target's date.
devotionsRouter.post(
  '/:id/chain-insert',
  asyncHandler(async (req, res) => {
    const bodyNumbers: number[] = Array.isArray(req.body?.numbers)
      ? req.body.numbers.map((n: unknown) => Number(n))
      : req.body?.number != null
        ? [Number(req.body.number)]
        : []
    const targets = [...new Set(bodyNumbers.filter((n) => Number.isFinite(n) && n > 0))]
    if (targets.length === 0) {
      res.status(400).json({error: 'Provide at least one valid number'})
      return
    }

    const current = db
      .select()
      .from(schema.devotions)
      .where(eq(schema.devotions.id, Number(req.params.id)))
      .get()
    if (!current) {
      res.status(404).json({error: 'Devotion not found'})
      return
    }
    if (current.devotionType !== 'revisit') {
      res.status(400).json({error: 'Only revisits can have a chain'})
      return
    }

    const targetDevos = db.select().from(schema.devotions).where(inArray(schema.devotions.number, targets)).all()
    if (targetDevos.length !== targets.length) {
      const found = new Set(targetDevos.map((d) => d.number))
      const missing = targets.filter((n) => !found.has(n))
      res.status(404).json({error: `Devotion(s) not found: ${missing.join(', ')}`})
      return
    }
    const today = new Date().toISOString().slice(0, 10)
    const future = targetDevos.find((d) => d.date > today)
    if (future) {
      res.status(400).json({error: `Devotion #${future.number} is a future devotion`})
      return
    }

    const parseChain = (raw: string | null): number[] => {
      if (!raw) return []
      try {
        return JSON.parse(raw) as number[]
      } catch {
        return []
      }
    }

    const originalChain = parseChain(current.referencedDevotions)

    // Collect all numbers we need dates for: original chain, targets, and every ancestor's chain
    const ancestorRevisits = originalChain.length
      ? db.select().from(schema.devotions).where(inArray(schema.devotions.number, originalChain)).all()
      : []

    const allNumbers = new Set<number>([...targets, ...originalChain])
    for (const a of ancestorRevisits) {
      for (const n of parseChain(a.referencedDevotions)) allNumbers.add(n)
    }

    const allDevos = db
      .select()
      .from(schema.devotions)
      .where(inArray(schema.devotions.number, [...allNumbers]))
      .all()
    const byNumber = new Map(allDevos.map((d) => [d.number, d]))
    const targetsByNumber = new Map(targetDevos.map((d) => [d.number, d]))

    // Insert a set of target numbers into a chain at date-sorted positions (newest first)
    const insertSorted = (chain: number[], toAdd: number[]): number[] => {
      const combined = new Set(chain)
      for (const n of toAdd) combined.add(n)
      const entries = [...combined].map((n) => ({
        num: n,
        date: byNumber.get(n)?.date ?? targetsByNumber.get(n)?.date ?? '',
      }))
      entries.sort((a, b) => b.date.localeCompare(a.date) || b.num - a.num)
      return entries.map((e) => e.num)
    }

    const updates: {id: number; chain: number[]}[] = []

    // Always update the current devotion with all targets
    const currentNewChain = insertSorted(originalChain, targets)
    updates.push({id: current.id, chain: currentNewChain})

    // Cascade into every revisit in the new chain (both original ancestors and newly-added
    // targets). Each such revisit R gets every other item from the new chain that is dated
    // before R — ensuring newly-inserted targets like 1321 also receive the older siblings
    // (954, 590) that now belong in their chain.
    const newChainDevotions = new Map<number, (typeof ancestorRevisits)[number]>()
    for (const d of ancestorRevisits) newChainDevotions.set(d.number, d)
    for (const d of targetDevos) newChainDevotions.set(d.number, d)

    for (const num of currentNewChain) {
      const r = newChainDevotions.get(num)
      if (!r || r.devotionType !== 'revisit' || r.id === current.id) continue

      const applicable = currentNewChain.filter((x) => {
        if (x === num) return false
        const xDate = byNumber.get(x)?.date ?? targetsByNumber.get(x)?.date ?? ''
        return xDate !== '' && xDate < r.date
      })
      if (applicable.length === 0) continue

      const rChain = parseChain(r.referencedDevotions)
      const toAdd = applicable.filter((x) => !rChain.includes(x))
      if (toAdd.length === 0) continue

      updates.push({id: r.id, chain: insertSorted(rChain, toAdd)})
    }

    for (const u of updates) {
      db.update(schema.devotions)
        .set({
          referencedDevotions: JSON.stringify(u.chain),
          updatedAt: sql`datetime('now')`,
        })
        .where(eq(schema.devotions.id, u.id))
        .run()
    }

    res.json({
      updated: updates.length,
      currentChain: updates.find((u) => u.id === current.id)?.chain ?? originalChain,
    })
  }),
)

// POST /api/devotions/:id/chain-fix-root - Extend this revisit's chain down through
// any terminal-revisit tail until it lands at an original. Used to heal chains flagged
// as `root-is-revisit` by the audit.
devotionsRouter.post(
  '/:id/chain-fix-root',
  asyncHandler(async (req, res) => {
    const current = db
      .select()
      .from(schema.devotions)
      .where(eq(schema.devotions.id, Number(req.params.id)))
      .get()
    if (!current) {
      res.status(404).json({error: 'Devotion not found'})
      return
    }
    if (current.devotionType !== 'revisit') {
      res.status(400).json({error: 'Only revisits can have a chain'})
      return
    }

    const parseChain = (raw: string | null): number[] => {
      if (!raw) return []
      try {
        return JSON.parse(raw) as number[]
      } catch {
        return []
      }
    }

    const originalChain = parseChain(current.referencedDevotions)
    if (originalChain.length === 0) {
      res.status(400).json({error: 'Chain is empty — nothing to extend. Use chain-insert to seed it.'})
      return
    }

    // Walk the tail: while the last number points at a revisit, splice in that
    // revisit's chain. Track visited numbers to break any cycles in bad data.
    const all = db.select().from(schema.devotions).all()
    const byNum = new Map(all.map((d) => [d.number, d]))

    const newChain: number[] = [...originalChain]
    const seen = new Set(newChain)
    const MAX_ITERATIONS = 50

    for (let i = 0; i < MAX_ITERATIONS; i++) {
      const tail = newChain[newChain.length - 1]
      const tailDevo = byNum.get(tail)
      if (!tailDevo || tailDevo.devotionType !== 'revisit') break

      const tailChain = parseChain(tailDevo.referencedDevotions)
      if (tailChain.length === 0) break

      let added = false
      for (const n of tailChain) {
        if (seen.has(n)) continue
        newChain.push(n)
        seen.add(n)
        added = true
      }
      if (!added) break
    }

    // Sanity-sort by date DESC (newest parent first, original last) using all available dates.
    const entries = newChain.map((n) => ({num: n, date: byNum.get(n)?.date ?? ''}))
    entries.sort((a, b) => b.date.localeCompare(a.date) || b.num - a.num)
    const sortedChain = entries.map((e) => e.num)

    const terminal = byNum.get(sortedChain[sortedChain.length - 1])
    const resolved = !!terminal && terminal.devotionType !== 'revisit'

    db.update(schema.devotions)
      .set({
        referencedDevotions: JSON.stringify(sortedChain),
        updatedAt: sql`datetime('now')`,
      })
      .where(eq(schema.devotions.id, current.id))
      .run()

    res.json({oldChain: originalChain, newChain: sortedChain, resolved})
  }),
)

// POST /api/devotions/:id/chain-ignore - toggle ignores for numbers on this devotion
devotionsRouter.post(
  '/:id/chain-ignore',
  asyncHandler(async (req, res) => {
    const add: number[] = Array.isArray(req.body?.add)
      ? req.body.add.map((n: unknown) => Number(n)).filter((n: number) => Number.isFinite(n) && n > 0)
      : []
    const remove: number[] = Array.isArray(req.body?.remove)
      ? req.body.remove.map((n: unknown) => Number(n)).filter((n: number) => Number.isFinite(n) && n > 0)
      : []
    if (add.length === 0 && remove.length === 0) {
      res.status(400).json({error: 'Provide add and/or remove arrays'})
      return
    }

    const devotion = db
      .select()
      .from(schema.devotions)
      .where(eq(schema.devotions.id, Number(req.params.id)))
      .get()
    if (!devotion) {
      res.status(404).json({error: 'Devotion not found'})
      return
    }

    let ignores: number[]
    try {
      ignores = devotion.chainIgnores ? (JSON.parse(devotion.chainIgnores) as number[]) : []
    } catch {
      ignores = []
    }
    const set = new Set(ignores)
    for (const n of add) set.add(n)
    for (const n of remove) set.delete(n)
    const next = [...set].sort((a, b) => a - b)

    db.update(schema.devotions)
      .set({
        chainIgnores: next.length > 0 ? JSON.stringify(next) : null,
        updatedAt: sql`datetime('now')`,
      })
      .where(eq(schema.devotions.id, devotion.id))
      .run()

    res.json({ignored: next})
  }),
)

// GET /api/devotions/:id - Single devotion
devotionsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const devotion = db
      .select()
      .from(schema.devotions)
      .where(eq(schema.devotions.id, Number(req.params.id)))
      .get()

    if (!devotion) {
      res.status(404).json({error: 'Devotion not found'})
      return
    }
    res.json(devotion)
  }),
)

// POST /api/devotions/bible-verses - Analyze a YouTube video transcript for Bible references
devotionsRouter.post(
  '/bible-verses',
  asyncHandler(async (req, res) => {
    const {url} = req.body as {url?: string}
    if (!url || typeof url !== 'string' || !url.trim()) {
      res.status(400).json({error: 'url is required'})
      return
    }

    let videoId = url.trim()
    const m = videoId.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\s]+)/)
    if (m) videoId = m[1]

    let transcript
    try {
      transcript = await YoutubeTranscript.fetchTranscript(videoId)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      res.status(502).json({error: `Failed to fetch transcript. Make sure the video has captions. ${msg}`})
      return
    }

    if (!transcript || transcript.length === 0) {
      res.status(404).json({error: 'No transcript found for this video'})
      return
    }

    const transcriptText = transcript
      .map((entry) => {
        const minutes = Math.floor(entry.offset / 60000)
        const seconds = Math.floor((entry.offset % 60000) / 1000)
        const timestamp = `${minutes}:${String(seconds).padStart(2, '0')}`
        return `[${timestamp}] ${entry.text}`
      })
      .join('\n')

    const message = await anthropic.messages.create({
      model: AI_MODELS.sonnet,
      max_tokens: 4096,
      system: `You analyze YouTube video transcripts to identify Bible verse references.

First, look ONLY for direct references — places where the speaker explicitly names a Bible book, chapter, and/or verse (e.g., "John 3:16", "Romans chapter 8", "in First Corinthians Paul says..."), or directly reads/quotes scripture by name.

If you find direct references, list ONLY those. Do NOT include indirect or paraphrased references.

If and ONLY if there are NO direct references at all, then look for indirect/paraphrased references where the speaker is clearly alluding to a specific Bible passage without naming it.

For each verse found, provide:
1. The Bible reference (book, chapter, verse)
2. The approximate timestamp where it's mentioned
3. A brief snippet of what the speaker said

Format your response as a clean, readable list. If no Bible verses are found at all (direct or indirect), say so.`,
      messages: [{role: 'user', content: `TRANSCRIPT:\n${transcriptText}`}],
    })

    const textBlock = message.content.find((b) => b.type === 'text')
    const result = textBlock && textBlock.type === 'text' ? textBlock.text : ''

    res.json({result, videoId, transcriptSegments: transcript.length})
  }),
)

// POST /api/devotions - Create devotion
devotionsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    try {
      const result = db
        .insert(schema.devotions)
        .values({
          date: req.body.date,
          number: req.body.number,
          devotionType: req.body.devotionType,
          subcode: req.body.subcode || null,
          guestSpeaker: req.body.guestSpeaker || null,
          guestNumber: req.body.guestNumber ?? null,
          referencedDevotions: req.body.referencedDevotions || null,
          bibleReference: req.body.bibleReference || null,
          songName: req.body.songName || null,
          title: req.body.title || null,
          talkingPoints: req.body.talkingPoints || null,
          youtubeDescription: req.body.youtubeDescription || null,
          facebookDescription: req.body.facebookDescription || null,
          podcastDescription: req.body.podcastDescription || null,
          produced: req.body.produced ?? false,
          rendered: req.body.rendered ?? false,
          youtube: req.body.youtube ?? false,
          facebookInstagram: req.body.facebookInstagram ?? false,
          podcast: req.body.podcast ?? false,
          notes: req.body.notes || null,
          flagged: req.body.flagged ?? false,
        })
        .returning()
        .get()

      res.status(201).json(result)
    } catch (error: unknown) {
      if (isUniqueConstraintError(error)) {
        res.status(409).json({error: 'A devotion with this number already exists'})
        return
      }
      throw error
    }
  }),
)

// PUT /api/devotions/:id - Update devotion
devotionsRouter.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const result = db
      .update(schema.devotions)
      .set({
        date: req.body.date ?? undefined,
        number: req.body.number ?? undefined,
        devotionType: req.body.devotionType ?? undefined,
        subcode: req.body.subcode !== undefined ? req.body.subcode || null : undefined,
        guestSpeaker: req.body.guestSpeaker !== undefined ? req.body.guestSpeaker || null : undefined,
        guestNumber: req.body.guestNumber !== undefined ? (req.body.guestNumber ?? null) : undefined,
        referencedDevotions:
          req.body.referencedDevotions !== undefined ? req.body.referencedDevotions || null : undefined,
        bibleReference: req.body.bibleReference !== undefined ? req.body.bibleReference || null : undefined,
        songName: req.body.songName !== undefined ? req.body.songName || null : undefined,
        title: req.body.title !== undefined ? req.body.title || null : undefined,
        talkingPoints: req.body.talkingPoints !== undefined ? req.body.talkingPoints || null : undefined,
        youtubeDescription: req.body.youtubeDescription !== undefined ? req.body.youtubeDescription || null : undefined,
        facebookDescription:
          req.body.facebookDescription !== undefined ? req.body.facebookDescription || null : undefined,
        podcastDescription: req.body.podcastDescription !== undefined ? req.body.podcastDescription || null : undefined,
        produced: req.body.produced ?? undefined,
        rendered: req.body.rendered ?? undefined,
        youtube: req.body.youtube ?? undefined,
        facebookInstagram: req.body.facebookInstagram ?? undefined,
        podcast: req.body.podcast ?? undefined,
        notes: req.body.notes !== undefined ? req.body.notes || null : undefined,
        flagged: req.body.flagged ?? undefined,
        updatedAt: sql`datetime('now')`,
      })
      .where(eq(schema.devotions.id, Number(req.params.id)))
      .returning()
      .get()

    if (!result) {
      res.status(404).json({error: 'Devotion not found'})
      return
    }
    res.json(result)
  }),
)

// POST /api/devotions/timestamps - Add timestamps to a devotion's YouTube description
devotionsRouter.post(
  '/timestamps',
  asyncHandler(async (req, res) => {
    const {number, timestamp} = req.body
    if (!number || !timestamp) {
      res.status(400).json({error: 'number and timestamp are required'})
      return
    }

    const devotion = db
      .select()
      .from(schema.devotions)
      .where(eq(schema.devotions.number, Number(number)))
      .get()

    if (!devotion) {
      res.status(404).json({error: `Devotion #${number} not found`})
      return
    }

    const isTyler = devotion.devotionType === 'guest' && devotion.guestSpeaker === 'Tyler'
    if (!isTyler) {
      res.status(400).json({error: `Devotion #${number} is not a Tyler devotion`})
      return
    }

    const [y, m, d] = devotion.date.split('-').map(Number)
    const formattedDate = new Date(y, m - 1, d).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    })
    const year = devotion.date.split('-')[0]

    const youtubeDescription = [
      'From the Shepherd to the Sheep',
      `#${String(devotion.number).padStart(3, '0')} - ${formattedDate}`,
      `Timestamps:\n0:00 Intro by Pastor Weniger\n0:59 Devotional by Pastor Candee\n${timestamp.trim()} Conclusion by Pastor Weniger`,
      "Join Pastor Candee for this morning's devotional!",
      '#cbc #cbcwoodbridge #dailydevotional',
      'CBC - Central Baptist Church (Woodbridge, VA)',
      `Copyright \u00A9 ${year}`,
    ].join('\n\n')

    const result = db
      .update(schema.devotions)
      .set({youtubeDescription, updatedAt: sql`datetime('now')`})
      .where(eq(schema.devotions.id, devotion.id))
      .returning()
      .get()

    res.json(result)
  }),
)

// DELETE /api/devotions/:id - Delete devotion
devotionsRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const result = db
      .delete(schema.devotions)
      .where(eq(schema.devotions.id, Number(req.params.id)))
      .returning()
      .get()

    if (!result) {
      res.status(404).json({error: 'Devotion not found'})
      return
    }
    res.json({success: true})
  }),
)

// PATCH /api/devotions/:id/toggle/:field - Quick-toggle a boolean field
devotionsRouter.patch(
  '/:id/toggle/:field',
  asyncHandler(async (req, res) => {
    const field = req.params.field as ToggleField
    if (!TOGGLE_FIELDS.includes(field)) {
      res.status(400).json({error: `Invalid field: ${field}. Must be one of: ${TOGGLE_FIELDS.join(', ')}`})
      return
    }

    const devotion = db
      .select()
      .from(schema.devotions)
      .where(eq(schema.devotions.id, Number(req.params.id)))
      .get()

    if (!devotion) {
      res.status(404).json({error: 'Devotion not found'})
      return
    }

    const result = db
      .update(schema.devotions)
      .set({
        [field]: !devotion[field],
        updatedAt: sql`datetime('now')`,
      })
      .where(eq(schema.devotions.id, Number(req.params.id)))
      .returning()
      .get()

    res.json(result)
  }),
)

// POST /api/devotions/import - Import from xlsx
devotionsRouter.post(
  '/import',
  asyncHandler(async (req, res) => {
    const {data, filename, year: yearOverride} = req.body as {data: string; filename: string; year?: number}

    if (!data) {
      res.status(400).json({error: 'base64-encoded xlsx data is required'})
      return
    }

    const buffer = Buffer.from(data, 'base64')
    const workbook = XLSX.read(buffer, {type: 'buffer', cellDates: true, raw: true})

    // Extract year from filename like "Devotional Log (2026).xlsx"
    const yearMatch = filename?.match(/\((\d{4})\)/)
    const fileYear = yearMatch ? parseInt(yearMatch[1]) : yearOverride || new Date().getFullYear()

    const monthNames: Record<string, number> = {
      january: 1,
      february: 2,
      march: 3,
      april: 4,
      may: 5,
      june: 6,
      july: 7,
      august: 8,
      september: 9,
      october: 10,
      november: 11,
      december: 12,
    }

    const allDevotions: ReturnType<typeof parseSheetRows>['devotions'] = []
    const allWarnings: string[] = []

    for (const sheetName of workbook.SheetNames) {
      const month = monthNames[sheetName.toLowerCase()]
      if (!month) {
        allWarnings.push(`Skipping unknown sheet: ${sheetName}`)
        continue
      }

      const sheet = workbook.Sheets[sheetName]
      const rows = XLSX.utils.sheet_to_json(sheet, {header: 1}) as unknown[][]

      const {devotions, warnings} = parseSheetRows(rows, fileYear, month)
      allDevotions.push(...devotions)
      allWarnings.push(...warnings.map((w) => `[${sheetName}] ${w}`))
    }

    const result = importDevotions(allDevotions)

    res.json({
      ...result,
      total: allDevotions.length,
      warnings: allWarnings,
    })
  }),
)

// POST /api/devotions/import-guide - Import publishing guide JSON
devotionsRouter.post(
  '/import-guide',
  asyncHandler(async (req, res) => {
    const {entries} = req.body as {
      entries: Array<{
        number: number
        title?: string
        youtubeDescription?: string
        facebookDescription?: string
        podcastDescription?: string
      }>
    }

    if (!entries || !Array.isArray(entries)) {
      res.status(400).json({error: 'entries array is required'})
      return
    }

    let updated = 0
    let notFound = 0

    for (const entry of entries) {
      const result = db
        .update(schema.devotions)
        .set({
          title: entry.title || undefined,
          youtubeDescription: entry.youtubeDescription || undefined,
          facebookDescription: entry.facebookDescription || undefined,
          podcastDescription: entry.podcastDescription || undefined,
          updatedAt: sql`datetime('now')`,
        })
        .where(eq(schema.devotions.number, entry.number))
        .returning()
        .get()

      if (result) updated++
      else notFound++
    }

    res.json({updated, notFound, total: entries.length})
  }),
)

// POST /api/devotions/parse-image - Parse handwritten sheet via Claude Vision
devotionsRouter.post(
  '/parse-image',
  asyncHandler(async (req, res) => {
    const {image, mediaType} = req.body as {image: string; mediaType: string}

    if (!image || !mediaType) {
      res.status(400).json({error: 'image (base64) and mediaType are required'})
      return
    }

    try {
      const result = await parseDevotionImage(image, mediaType)
      res.json(result)
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error)
      console.error('OCR error:', msg)
      res.status(500).json({error: msg})
    }
  }),
)

// POST /api/devotions/check-existing - Check which devotion numbers already exist
devotionsRouter.post(
  '/check-existing',
  asyncHandler(async (req, res) => {
    const {numbers} = req.body as {numbers: number[]}
    if (!numbers || !Array.isArray(numbers)) {
      res.json({existing: []})
      return
    }

    const existing = db
      .select({number: schema.devotions.number})
      .from(schema.devotions)
      .where(
        sql`${schema.devotions.number} IN (${sql.join(
          numbers.map((n) => sql`${n}`),
          sql`, `,
        )})`,
      )
      .all()

    res.json({existing: existing.map((e) => e.number)})
  }),
)

// POST /api/devotions/import-parsed - Import reviewed/approved parsed devotions
devotionsRouter.post(
  '/import-parsed',
  asyncHandler(async (req, res) => {
    const {devotions} = req.body as {
      devotions: Array<{
        date: string
        number: number
        devotionType: 'original' | 'favorite' | 'guest' | 'revisit'
        subcode?: string | null
        guestSpeaker?: string | null
        guestNumber?: number | null
        referencedDevotions?: number[]
        bibleReference?: string | null
        songName?: string | null
        generatedTitle?: string | null
        generatedBibleReference?: string | null
        generatedTalkingPoints?: string | null
        generatedPassageId?: number | null
        notes?: string | null
        flagged?: boolean
      }>
    }

    if (!devotions || !Array.isArray(devotions)) {
      res.status(400).json({error: 'devotions array is required'})
      return
    }

    let inserted = 0
    let updated = 0
    const errors: string[] = []
    const importedDevotions: Array<{number: number; id: number; passageId: number | null}> = []

    for (const d of devotions) {
      const refsJson = d.referencedDevotions?.length ? JSON.stringify(d.referencedDevotions) : null
      const hasGenerated = d.generatedTitle || d.generatedTalkingPoints

      try {
        const existing = db
          .select({id: schema.devotions.id})
          .from(schema.devotions)
          .where(eq(schema.devotions.number, d.number))
          .get()

        if (existing) {
          db.update(schema.devotions)
            .set({
              date: d.date,
              devotionType: d.devotionType,
              subcode: d.subcode || null,
              guestSpeaker: d.guestSpeaker || null,
              guestNumber: d.guestNumber ?? null,
              referencedDevotions: refsJson,
              bibleReference: d.bibleReference || d.generatedBibleReference || null,
              songName: d.devotionType === 'original' ? d.songName || null : null,
              notes: d.notes ?? null,
              flagged: d.flagged ?? false,
              ...(hasGenerated
                ? {
                    title: d.generatedTitle || null,
                    talkingPoints: d.generatedTalkingPoints || null,
                  }
                : {}),
              updatedAt: sql`datetime('now')`,
            })
            .where(eq(schema.devotions.id, existing.id))
            .run()
          updated++
          importedDevotions.push({number: d.number, id: existing.id, passageId: d.generatedPassageId ?? null})
        } else {
          const result = db
            .insert(schema.devotions)
            .values({
              date: d.date,
              number: d.number,
              devotionType: d.devotionType,
              subcode: d.subcode || null,
              guestSpeaker: d.guestSpeaker || null,
              guestNumber: d.guestNumber ?? null,
              referencedDevotions: refsJson,
              bibleReference: d.bibleReference || d.generatedBibleReference || null,
              songName: d.devotionType === 'original' ? d.songName || null : null,
              notes: d.notes ?? null,
              flagged: d.flagged ?? false,
              ...(hasGenerated
                ? {
                    title: d.generatedTitle || null,
                    talkingPoints: d.generatedTalkingPoints || null,
                  }
                : {}),
            })
            .returning()
            .get()
          inserted++
          importedDevotions.push({number: d.number, id: result.id, passageId: d.generatedPassageId ?? null})
        }
      } catch (error: unknown) {
        errors.push(`#${d.number}: ${error instanceof Error ? error.message : String(error)}`)
      }
    }

    // Mark pool passages as used
    for (const imp of importedDevotions) {
      if (imp.passageId) {
        db.update(schema.generatedPassages)
          .set({
            used: true,
            devotionId: imp.id,
            usedAt: sql`datetime('now')`,
          })
          .where(eq(schema.generatedPassages.id, imp.passageId))
          .run()
      }
    }

    res.json({inserted, updated, errors, total: devotions.length})
  }),
)

// POST /api/devotions/enrich-parsed - Backtrack revisit chains + verify verses
devotionsRouter.post(
  '/enrich-parsed',
  asyncHandler(async (req, res) => {
    const {devotions} = req.body as {
      devotions: Array<{
        number: number
        devotionType: string
        referencedDevotions: number[]
        bibleReference: string | null
      }>
    }

    if (!devotions || !Array.isArray(devotions)) {
      res.status(400).json({error: 'devotions array is required'})
      return
    }

    const results: Array<{
      number: number
      fullChain: number[]
      originalNumber: number | null
      originalReference: string | null
      verseMatch: boolean | null
    }> = []

    for (const d of devotions) {
      if (d.devotionType !== 'revisit' || !d.referencedDevotions?.length) {
        results.push({number: d.number, fullChain: [], originalNumber: null, originalReference: null, verseMatch: null})
        continue
      }

      // Backtrack the chain — always start from just the first reference
      let current = d.referencedDevotions[0]
      const chain: number[] = [current]
      const visited = new Set<number>([current])
      let originalRef: string | null = null
      let originalNum: number | null = null

      for (let depth = 0; depth < 20; depth++) {
        const devo = db.select().from(schema.devotions).where(eq(schema.devotions.number, current)).get()

        if (!devo) break

        if (devo.devotionType !== 'revisit' || !devo.referencedDevotions) {
          // Found the original
          originalNum = devo.number
          originalRef = devo.bibleReference
          break
        }

        // It's another revisit — follow the chain
        const refs: number[] = JSON.parse(devo.referencedDevotions)
        if (refs.length === 0) break

        const next = refs[0]
        if (visited.has(next)) break
        visited.add(next)
        chain.push(next)
        current = next
      }

      // Verify verse matches
      let verseMatch: boolean | null = null
      if (originalRef && d.bibleReference) {
        verseMatch = originalRef.trim().toLowerCase() === d.bibleReference.trim().toLowerCase()
      }

      results.push({
        number: d.number,
        fullChain: chain,
        originalNumber: originalNum,
        originalReference: originalRef,
        verseMatch,
      })
    }

    res.json(results)
  }),
)
