# Sermon Social Content

Upload a sermon transcript, get back quotable lines in the preacher's own words and a handful of
short posts to use through the week.

Design decisions and their reasoning: [ADR 0019](../docs/adr/0019-social-quote-fidelity.md).
Domain terms (**Sermon**, **Social Quote**, **Verbatim**/**Cleaned**/**Polished**, **Reflection**,
**Scripture Floor**, **Big Idea**, **Cited Scripture**, **Rank**): [CONTEXT.md](../CONTEXT.md).

## What it does

- A **Sermon** is a row: **Service Time** + date (unique together), **Speaker** (a contact), optional
  **Series**, and the raw transcript as a TEXT column.
- Uploading the transcript generates, in one call: 8–12 **Social Quotes**, 3–5 **Reflections**, the
  **Big Idea**, and the list of **Cited Scriptures**.
- Every result carries a **Rank** (`high`/`medium`/`low` + order + one-line reason) and may carry a
  `sensitive` flag. Flagged results are generated **in addition to** the target counts.
- Results are editable in place and have a `used` toggle. Copy-to-clipboard on every card.
- A **Social Quote** can be promoted into the existing `quotes` corpus, citing its Sermon.
- Re-upload and Regenerate are **destructive**: delete this sermon's quotes and reflections, run again.

### The three forms of a Social Quote

| Form         | Rule                                                                    | Example from 2026-08-16 PM                             |
| ------------ | ----------------------------------------------------------------------- | ------------------------------------------------------ |
| **Verbatim** | Exact span, only sentence spacing added. Never posted; always viewable. | `"the step of growing in ri- wisdom or comprehension"` |
| **Cleaned**  | Disfluencies deleted. No word added, substituted or reordered. Default. | `"the step of growing in wisdom or comprehension"`     |
| **Polished** | May repair grammar and supply elided words so the line stands alone.    | `"This is the step of growing in wisdom."`             |

Lines that need no cleaning at all pass through identically in all three — most of the good ones do:

> "It can measure us, but it can't mend us."
> "The book that converts the sinner is the same book that carries the saint."
> "That's not because God's moved. That's because the glass got dirty."
> "The law was never given to save us. It was given to show us that we are in need of saving."

A span damaged by transcription (`"conuh, enlightening the eyes"`) is **skipped**, not repaired.

## Schema — `server/db/schema-sermons.ts`

```
sermons
  id, service_time_id → service_times.id (NOT NULL)
  sermon_date  'YYYY-MM-DD'
  speaker_person_id → people.id (NOT NULL)
  title, series          (nullable text)
  big_idea               (nullable text)
  transcript             (TEXT, not a file — see below)
  generated_at, generation_model, generation_duration_ms
  created_at, updated_at
  UNIQUE (service_time_id, sermon_date)

sermon_social_quotes
  id, sermon_id → sermons.id ON DELETE CASCADE
  verbatim_text, cleaned_text, polished_text
  start_offset, end_offset      (into sermons.transcript; drive Quote Context)
  rank_tier 'high'|'medium'|'low', rank_order, rank_note
  sensitive (bool), sensitive_reason
  edited_text                   (nullable — user override; verbatim never changes)
  used (bool)
  promoted_quote_id → quotes.id (nullable)

sermon_reflections
  id, sermon_id → sermons.id ON DELETE CASCADE
  body
  rank_tier, rank_order, rank_note
  sensitive, sensitive_reason
  edited_body (nullable), used (bool)

sermon_scriptures
  id, sermon_id → sermons.id ON DELETE CASCADE
  reference   ('Psalm 19:7', 'Romans 7:18-8:2')
  book, chapter                 (for the "have I preached this?" lookup)
```

Transcript is a TEXT column, **not** a file under `UPLOADS_DIR`. ADR 0001 governs _media_; this is
60 KB of text that must be indexed into by character offset for **Quote Context**, so it belongs in
the row.

## Generation — `server/services/sermon-social.ts`

One Anthropic call per sermon, following `server/services/quote-research.ts`:

- Model from `settings.defaultAiModel` via `resolveModel()`; `effortConfig(model, 'medium')`.
- Structured XML response — `<bigIdea>`, `<scriptures>`, `<quotes>`, `<reflections>` — parsed the way
  `quote-research.ts` parses its `<results>`.
- Transcript is ~15 K tokens; comfortably one call, no chunking.

Prompt rules, in priority order:

1. **Scope.** Generate only from the preached portion. Ignore announcements (this file opens with
   ~1,200 words of Labor Day, Loyal Ladies Sept 15, Faithful Men Sept 21, Youth Workers Sept 27,
   Extravaganza Oct 17, 63rd anniversary Oct 25) and both prayers.
2. **Social Quotes are his words.** Return the exact span plus its Cleaned and Polished forms. Never
   substitute or reorder words in Cleaned. Skip damaged spans.
3. **Never correct the preacher.** This sermon renders Revelation 3:15–16 as _"I would rather you be
   cold than lukewarm."_ Reproduce it as said.
4. **Reflections may write freely** — voice, framing, engagement — but are bound by the
   **Scripture Floor**: only passages this sermon cited, only **AKJV** wording. Reuse the constraint
   line already in `server/services/devotion-generation.ts:28`.
5. **Rank** most-useful-first with a tier and a one-line reason.
6. **Flag** contested material with a reason; generate replacements so unflagged results still hit
   8–12 quotes / 3–5 reflections.

Generation is **synchronous** on upload (expect 30–60 s). If it proves too slow behind the proxy,
the fallback is the `message-queue.ts` job pattern — not worth building up front.

## API — `server/routes/sermons.ts`

| Method   | Path                                   | Notes                                      |
| -------- | -------------------------------------- | ------------------------------------------ |
| `GET`    | `/api/sermons`                         | list; filter by series, speaker, date      |
| `POST`   | `/api/sermons`                         | create + transcript, then generate         |
| `GET`    | `/api/sermons/:id`                     | sermon + quotes + reflections + scriptures |
| `PATCH`  | `/api/sermons/:id`                     | title, series, speaker, service time       |
| `POST`   | `/api/sermons/:id/regenerate`          | destructive re-run                         |
| `DELETE` | `/api/sermons/:id`                     | cascades                                   |
| `GET`    | `/api/sermons/:id/quotes/:qid/context` | **Quote Context** from offsets, not stored |
| `PATCH`  | `/api/sermons/:id/quotes/:qid`         | `edited_text`, `used`                      |
| `POST`   | `/api/sermons/:id/quotes/:qid/promote` | → `quotes` row                             |
| `PATCH`  | `/api/sermons/:id/reflections/:rid`    | `edited_body`, `used`                      |

Promotion writes a `quotes` row with `author` = speaker's name, `source = 'sermon'`,
`external_id = 'sermon-<sermonId>-<quoteId>'`, `date_display` from the sermon date. `source` is a
plain text column, so no constraint change. The existing `/api/quotes/authors` filter separates the
preacher's own lines from the Spurgeon/Bob Jones corpus for free.

## UI

- `/sermons/social` — list of sermons; date, service, speaker, series, counts.
- `/sermons/social/:id` — upload/paste panel, then two tabs: **Quotes** and **Reflections**.
  - Quote card: Cleaned text large, `Verbatim` / `Polished` toggles, rank badge, sensitive badge,
    "Show context" (few sentences either side), copy, edit, used, "Add to Quotes".
  - Reflection card: body, rank badge, sensitive badge, copy, edit, used.
  - Header shows **Big Idea** and **Cited Scriptures**, each linking to
    `biblegateway.com/passage/?search=…&version=AKJV` (same as `devotion-detail-page.tsx:836`).
- Used items dim and sort to the bottom.

## Wiring per CLAUDE.md

- `src/lib/nav-config.ts` — rename group `sermons` label **"Sermon Prep" → "Sermons"**; add child
  `{to: '/sermons/social', label: 'Social Content', icon: Share2}`.
- `src/App.tsx` — routes for `/sermons/social` and `/sermons/social/:id`.
- `src/lib/search/providers/` — a sermons provider, registered in `providers/index.ts`; `GROUP_ORDER`
  and `PREFIX_TO_GROUP` in `src/components/command-palette.tsx`. Set `navPath` on items so Recents
  de-dupes.
- `server/services/usage-entity-resolver.ts` — pretty label for `/sermons/social/:id`, e.g.
  "Sunday Evening — Aug 16".
- `server/index.ts` — mount `sermonsRouter`.

## Build order

1. Schema file + `pnpm db:generate`. **Stop the launchd service before migrating** (RUNBOOK).
2. `sermon-social.ts` — prompt, XML parse, offsets. Verify against the Aug 16 PM transcript.
3. Routes, then list + detail pages.
4. Nav, command palette, usage resolver.
5. Promote-to-corpus.
6. `pnpm lint` + prettier.

## Out of scope

- **Announcement extraction → calendar events / "this week at Central" blast.** The highest-value
  idea to come out of the design session, and deliberately deferred — date parsing against the real
  calendar, event drafts, recurrence and its own review step make it a separate feature, not a rider
  on this one.
- YouTube transcript fetch (`youtube-extract.ts` already has the machinery if it's ever wanted).
- Video/link fields, per-day scheduling, posting integrations, hashtags, sermon outline extraction.
