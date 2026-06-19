# Sermons › Quote Research — Music Lyric Search

## Context

The quote research feature (`/sermons/research`) finds quotable material from
Pastor Tyler's quote corpus for use in bulk SMS messages. This plan extends it
so a search can **also** return song lyrics (verses/choruses) from the burgundy
and silver hymnals on the same topic — quotable lyric excerpts to paste into a
message.

Key framing reached during design: **a lyric is "a quote of a song."** A single
search now has two sources, each gated by a toggle (both on by default): the
**quote portion** (existing DB + AI synthesis) and the **music portion** (song
lyric excerpts sourced via web search). At least one portion is required; a
search may be quotes-only, music-only, or both.

Domain terms are in [CONTEXT.md](../CONTEXT.md) (**Quote search**, **Song lyric
quote**, **Quote library**). The lyric-sourcing strategy is recorded in
[docs/adr/0010-music-lyric-source.md](../docs/adr/0010-music-lyric-source.md).

This is the **first tool-using AI call in the codebase** — every existing call
(`quote-research.ts`, `hymn-suggestion.ts`, `devotion-generation.ts`) is a plain
text/XML completion. The music portion uses Claude's server-side web search tool.

### Locked-in decisions

| Decision        | Choice                                                                                                                                                                                                                                   |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lyric source    | AI selects relevant hymns from stored `hymns` metadata, then fetches real lyrics via **Claude web search**; verify fetched first line against stored `first_line`. Unverified results are **kept + flagged**, not dropped. See ADR 0010. |
| Future PDF path | Source is swappable behind one service fn + a stable `MusicResult` contract. When hymnal PDFs exist, extract full lyrics into `hymns` and the music search mirrors quote research (corpus, no web search). Not built now.                |
| Result shape    | 3–8 songs (fewer if fewer fit — no padding). Each: book+number, title, author, **relevant stanza excerpt** (whole verses/choruses only), why-note, relevance high/med/low, `verified` flag, `sourceUrl`.                                 |
| Book filter     | None in v1 — always search both burgundy + silver.                                                                                                                                                                                       |
| Storage         | Extend `quote_searches`: `synthesis`/`results` become **nullable**; add nullable `music_results` (self-contained JSON blob), `music_model`, `music_searched_at`, `music_duration_ms`.                                                    |
| Execution       | Two-phase. `POST /research` runs quotes inline + returns. Music runs via `POST /searches/:id/music` — the **same** endpoint the "Add music" button uses.                                                                                 |
| Add later (#3)  | Bidirectional. Quotes-only search → "Search music" CTA; music-only → "Search quotes" CTA. Each fills the missing portion of the existing row.                                                                                            |
| Notification    | Plain sonner toast ("Lyrics ready — N songs") fired from the research page on music success. No app-level runner — navigating away forgoes the toast.                                                                                    |
| Results UI      | Two tabs (`Quotes (N)` / `Lyrics (N)`), both always present. Synthesis inside Quotes tab. Empty states with CTAs. Lyrics has two empty states: "not searched" (CTA) vs "found nothing".                                                  |
| Copy            | Songs only (quotes have none). Copies book + number + title + excerpt; `toast.success('Copied')`.                                                                                                                                        |
| Re-run          | Reproduces the original's portion set as a new saved search.                                                                                                                                                                             |
| #1 removal      | Remove the "Recent:" pills + `recentSearches` query on the research page; the topic input + two toggles + Search button live there instead.                                                                                              |
| History list    | Per-row chips (`Quotes` / `Lyrics`) indicating which portions exist.                                                                                                                                                                     |
| Toggle defaults | Both on every visit; not persisted.                                                                                                                                                                                                      |

---

## Data model

Extend `server/db/schema-quotes.ts` `quoteSearches` table:

```ts
export const quoteSearches = sqliteTable('quote_searches', {
  id: integer('id').primaryKey({autoIncrement: true}),
  topic: text('topic').notNull(),
  synthesis: text('synthesis'), // was .notNull() — now nullable (music-only)
  results: text('results'), // was .notNull() — now nullable (music-only)
  model: text('model'), // was .notNull() — now nullable (quote model; music uses music_model)
  candidateCount: integer('candidate_count'), // was .notNull() — now nullable
  durationMs: integer('duration_ms'), // was .notNull() — now nullable
  // NEW — music portion (self-contained; lyrics aren't in the DB so can't rehydrate)
  musicResults: text('music_results'), // JSON: MusicResult[] | null (null = music not searched)
  musicModel: text('music_model'),
  musicSearchedAt: text('music_searched_at'),
  musicDurationMs: integer('music_duration_ms'),
  createdAt: text('created_at').default(sql`(datetime('now', 'localtime'))`),
})
```

`MusicResult` (stored JSON shape, source-agnostic per ADR 0010):

```ts
interface MusicResult {
  book: 'burgundy' | 'silver'
  number: number
  title: string
  author: string | null
  relevantLyrics: string // whole verse(s)/chorus(es) that fit the topic
  note: string // why it fits
  relevance: 'high' | 'medium' | 'low'
  source: 'web' | 'corpus' // 'web' now; 'corpus' = future PDF path
  verified: boolean // fetched first line matched stored hymns.first_line
  sourceUrl?: string // web path only
}
```

**Migration:** `pnpm db:generate` then `pnpm db:migrate`. Making columns nullable
is non-destructive (no data loss) — existing rows keep their quote data and have
`music_results IS NULL` (= "music not searched"). Follow [RUNBOOK.md](../RUNBOOK.md)
ordering (stop service before migrate). There is no dev DB — production is the only DB.

---

## Backend

### New service: `server/services/music-search.ts`

Mirrors the structure of `quote-research.ts`. One exported function whose
internals are the swappable lyric source (ADR 0010):

```ts
export async function runMusicSearch(topic: string): Promise<MusicResult[]>
```

Flow (web path):

1. Load hymn metadata corpus from `hymns` (all rows; small corpus ~650). Reuse
   the column set from `hymn-suggestion.ts`'s corpus builder: `id, book, number,
title, first_line, refrain_line, author, topics, scripture_refs, notes`.
2. Build an XML/text corpus block (cached via `cache_control: {type: 'ephemeral'}`,
   same pattern as `quote-research.ts:188`).
3. One `client.messages.create` call with:
   - `model` from `getConfiguredModel()` (`settings.defaultAiModel`, reuse the
     helper pattern in `quote-research.ts:47`).
   - `tools: [{type: 'web_search_20250305', name: 'web_search', max_uses: <~8>}]`
     — **verify the exact tool version string against the installed
     `@anthropic-ai/sdk` (0.103) at build time.**
   - System prompt instructing: pick 3–8 genuinely-relevant hymns from the
     corpus by `id`; for each, web-search the full lyrics keyed on title +
     author + first line; return only the verse(s)/chorus(es) that fit the
     topic (whole stanzas, never partial lines); output strict XML with
     `id, relevance, note, lyrics, sourceUrl`.
4. Parse the XML response. For each returned hymn `id`, look up the stored row
   (drop unknown ids, like `hymn-suggestion.ts` validation).
5. **Verify:** compare the fetched lyrics' first line against the stored
   `hymns.first_line` (normalized). Set `verified` accordingly. Keep unverified
   results (don't drop).
6. Map to `MusicResult[]` with `source: 'web'`.

Return value is stored by the route (self-contained — no rehydration needed).

### Routes: `server/routes/quotes.ts`

1. **`POST /research`** (existing, line 119): accept `{topic, includeQuotes?, includeMusic?}`
   (both default `true`). Validate **at least one** is true (400 otherwise).
   - If `includeQuotes`: run `runQuoteResearch(topic)` (existing) — inline.
   - If `!includeQuotes` (music-only): insert a `quote_searches` row with `topic`
     only (quote columns null) and return `{searchId, synthesis: null, results: []}`.
   - Music is **not** run here — client fires phase 2 next. Response includes
     `searchId` so the client can call the music endpoint.
   - Note: `runQuoteResearch` currently inserts the row itself. For music-only,
     add a small insert path (or refactor `runQuoteResearch` to accept a
     pre-created id — simplest: keep quote insert as-is, add a separate insert
     for the music-only case).

2. **`POST /searches/:id/music`** (NEW): runs `runMusicSearch(topic)` for the
   search's topic, `UPDATE quote_searches SET music_results=?, music_model=?,
music_searched_at=datetime('now','localtime'), music_duration_ms=?`. Returns
   `{musicResults: MusicResult[]}`. 404 if the search id doesn't exist. This is
   used both by the create-time auto-fire AND the "Add music" button (#3).

3. **`POST /searches/:id/quotes`** (NEW, symmetric): runs the quote portion for
   an existing music-only search and fills `synthesis`/`results`/`model`/
   `candidate_count`/`duration_ms`. Used by the "Add quotes" CTA.

4. **`GET /searches`** (line 25): add `music_results IS NOT NULL AS hasMusic` and
   `(results IS NOT NULL) AS hasQuotes` (and keep `resultCount`) to power the
   row chips. `json_array_length(results)` must tolerate NULL → guard with
   `CASE WHEN results IS NULL THEN 0 ELSE json_array_length(results) END`.

5. **`GET /searches/:id`** (line 69): include `music_results` (parsed) alongside
   the rehydrated quote portion. `rehydrateSearch` in `quote-research.ts` must
   tolerate `synthesis`/`results` being null (music-only) — return
   `synthesis: null, results: []` in that case, plus pass through `musicResults`.

---

## Frontend

### API client: `src/lib/quotes-api.ts`

- Add `MusicResult` interface (matches the stored shape above).
- Extend `ResearchResult`, `QuoteSearchDetail` with `musicResults: MusicResult[] | null`
  and make `synthesis` nullable.
- `runResearch(topic, {includeQuotes, includeMusic})` — pass toggles.
- `runMusicSearch(searchId)` → `POST /quotes/searches/:id/music`.
- `runQuotesForSearch(searchId)` → `POST /quotes/searches/:id/quotes`.
- Extend `QuoteSearch` (list row) with `hasQuotes: boolean; hasMusic: boolean`.

### Shared component: `src/components/sermons/lyric-result-view.tsx` (NEW)

Renders `MusicResult[]`. Reuse the `BookNumberBadge` from
`src/components/hymn-result-view.tsx:6` (extract it to a shared module or
re-export). Each card: badge + title + author, `RelevanceBadge` (reuse the
quotes one), "Why" note, the lyric excerpt in a `font-serif` blockquote (matches
`hymn-result-view.tsx:39`), an **"unverified — check the book"** badge when
`!verified`, a source-URL link, and a **Copy** button:

```ts
const text = `${book === 'burgundy' ? 'Burgundy' : 'Silver'} #${number} — ${title}\n\n${relevantLyrics}`
navigator.clipboard.writeText(text)
toast.success('Copied')
```

### Research page: `src/pages/sermons/quotes-research-page.tsx`

- **Remove** the `recentSearches` query (lines 72–75) and the "Recent:" pills
  block (lines 112–126). Keep/adjust the example-topics empty state.
- Add **two toggles** (Quotes, Music — both default on) next to the topic input.
  Use the existing checkbox/switch UI component. Disable Search when both off or
  topic empty.
- `submit()`: call `runResearch(topic, {includeQuotes, includeMusic})`. On
  success set `result`. If `includeMusic`, immediately fire the music mutation
  against `result.searchId`; on its success, merge `musicResults` into state and
  `toast.success('Lyrics ready — N songs')` (or "found nothing" / "N unverified").
- Wrap results in **`Tabs`** (`src/components/ui/tabs.tsx`): `Quotes (N)` and
  `Lyrics (N)`. Synthesis card + quote `ResultCard`s in the Quotes tab; the new
  `LyricResultView` in the Lyrics tab. While music mutation `isPending`, Lyrics
  tab shows a spinner. Default tab: Quotes if present else Lyrics.

### Detail page: `src/pages/sermons/quote-search-detail-page.tsx`

- Same `Tabs` layout fed by `getSearch(id)` (now includes `musicResults`).
- **Empty-state CTAs** (request #3, bidirectional):
  - Lyrics tab when `musicResults === null` → "Search music for this topic"
    button → `runMusicSearch(id)`, then refetch + toast.
  - Quotes tab when `results` empty/null → "Search quotes for this topic" →
    `runQuotesForSearch(id)`, then refetch.
  - Lyrics tab when `musicResults` is `[]` → "No songs found for this topic"
    (no CTA — it was searched).
- Re-run (line 88): call `runResearch(data.topic, {includeQuotes: hasQuotes,
includeMusic: hasMusic})` so it reproduces the original's portion set; for the
  both/music case, fire the music phase against the new `searchId` after navigate.

### History list: `src/pages/sermons/quote-searches-page.tsx`

- Add `Quotes` / `Lyrics` chips per row from `hasQuotes` / `hasMusic`.

---

## Phased delivery (vertical slices)

1. **Schema + migration.** Nullable quote columns + music columns. `db:generate`
   / `db:migrate`. Verify existing searches still load (music null).
2. **Music search service + endpoint.** `music-search.ts` (web search tool) +
   `POST /searches/:id/music`. Test via curl against a real search id; confirm
   real lyrics + verified flags come back.
3. **Research page two-phase + tabs + toggles + #1 removal.** Quotes inline,
   music streams into Lyrics tab, toast on done.
4. **Detail page tabs + bidirectional Add CTAs (#3) + symmetric quotes endpoint.**
5. **Copy button + unverified badge + source link.**
6. **History chips + re-run portion-set reproduction.**

---

## Verification checklist

- [ ] `pnpm lint` (ESLint + tsc for app + server) clean; `pnpm prettier` applied.
- [ ] Existing quotes-only searches still open (music tab shows "not searched" CTA).
- [ ] Both-on search: quotes appear immediately; lyrics arrive later with toast.
- [ ] Music-only search (quotes toggle off) creates a row, Quotes tab shows
      "Search quotes" CTA.
- [ ] Both toggles off → Search disabled and API rejects.
- [ ] Web-search lyrics are real; unverified ones are flagged, not dropped;
      source URL present.
- [ ] Copy button copies `Book #N — Title` + excerpt; toast fires.
- [ ] Re-run reproduces the original's portion set as a new search.
- [ ] History rows show correct `Quotes` / `Lyrics` chips.
- [ ] CONTEXT.md + ADR 0010 still accurate to what shipped.

## Notes / risks

- **Web search tool version string** — confirm against installed SDK; this is
  net-new (no prior tool use in the repo). Handle the case where the model
  returns no `sourceUrl` (mark unverified).
- **Latency/cost** — the music half makes live web searches; the quote half is
  unaffected. Two-phase keeps quotes fast.
- **Version mismatch** — online lyrics may differ from the physical hymnal
  arrangement; the `verified` flag + user review before sending is the mitigation
  (ADR 0010). Full-hymn lookup is out of scope (user reads the book).
