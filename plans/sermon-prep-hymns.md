# Sermon Prep → Hymns

> Copy this plan to `central-flock/plans/sermon-prep-hymns.md` for Typora review before implementing (per user feedback: plans live in the repo's `plans/` folder).

## Context

Pastor Tyler currently builds each Sunday's song service by hand: he opens Claude, pastes the table of contents from his two hymnals (Burgundy — the main ~551-song hymnal; Silver — a ~101-song gospel supplement), and supplies sermon title + text + theme + audience. Claude returns a structured service: opener, congregational hymns, alternates, special music, invitation, and a recommended flow.

This feature lifts that loop into Central Flock. The hymnal metadata is extracted from PDF once into a local DB; each prep request is a single form submit that round-trips through Claude and is saved as history. The design **mirrors the existing Quotes Research feature end-to-end** — same multi-DB pattern, same service shape, same history/detail pages, same prompt-caching approach. The only departures: four input fields instead of one topic, a six-section structured response, and a separate `hymns.db`.

**User decisions already confirmed:**

- Extract hymns into a DB table (not attach PDFs at runtime, not a JSON-only seed)
- Save each request as history (like Quotes Research)
- Form: title / scripture text / theme / audience + optional hymnal filter
- Output: structured sections rendered as cards

## Data Model

Two Drizzle tables in **[server/db-hymns/schema.ts](server/db-hymns/schema.ts)** (new).

### `hymns`

| Column          | Type                                          | Notes                                         |
| --------------- | --------------------------------------------- | --------------------------------------------- |
| `id`            | integer PK autoinc                            |                                               |
| `book`          | text NOT NULL                                 | `'burgundy'` \| `'silver'`                    |
| `number`        | integer NOT NULL                              | Printed hymn number                           |
| `title`         | text NOT NULL                                 |                                               |
| `firstLine`     | text                                          | First line of verse 1 — UI snippet + LLM hint |
| `refrainLine`   | text                                          | First line of refrain, if any                 |
| `author`        | text                                          | Lyricist                                      |
| `composer`      | text                                          |                                               |
| `tune`          | text                                          | Tune name (e.g. `NEW BRITAIN`)                |
| `meter`         | text                                          | Metrical pattern (e.g. `8.7.8.7`)             |
| `topics`        | text NOT NULL                                 | JSON array, from the book's topical index     |
| `scriptureRefs` | text NOT NULL                                 | JSON array, from the Scripture index          |
| `notes`         | text                                          | Escape hatch for flags like "invitation hymn" |
| `createdAt`     | text default `(datetime('now', 'localtime'))` |                                               |

Constraints: `UNIQUE(book, number)`, `INDEX idx_hymns_book`, `INDEX idx_hymns_title`.

Why these columns: `(book, number)` is how the pastor references a song verbally ("Burgundy 145"), uniqueness allows safe re-seeds. `firstLine`/`refrainLine` support the UI lyric-snippet chip AND give the LLM an accurate short excerpt to quote (copyright-safe). `topics` + `scriptureRefs` are the two indices pastors actually use to match hymns to sermons — they must go in the corpus.

### `hymn_searches`

| Column           | Type                                          | Notes                                     |
| ---------------- | --------------------------------------------- | ----------------------------------------- |
| `id`             | integer PK autoinc                            |                                           |
| `title`          | text NOT NULL                                 | sermon title                              |
| `scriptureText`  | text NOT NULL                                 |                                           |
| `theme`          | text NOT NULL                                 |                                           |
| `audience`       | text NOT NULL                                 |                                           |
| `hymnalFilter`   | text NOT NULL                                 | `'burgundy'` \| `'silver'` \| `'both'`    |
| `sections`       | text NOT NULL                                 | JSON — full `HymnSuggestionSections` blob |
| `rawResponse`    | text NOT NULL                                 | Full XML from Claude (replay/debug)       |
| `model`          | text NOT NULL                                 |                                           |
| `candidateCount` | integer NOT NULL                              |                                           |
| `durationMs`     | integer NOT NULL                              |                                           |
| `createdAt`      | text default `(datetime('now', 'localtime'))` |                                           |

Constraints: `INDEX idx_hymn_searches_created_at`.

Mirrors `quote_searches` verbatim; `sections` JSON is what the detail page re-renders (rehydration is just `JSON.parse`).

## Seeding Strategy

**Two-step Claude-based extraction** — chosen over a one-step script and over a Node PDF parser:

- Splitting extraction from DB load means schema tweaks re-apply from cached JSON in seconds without re-billing Claude.
- `@anthropic-ai/sdk` natively accepts PDFs as `document` content blocks — no new deps. A Node PDF parser (`pdf-parse`) is fragile on multi-column hymnal indices.
- `ANTHROPIC_API_KEY` is already plumbed via launchd (user memory).

### New scripts

**[scripts/extract-hymns.ts](scripts/extract-hymns.ts)** — reads `data/Burgandy Book.pdf` and `data/Silver Book.pdf`, chunks each into ~20-page ranges, sends each chunk to Claude as a PDF document block, dedupes on `(book, number)`, writes **`data/hymns-seed.json`**. 3-attempt exponential retry per chunk. Non-JSON responses logged to `data/hymns-seed.errors.log` (continue, don't abort). Skips work if `hymns-seed.json` exists unless `--force`.

**[scripts/load-hymns.ts](scripts/load-hymns.ts)** — reads the JSON, upserts via `INSERT … ON CONFLICT(book, number) DO UPDATE SET …`. Prints `Loaded N Burgundy, M Silver`.

### Extraction prompt (in extract-hymns.ts)

System: _"You are extracting hymn metadata from a printed hymnal's indices. Return ONLY a JSON array. Do not invent hymns. If a field is unknown, omit it. Never quote more than the first line of verse 1 or the first line of the refrain — no full verses, no full refrains."_

User content: `{type: 'document', source: {type: 'base64', media_type: 'application/pdf', data: ...}}` + text describing the page range and the per-entry JSON schema `{number, title, firstLine, refrainLine, author, composer, tune, meter, topics[], scriptureRefs[]}`.

### PDFs & git

`/data` is already gitignored ([.gitignore](.gitignore):35) — PDFs and `hymns-seed.json` stay local. README note: drop both PDFs in `data/` before running extraction.

### Run order

```
npx tsx scripts/extract-hymns.ts
npx tsx scripts/load-hymns.ts
```

## Backend

### New files

- **[server/db-hymns/schema.ts](server/db-hymns/schema.ts)** — Drizzle tables from Data Model above.
- **[server/db-hymns/index.ts](server/db-hymns/index.ts)** — mirrors [server/db-quotes/index.ts](server/db-quotes/index.ts): opens `./hymns.db`, `journal_mode = WAL`, `foreign_keys = ON`, idempotent `CREATE TABLE IF NOT EXISTS` for both tables + indices. Exports `hymnsDb`, `hymnsSqlite`, `hymnsSchema`. No FTS needed — corpus is small (~650 rows) and we send all of it.
- **[server/routes/hymns.ts](server/routes/hymns.ts)** — Express router, all handlers wrapped in `asyncHandler` from [server/lib/route-helpers.ts](server/lib/route-helpers.ts):
  - `POST /api/hymns/suggest` — body `{title, scriptureText, theme, audience, hymnalFilter?}` → `HymnSuggestionResult`
  - `GET /api/hymns/searches?page=&pageSize=&q=` — paginated list, title LIKE search
  - `GET /api/hymns/searches/:id` — detail (rehydrated)
  - `DELETE /api/hymns/searches/:id`
- **[server/services/hymn-suggestion.ts](server/services/hymn-suggestion.ts)** — mirrors [server/services/quote-research.ts](server/services/quote-research.ts). Exports `runHymnSuggestion()`, `rehydrateHymnSearch()`. Duplicate the 8-line `getConfiguredModel()` helper (reads `settings.defaultAiModel`, falls back to `claude-sonnet-4-20250514`) — coupling a shared util is not worth it.
- **[drizzle-hymns.config.ts](drizzle-hymns.config.ts)** — copy of [drizzle-quotes.config.ts](drizzle-quotes.config.ts) with `schema`, `out`, `url` pointing at the hymns dir/file.

### Modified files

- **[server/index.ts](server/index.ts)** — add `import {hymnsRouter} from './routes/hymns.js'` alongside the other route imports (~line 20-ish); add `app.use('/api/hymns', hymnsRouter)` next to `app.use('/api/quotes', quotesRouter)` (~line 65).
- **[package.json](package.json)** — three scripts next to the quotes DB scripts:
  ```
  "db:hymns:generate": "drizzle-kit generate --config drizzle-hymns.config.ts",
  "db:hymns:migrate":  "drizzle-kit push --config drizzle-hymns.config.ts",
  "db:hymns:studio":   "drizzle-kit studio --config drizzle-hymns.config.ts",
  ```

### Service flow (`runHymnSuggestion`)

1. Resolve model via `getConfiguredModel()`.
2. Load hymns: `SELECT … FROM hymns WHERE (:filter = 'both' OR book = :filter)`. Send all matching rows — no prefilter. With 551 + 101 = 652 rows at ~200 B each, that's ~130 KB, comfortably fits one cached content block. Prompt caching (`cache_control: {type: 'ephemeral'}`) makes repeat calls cheap.
3. Build corpus text (see XML shape below).
4. `anthropic.messages.create({model, max_tokens: 2048, system: SYSTEM_PROMPT, messages: [{role: 'user', content: [corpusBlock_cached, sermonInputsBlock_uncached]}]})`.
5. Parse XML (regex, same approach as [server/services/quote-research.ts:130-151](server/services/quote-research.ts:130)).
6. Drop any `hymn-id` referencing an unknown row (log, don't throw). If required picks are missing (opening, invitation.primary) or flow ≠ 6 steps → throw `AI response malformed`; route returns 500, toast surfaces; **no row inserted on malformed XML**, matching quote-research's behavior.
7. Insert into `hymn_searches` with the full `sections` blob + `rawResponse`. Return `HymnSuggestionResult`.

### TypeScript shape (authoritative)

```ts
type HymnBook = 'burgundy' | 'silver'
type HymnalFilter = 'burgundy' | 'silver' | 'both'

interface HymnPick {
  hymnId: number
  book: HymnBook
  number: number
  title: string
  why: string
  lyricSnippet?: string // <10 words, copied from firstLine/refrainLine
}

interface HymnSuggestionSections {
  opening: HymnPick // exactly 1
  congregational: HymnPick[] // 2-3
  alternate?: HymnPick
  special: HymnPick[] // 1-3
  invitation: {primary: HymnPick; alternate?: HymnPick}
  flow: Array<{
    step: number // 1..6
    slot: 'opening' | 'congregational' | 'special' | 'invitation' | 'other'
    hymnId?: number // omitted for non-musical steps (sermon, prayer)
    label: string
  }>
}

interface HymnSuggestionResult {
  searchId: number
  sections: HymnSuggestionSections
  model: string
  candidateCount: number
  durationMs: number
}
```

### System prompt (abbreviated — full string lives in `hymn-suggestion.ts`)

Return exactly this XML structure — no prose:

```xml
<suggestion>
  <opening hymn-id="N"><why>…</why><snippet>…</snippet></opening>
  <congregational>
    <pick hymn-id="N"><why>…</why><snippet>…</snippet></pick>
    <!-- 2 or 3 pick elements -->
  </congregational>
  <alternate hymn-id="N"><why>…</why></alternate>  <!-- optional, omit entire element if none -->
  <special>
    <pick hymn-id="N"><why>…</why><snippet>…</snippet></pick>
    <!-- 1 to 3 -->
  </special>
  <invitation>
    <primary hymn-id="N"><why>…</why></primary>
    <alt hymn-id="N"><why>…</why></alt>  <!-- optional -->
  </invitation>
  <flow>
    <step n="1" slot="opening" hymn-id="N">Hymn title</step>
    <step n="2" slot="other">Scripture reading and prayer</step>
    <!-- exactly 6 steps; hymn-id omitted for non-musical -->
  </flow>
</suggestion>
```

Rules in the prompt:

- Every `hymn-id` MUST be a numeric id from the provided corpus. Never invent.
- Honor the `hymnalFilter`.
- `<snippet>` must be under 10 words and MUST come from the hymn's `firstLine` or `refrainLine`. Never invent lyrics.
- Openers upbeat/celebratory; invitation matches the appeal.
- Prefer hymns whose `topics` or `scriptureRefs` overlap the sermon's theme/text.

### Corpus text format (one cached block)

```
<hymn id="42" book="burgundy" number="145">
Title: Amazing Grace
FirstLine: Amazing grace, how sweet the sound
Refrain: (none)
Author: John Newton
Composer: Traditional American melody
Tune: NEW BRITAIN
Meter: CM
Topics: grace, salvation, testimony
Scripture: Ephesians 2:8-9, 1 Chronicles 17:16-17
Notes: invitation-suitable
</hymn>
```

Entries joined by a blank line. Style matches [server/services/quote-research.ts:121-128](server/services/quote-research.ts:121).

## Frontend

### Routes (decided)

- `/sermons/hymns` — input + results page (main entry)
- `/sermons/hymns/searches` — saved searches list
- `/sermons/hymns/searches/:id` — detail

These nest cleanly under `sermons` and don't collide with the existing `/sermons/searches` (which is quote searches).

### New files

- **[src/lib/hymns-api.ts](src/lib/hymns-api.ts)** — typed client: `runHymnSuggestion`, `listHymnSearches`, `getHymnSearch`, `deleteHymnSearch`. Re-exports the TS types for page components.
- **[src/pages/sermons/hymns-prep-page.tsx](src/pages/sermons/hymns-prep-page.tsx)** — input form (title, scripture text, theme, audience as `<Textarea>`s/`<Input>`s) + toggle group for `HymnalFilter` defaulting to `both` + Generate button firing `useMutation(runHymnSuggestion)` + recent-search pills (reuses pattern from [src/pages/sermons/quotes-research-page.tsx:112-126](src/pages/sermons/quotes-research-page.tsx:112)) + loading skeleton + `<HymnResultView>` for the response.
- **[src/pages/sermons/hymn-searches-page.tsx](src/pages/sermons/hymn-searches-page.tsx)** — list view. Copy structure from [src/pages/sermons/quote-searches-page.tsx](src/pages/sermons/quote-searches-page.tsx); columns: Title, Date, Theme, Filter, Model.
- **[src/pages/sermons/hymn-search-detail-page.tsx](src/pages/sermons/hymn-search-detail-page.tsx)** — header shows the 4 inputs; body renders `<HymnResultView>` from the stored `sections`.
- **[src/components/hymn-result-view.tsx](src/components/hymn-result-view.tsx)** — shared render component. Six cards (Opening, Congregational, Alternate, Special Music, Invitation, Recommended Flow), each using the existing `<Card>` shadcn primitives. Each `HymnPickCard` shows: `<BookNumberBadge book={...} number={...} />` + title (bold), a **Why:** line, and optional blockquote (serif, left border) with the lyric snippet — reuses the blockquote style from [src/pages/sermons/quotes-research-page.tsx:51-53](src/pages/sermons/quotes-research-page.tsx:51).

### Modified files

- **[src/lib/nav-config.ts](src/lib/nav-config.ts)** — add `Music` to the `lucide-react` import, add two children to the `sermons` group (keep order: quotes existing, then hymns):
  ```ts
  {to: '/sermons/hymns',          label: 'Hymns',        icon: Music, end: true},
  {to: '/sermons/hymns/searches', label: 'Hymn History', icon: History},
  ```
- **[src/App.tsx](src/App.tsx)** — three new routes near the existing `/sermons/*` block (lines 262-266) plus three imports.

### `BookNumberBadge`

Uses shadcn `<Badge>`: Burgundy uses `className="bg-red-900 text-white"`, Silver uses `variant="secondary"`. Keeps visual parity with the physical books.

## Verification

Run from the worktree root unless noted.

1. **PDFs in place.** Drop `data/Burgandy Book.pdf` and `data/Silver Book.pdf`. Verify `.gitignore` excludes `/data` — confirmed at [.gitignore](.gitignore):35.
2. **Create & seed DB.**
   ```
   pnpm db:hymns:migrate                 # creates hymns.db with empty tables
   npx tsx scripts/extract-hymns.ts      # writes data/hymns-seed.json
   npx tsx scripts/load-hymns.ts         # upserts into hymns.db
   sqlite3 hymns.db "SELECT book, COUNT(*) FROM hymns GROUP BY book;"
   ```
   Expect two rows summing ~652.
3. **Lint + format** (per user memory — always):
   ```
   pnpm eslint
   pnpm prettier
   ```
4. **Restart via launchd.** Do NOT run `pnpm dev` manually (per user memory). `launchctl kickstart -k gui/$(id -u)/<plist-label>`.
5. **Smoke test in the UI.** Nav → Sermon Prep → Hymns. Use Tyler's own sample:
   - Title: `God Is Light`
   - Text: `1 John 1:5; Ephesians 5:8`
   - Theme: `God is light, in Him is no darkness, we should be lights shining Jesus to others, hide God's Word in our heart`
   - Audience: `mostly saved`
   - Filter: Both

   Expect six section cards: opening, congregational (2-3), optional alternate, special music (1-3), invitation (primary + optional alt), flow (6 steps). `#449 The Light of the World Is Jesus` should plausibly appear in congregational.

6. **History round-trip.** Open `/sermons/hymns/searches` → new row present → click into detail → same cards render from saved `sections` JSON. Delete → row disappears.
7. **Malformed-XML guard (optional).** Temporarily hardcode a bad model response in the service and confirm no `hymn_searches` row is inserted and the UI toasts the error.

## Critical files to touch

New:

- [server/db-hymns/schema.ts](server/db-hymns/schema.ts)
- [server/db-hymns/index.ts](server/db-hymns/index.ts)
- [server/routes/hymns.ts](server/routes/hymns.ts)
- [server/services/hymn-suggestion.ts](server/services/hymn-suggestion.ts)
- [drizzle-hymns.config.ts](drizzle-hymns.config.ts)
- [scripts/extract-hymns.ts](scripts/extract-hymns.ts)
- [scripts/load-hymns.ts](scripts/load-hymns.ts)
- [src/lib/hymns-api.ts](src/lib/hymns-api.ts)
- [src/pages/sermons/hymns-prep-page.tsx](src/pages/sermons/hymns-prep-page.tsx)
- [src/pages/sermons/hymn-searches-page.tsx](src/pages/sermons/hymn-searches-page.tsx)
- [src/pages/sermons/hymn-search-detail-page.tsx](src/pages/sermons/hymn-search-detail-page.tsx)
- [src/components/hymn-result-view.tsx](src/components/hymn-result-view.tsx)

Modified:

- [server/index.ts](server/index.ts) (router registration)
- [package.json](package.json) (three db:hymns:\* scripts)
- [src/lib/nav-config.ts](src/lib/nav-config.ts) (two nav children + `Music` icon)
- [src/App.tsx](src/App.tsx) (three routes + three imports)

Reused existing utilities:

- [server/services/quote-research.ts](server/services/quote-research.ts) — template for the service (corpus builder, prompt caching, parse, rehydrate, model resolution)
- [server/lib/route-helpers.ts](server/lib/route-helpers.ts) — `asyncHandler`
- [src/pages/sermons/quotes-research-page.tsx](src/pages/sermons/quotes-research-page.tsx) — template for the prep page UI
- [src/pages/sermons/quote-searches-page.tsx](src/pages/sermons/quote-searches-page.tsx) — template for the history page
- Existing settings row `defaultAiModel` — read via a duplicated 8-line `getConfiguredModel()`
