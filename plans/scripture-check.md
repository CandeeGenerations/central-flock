# Scripture Check

Proofread every **Scripture Block** of a **Gwendolyn Devotional** against the app's own copy of the
AKJV, so that a wrong reference or a misquoted word gets caught before the reel goes out.

One ADR governs this work. Read it first:

- [0039: The Scripture Check trusts a local Bible Text, not the model](../docs/adr/0039-scripture-check-trusts-the-bible-text-not-the-model.md)

Terms (**Gwendolyn Devotional**, **Original**, **Scripture Block**, **Fragment**, **Scripture
Check**, **Finding**, **Dismissal**, **Correction Note**, **Bible Text**) are defined in
[CONTEXT.md](../CONTEXT.md).

## The problem

#26 "GOOD FEAR" was sent with `Proverbs 25:29`. The verse is Proverbs 29:25, and Proverbs 25 has only
28 verses. Nothing in the flow looks at scripture: `gwendolyn-parse.ts` splits blocks, hashtags are
generated, you save. It was fixed by hand afterwards, and that edit then erased the only record of
what she had sent (bug 1 below).

Running the planned check by eye over existing data already turns up a second case:

| #   | Block                                                                         | Cited            | Finding                                             |
| --- | ----------------------------------------------------------------------------- | ---------------- | --------------------------------------------------- |
| 26  | "The fear of man bringeth a snare…" (as sent)                                 | Proverbs 25:29   | _Invalid Reference_: no such verse; fix → 29:25     |
| 25  | "Although the fig tree… Yet I will rejoice… **The LORD God is my strength…**" | Habakkuk 3:17-18 | _Out of Range_: last Fragment is v19; fix → 3:17-19 |

## Scope

- **In:** 📖 Scripture Blocks only: the reference and the quotation's wording.
- **Out:** 📚 points and the title (never checked), sending anything to Gwendolyn (the **Correction
  Note** is copy-only), and numbered **Devotions** (a separate feature).
- **No new routes**, so no command palette or `usage-entity-resolver.ts` changes.

## Phase 0: Stop edits erasing the Original (bug fix, ships first)

`GwendolynDevotionalForm.handleSubmit` always submits `rawInput: null`
(`src/pages/devotions/gwendolyn-devotional-form.tsx:111`). The PUT route applies it because
`null !== undefined` (`server/routes/gwendolyn-devotions.ts:157`). Every edit therefore erases the
**Original**. Seven of 24 have lost it: #3, 4, 12, 20, 22, 24, 26.

1. Form: drop `rawInput` from the submitted payload. `onSubmit` type becomes
   `Omit<GwendolynDevotional, 'id' | 'createdAt' | 'updatedAt' | 'rawInput'>`. The new page already
   adds `rawInput: parsed.rawInput` itself.
2. PUT `/:id`: stop accepting `rawInput` at all. The Original is set once, on create, and never
   altered.
3. Restore #26 from `backups/central-flock.db.pre-migrate-20260910T021307Z-2d2f52d` (verified to hold
   it). A one-off `UPDATE` run with the service stopped, per [RUNBOOK.md](../RUNBOOK.md). The other
   six were already null in every backup (the oldest is 2026-08-30) and are unrecoverable. They
   simply get no Correction Note.

## Phase 1: Parser fixes

`BIBLE_REF_RE = /^[1-3]?\s*[A-Za-z]+\s+\d+:\d+/` in `server/services/gwendolyn-parse.ts` accepts only a
one-word book, and only when the reference is alone on the last line.

- **Multi-word books:** "Song of Solomon 2:10" is never split off. It stays glued to the quote and the
  reference is left empty. Recognise references by resolving them against the Bible Text's own
  book table (Phase 2). As built, `bible-text.ts` carries its own alias table; `bible-reference.ts`
  is untouched.
- **Decorated references:** accept `(Psalm 34:1)`, `— Psalm 34:1`, `-Psalm 34:1`, and a reference
  trailing the closing quote on the same line (`…help thee.” Isaiah 41:10`).
- Quote stripping also handles the `📖”Fear thou not…` form in #26's Original, where a closing-style
  curly quote is used as the opener.
- **Lead-ins and trailing prose** (added after the first audit run against real Originals): a 📖
  segment is split the way the blocks were being split by hand. Text before the opening quote
  ("God said:", "The Bible says,", "Proverbs 3:13 reminds us,") becomes its own point before the
  Scripture Block. Prose after the reference line ("Just yield to Jesus Christ who says,") becomes
  its own point after. A 📚 segment whose last line hands over to the next 📖 ("Proverbs 23:7
  says,") has that line split off as its own point. A reference named only in a **Lead-in** stays
  there, and the Scripture Block's reference stays blank, as in #13, #15, #17 and #23.

## Phase 2: Bible Text

**Data.** The public-domain 1769 KJV (the text behind BibleGateway's AKJV), 66 books, 31,102 verses.
Committed as `server/data/bible/akjv.json`, shaped as
`{books: [{name, chapters: [[verseText, …], …]}]}` (~4-5 MB). Source it from an established
public-domain dataset. Before committing, strip pilcrows (¶), italics markup, and bracketed
translator notes, then spot-check a dozen verses against BibleGateway AKJV (including Proverbs 29:25,
Habakkuk 3:17-19, Isaiah 41:10, Hebrews 10:31, and Psalm 34:1). Record the source and its licence in
a `README.md` beside the file.

No DB table and no migration: the text is read-only and versioned with the code.

**Module** `server/lib/bible-text.ts`, loaded lazily into memory on first use:

```ts
resolveReference(ref: string):
  | {ok: true; canonical: string; verses: VerseKey[]}   // "Habakkuk 3:17-19", [{book,chapter,verse}…]
  | {ok: false; reason: 'unparseable' | 'no-such-book' | 'no-such-chapter' | 'no-such-verse'}
canonicalReference(verses: VerseKey[]): string          // full book name, C:V, hyphen ranges, "Psalm" for one psalm
verseText(keys: VerseKey[]): string
normalize(text: string): string                         // see matching rules
findFragment(fragment: string, within?: VerseKey[]): Location[]   // whole Bible when `within` omitted
```

- **Range parsing:** `parseReference` in `bible-reference.ts` only yields a start verse. The new
  resolver handles `3:17-18`, `3:17-4:2`, `2, 4`, `14:2; 15:1`, `2b`, and a book + chapter with no
  verse (whole chapter). It validates every key against the book/chapter/verse counts in the data.
- **Matching rules** (`normalize`): lowercase; drop all punctuation, including curly/straight quotes,
  hyphens and ¶; collapse whitespace; fold British/American spelling via a small word map (honour,
  saviour, labour, favour, neighbour, colour, …) to one form.
- **Searching:** each chapter is kept as one normalised string with verse start offsets, so a
  Fragment that spans a verse boundary still matches. `findFragment` is a substring scan. About 4 MB
  of text makes a full-Bible scan per Fragment a few milliseconds, with no index needed.

## Phase 3: Scripture Check service

`server/services/scripture-check.ts`, which is pure and takes the Bible Text.

```ts
checkBlock(block: ScriptureBlock): BlockCheck                  // deterministic, instant
explainNotFound(block, check): Promise<BlockCheck>             // AI; only for Not Found
type BlockCheck = {findings: Finding[]; resolved?: {canonical: string; verses: VerseKey[]}}
type Finding = {
  kind: 'missing_reference' | 'invalid_reference' | 'wrong_reference' | 'out_of_range'
      | 'wording_differs' | 'not_found' | 'reference_format'
  message: string
  basis: string                       // what a Dismissal of this Finding binds to (below)
  fix?: {reference?: string; text?: string}
  candidates?: {reference: string; text: string}[]   // ties: list, no single fix
  diff?: {op: 'same' | 'del' | 'ins'; word: string}[]
  aiNote?: string                     // labelled guess, never a fix unless confirmed
  dismissed?: boolean
}
```

**Algorithm, per block:**

1. **Fragments:** split the quotation on `…` and `...`, trim, and drop empties. Her `[bracketed
glosses]` ("stay [rely] upon") are skipped; they are hers, not quotation.
2. **Reference:**
   - Empty, but the **Lead-in** (the point just before) names one: check against that, with no
     _Reference Format_ Finding, since the lead-in is her prose.
   - Empty: search (step 4) and report _Missing Reference_.
   - Unresolvable: _Invalid Reference_, then search.
   - Resolvable but not canonical: _Reference Format_, with fix = `canonicalReference`.
3. **Locate** each Fragment within the cited verses. If every Fragment is found, the location
   side is clean. Go to step 5.
4. **Search** the whole Bible for the unplaced Fragments. Only Fragments of 4 or more words are used
   to search, but short ones must still appear in any location offered. Score candidate locations
   by how many of the block's Fragments they contain.
   - If some Fragments are inside the cited range and the rest are in adjacent verses of the same
     passage: _Out of Range_, with fix = the smallest range covering both.
   - If none are in range and exactly one location contains every Fragment: _Wrong Reference_, with
     fix = that location's canonical reference. If several contain every Fragment, attach them as
     `candidates` with their text, and no single `fix`.
   - If the search finds no location at all, go to step 5, which will produce _Not Found_.
5. **Wording:** for any Fragment not found verbatim, align it word by word against the best window
   of its located verses (or of the cited verses, when there is no better location). If the
   alignment is close (most words shared), report _Wording Differs_ with a `diff` and a `fix.text`.
   The fix is the whole quotation with **only the differing words inside that Fragment** replaced:
   ellipses, Fragment boundaries and her other Fragments are untouched. If the alignment is not
   close, report _Not Found_.
6. **Order** the Findings by severity, as listed in CONTEXT.md.

**AI fallback** (`explainNotFound`): runs only for blocks with a _Not Found_ Finding, using the
`defaultAiModel` setting and the same client pattern as `gwendolyn-hashtags.ts`. The model receives
the quotation and the cited reference, and returns `<reference>` (or none) plus a one-sentence
`<note>`. The returned reference is re-run through steps 3-5. If it confirms (every Fragment is
found, or a close Wording Differs match), the result replaces _Not Found_ with a normal Finding and
fix. If it does not confirm, the note is attached as `aiNote`, labelled as a guess, with no fix. A
missing API key or an API error leaves _Not Found_ as it is. That is never an error.

**Dismissal basis:** each Finding carries the string a Dismissal binds to, so a fix on one side
does not revive a Dismissal on the other:

| Finding kinds                                     | `basis`                                                          |
| ------------------------------------------------- | ---------------------------------------------------------------- |
| Wording Differs, Not Found                        | quotation text + the verse keys it was checked against           |
| Missing / Invalid / Wrong Reference, Out of Range | reference as written + the verse keys where Fragments were found |
| Reference Format                                  | reference as written                                             |

So fixing "Isa." → "Isaiah" leaves a dismissed paraphrase dismissed, because the resolved verses
don't change. Fixing a word leaves a dismissed Out of Range dismissed, because the Fragment
locations don't move.

## Phase 4: Storage and API

**Storage:** a Dismissal lives on its block inside the existing `blocks` JSON, so no migration:

```ts
{type: 'scripture', text, reference, dismissals?: {kind: FindingKind; basis: string}[]}
```

On POST and PUT, the server re-runs `checkBlock` and prunes Dismissals whose `(kind, basis)` no longer
matches any current Finding, so stale ones don't accumulate. `buildBlockText` / `buildCopyContent`
ignore the new field.

**Routes** (`server/routes/gwendolyn-devotions.ts`):

| Method | Path     | Change                                                                                                                                                                   |
| ------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| POST   | `/parse` | Adds `checks: BlockCheck[]`, index-aligned with `blocks`. Runs the AI fallback for Not Found blocks in parallel with hashtags                                            |
| POST   | `/check` | **New.** `{blocks, ai?: boolean, index?: number}` → `{checks}`. Deterministic by default (the live re-check); `ai: true` + `index` re-checks one block with the fallback |
| GET    | `/`      | Each row gains `openFindings: number` (deterministic, not dismissed)                                                                                                     |
| GET    | `/:id`   | Adds `checks` and `correctionNote: string \| null`                                                                                                                       |

**Correction Note:** derived in GET `/:id` from what she sent (the re-parsed Original, or the
current blocks when there is none) against the current blocks **with every open Finding's fix
applied** — so it is ready to send _before_ anything is edited, and stays right afterwards (changed
after first use: the note has to come before the edit, so a correction she declines never needs
undoing). A Finding with no single fix (a tie, or Not Found) becomes a question; a dismissed Finding
drops out; Reference Format is skipped. Blocks are paired in order (falling back to best text
similarity when the counts differ). The template is deterministic, with no AI:

> I was looking back at this one and noticed this verse “The fear of man bringeth a snare:…” is
> Proverbs 29:25. You have Proverbs 25:29. Is it okay to change and fix that?

(The phrasing is the one actually sent to her. Several items become a bulleted "noticed a few
things:" list ending "Is it okay to change and fix those?")

## Phase 5: UI

**`gwendolyn-devotional-form.tsx`** (shared by New and Edit):

- Under each Scripture Block's reference input: a Findings panel, worst first. Each Finding shows a
  badge, a message, a word diff (struck / inserted words) where relevant, a one-click fix button,
  a candidates list with "Use this one" per candidate, an AI note labelled _AI guess, not verified_,
  and Dismiss / Undo. A dismissed Finding is greyed, never green. With no open Findings, the block
  shows ✅ Matches.
- The live re-check: 400 ms debounced POST `/check` on text or reference change, per devotional.
  Deterministic only. _Not Found_ gets a "Re-check with AI" button (`ai: true`, `index`).
- The existing amber "No reference" note is replaced by the _Missing Reference_ Finding.
- **Soft gate:** if any Finding is open on submit, a `dialog.tsx` confirm reads "N scripture findings
  unresolved. Save anyway?"
- New page: seed the Findings from `/parse`'s `checks` so they appear immediately after Parse.

**`gwendolyn-detail-page.tsx`:** read-only Findings under each `ScriptureBlock` (fixes and Dismissal
happen via Edit), plus a **Suggested note to Gwendolyn** card with a Copy button, shown when
`correctionNote` is non-null.

**`gwendolyn-list-page.tsx`:** a ⚠️ count badge on rows with `openFindings > 0`.

**`src/lib/gwendolyn-devotion-api.ts`:** add the types and a `checkGwendolynBlocks` helper.

## Phase 6: Verification

There is no test runner, so verification is an audit script plus manual runs.

1. `scripts/scripture-check-audit.ts` (tsx, read-only DB): runs `checkBlock` over every Gwendolyn
   Devotional's current blocks **and** its re-parsed Original, and prints Findings per block. It
   must show:
   - #26 Original: _Invalid Reference_ (Proverbs 25:29), fix → Proverbs 29:25.
   - #26 current: every block Matches.
   - #25: _Out of Range_, fix → Habakkuk 3:17-19.
2. Parser cases: "Song of Solomon 2:10" on its own line, `(Psalm 34:1)`, `— Psalm 34:1`, and a
   reference on the quote's line all populate `reference`.
3. Hand-made blocks, one per Finding kind, including a tie (a Fragment shared by Deuteronomy 31 and
   Joshua 1 → candidates, no fix), and a Reference Format fix after a dismissed Wording Differs
   (the Dismissal survives).
4. The AI path with `ANTHROPIC_API_KEY` unset: _Not Found_ still shows, and nothing errors.
5. `pnpm lint` and `pnpm prettier`.

Review the audit output for the other 22 devotionals before shipping. Every Finding there is
either a real catch or a matching-rule gap to fix first.

## Out of scope / later

- Checking points or titles, and any rewriting of Gwendolyn's voice.
- Sending the Correction Note. It is copy-only.
- Other consumers of the Bible Text: rendering **Cited Scriptures** / the **Scripture Floor**, and
  verifying generated devotion passages. `devotion-generation.ts` still says "KJV" in its prompt,
  per the flagged ambiguity in CONTEXT.md.
