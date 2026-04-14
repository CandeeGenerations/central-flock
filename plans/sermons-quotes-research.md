# Sermons › Quotes — AI Topic Research

`claude --resume 72358e01-91a6-4155-8907-89a68fa88516`

## Context

Pastor Tyler Candee has a growing corpus of ~166 collected quotes (theologians,
pastors, scripture) currently captured by n8n automation into the private repo
`cgen01/tscandeequotes`. Each file is a markdown document with YAML frontmatter,
a `## Summary`, a `## Quote`, and a `## Metadata` section with hashtags.

Today, to find a quote for a sermon, the only way is to ask Claude Code against
that repo — clever, but requires opening a terminal and leaves no lasting UI in
his main workflow. The goal is to bring the corpus **into Central Flock** as a
first-class "Sermons" tool. The feature set:

1. **Browse + manage quotes** — a Quotes table (like People) with server-side
   pagination, search, author/date filters, and Add/Edit/Delete dialogs.
2. **AI topic research** — enter a topic ("God is Light", "power of Christ"),
   get back an AI-curated synthesis plus a ranked list of relevant quotes.
3. **Search history** — every AI research run is saved; previous searches and
   their results are browsable from a dedicated page and surfaced on the
   research page as "recent searches".

### Locked-in decisions (from discussion)

| Decision                      | Choice                                                                                                                                                                                                                    |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Nav                           | New top-level group **"Sermons"** with children: **Quotes** (`/sermons/quotes`), **Research** (`/sermons/research`), **Search History** (`/sermons/searches`)                                                             |
| UI style                      | Reuses existing patterns: People-table style for Quotes; edit-person-style form for Add/Edit Quote                                                                                                                        |
| Webhook ingress               | **n8n → `cgen-api` → Central Flock** (cgen-api is the existing X-API-Key gateway already wired to n8n; it proxies to Central Flock's internal webhooks on `localhost:5172`)                                               |
| cgen-api ↔ Central Flock auth | Single shared header `X-Internal-Secret: $CENTRAL_FLOCK_INTERNAL_SECRET` — **generalized** so any future cgen-api → Central Flock tool (not just quotes) uses the same secret + middleware. Quotes is the first consumer. |
| Source-of-truth               | Central Flock's new `quotes.db` SQLite file                                                                                                                                                                               |
| Manual authoring              | New quotes can be added and existing quotes edited from the Central Flock UI (source='manual')                                                                                                                            |
| Bootstrapping                 | One-time import of existing 166 quotes from the repo via a CLI script (uses local `gh` auth — no PAT in env)                                                                                                              |
| Author parsing                | True author is extracted from `◇ <Author Name>` citation line in the quote body, NOT YAML frontmatter (which always reads "Dr. Arthur Maricle" — the capture author)                                                      |
| AI model setting              | Rename existing `devotionAiModel` → `defaultAiModel`; idempotent boot-time SQL migration; shared by Devotions and Quote Research                                                                                          |
| Corpus scaling                | FTS5 virtual table + tag-map prefilter; below ~300 quotes send all to AI, above that prefilter to top 100 candidates                                                                                                      |
| Search history                | Every AI research run persists synthesis + results; Research page shows recent pills; dedicated `/sermons/searches` page lists full history with detail view                                                              |

---

## Architecture

```
┌──────────┐  POST /webhooks/quotes     ┌─────────────┐  POST /webhooks/quotes
│   n8n    │ ─────────────────────────▶ │   cgen-api  │ ──────────────────────▶ ┌──────────────────┐
│ (capture)│  X-API-Key: <n8n secret>   │ (port 5180) │  localhost:5172         │  Central Flock   │
└──────────┘                            │             │  X-Internal-Secret      │     server       │
                                        └─────────────┘  (shared for all         │                  │
                                                         cgen-api → CF tools)    │                  │
                                                                                │  quotes.db       │
                                                                                │  (SQLite + FTS5) │
                                                                                └────────┬─────────┘
                                                                                         │
                                                                        POST /api/quotes/research
                                                                                         │
                                                                                         ▼
                                                                                ┌──────────────────┐
                                                                                │ quote-research   │
                                                                                │ service          │
                                                                                │  • prefilter     │
                                                                                │    (FTS5 + tags) │
                                                                                │  • Anthropic SDK │
                                                                                │  • prompt cache  │
                                                                                │  • XML parse     │
                                                                                │  • persist search│
                                                                                └──────────────────┘
```

- **n8n → cgen-api**: already working via X-API-Key (no changes to that link).
- **cgen-api → Central Flock**: new thin passthrough route; no DB or parsing
  in cgen-api. It validates its X-API-Key, forwards the JSON body to
  `http://localhost:5172/webhooks/quotes` with the `X-Webhook-Secret` header,
  and returns the response verbatim.
- **One-time seed**: `pnpm tsx scripts/import-quotes.ts` pulls 166 markdown
  files from the repo (via `gh api`), parses them with the same parser the
  webhook uses, and bulk-inserts into `quotes.db`. After that the repo is no
  longer needed by the app.

---

## Author parsing strategy

The YAML `author` field is always "Dr. Arthur Maricle" — he's the **capture
author**, not the quote's originator. The real author lives in a `◇`-prefixed
line near the end of `## Quote`. Examples:

```
◇ Miguel de Cervantes, "Don Quixote"
◇ Dr. Arthur Maricle (follow on X: @DrMaricle)
◇ Dr. Jerry Scheidbach, Pastor of Lighthouse Baptist Church of Santa Maria, California
◇ Pastor Melito Barrera (Berean Bible Baptist Church of Chula Vista, CA)
◇ Missionary Lawrence Bowman (El Salvador) in his book, Confessions: A Memoir of Hope for the Suffering
◇ Pastor Dale Seaman, Calvary Baptist Church of Porterville, California
```

### Extraction function (shared parser)

```ts
// Returns the cited author's display name ("Miguel de Cervantes",
// "Dr. Jerry Scheidbach", "Pastor Melito Barrera", …) or null if no ◇ line.
export function extractCitedAuthor(quoteText: string): string | null {
  const lines = quoteText.split('\n')
  // Scan bottom-up — the attribution line is usually at the end.
  for (let i = lines.length - 1; i >= 0; i--) {
    const m = lines[i].match(/^\s*◇\s*(.+?)\s*$/)
    if (!m) continue
    const after = m[1]
    // Cut at the first comma or open paren (strips affiliations / source books).
    const cut = after.search(/[,(]/)
    return (cut === -1 ? after : after.slice(0, cut)).trim()
  }
  return null
}
```

### Final `author` field resolution

For every incoming quote (from n8n, from the import script, or from manual
creation):

1. Run `extractCitedAuthor(quoteText)`. If it returns non-null, use it.
2. Otherwise fall back to the YAML/webhook-provided `author` value.
3. For completeness, always record the raw YAML/webhook author in a separate
   `capturedBy` column so we never lose provenance.

This means the Quotes table `author` column is ready-to-display ("Miguel de
Cervantes") instead of being uniformly "Dr. Arthur Maricle" and we keep full
fidelity to what n8n actually sent.

---

## Database

**New SQLite file at repo root:** `quotes.db` (follows devotions/nursery
sub-app pattern, e.g. `server/db-devotions/index.ts:9`).

**Schema** (`server/db-quotes/schema.ts`):

```ts
quotes {
  id:           integer PK auto
  externalId:   text unique NOT NULL      // stable ID; idempotent upsert key
  title:        text NOT NULL
  author:       text NOT NULL             // cited author (from ◇ line, fallback YAML)
  capturedBy:   text NOT NULL             // raw YAML/webhook author (provenance)
  capturedAt:   text NOT NULL             // ISO 8601 if we can parse, else raw
  dateDisplay:  text NOT NULL             // free-form "Apr 13, 2026 at 14:01"
  summary:      text NOT NULL
  quoteText:    text NOT NULL             // preserves newlines / citations / ◇
  tags:         text NOT NULL             // JSON array of strings
  source:       text NOT NULL             // 'n8n' | 'import' | 'manual'
  createdAt:    text default (datetime('now'))
  updatedAt:    text default (datetime('now'))
}

quoteSearches {
  id:             integer PK auto
  topic:          text NOT NULL           // user's input, e.g. "power of Christ"
  synthesis:      text NOT NULL           // AI-generated paragraph
  results:        text NOT NULL           // JSON: [{quoteId, note, relevance}]
  model:          text NOT NULL           // model used (snapshot)
  candidateCount: integer NOT NULL        // how many quotes were sent to AI
  durationMs:     integer NOT NULL        // end-to-end latency
  createdAt:      text default (datetime('now'))
}
```

**FTS5 virtual table** (raw-SQL migration; Drizzle ignores it but we create it
in a hand-written migration step for the prefilter):

```sql
CREATE VIRTUAL TABLE quotes_fts USING fts5(
  title, author, summary, quote_text, tags,
  content='quotes', content_rowid='id',
  tokenize='porter unicode61'
);

-- Triggers to keep FTS in sync with quotes
CREATE TRIGGER quotes_ai AFTER INSERT ON quotes BEGIN
  INSERT INTO quotes_fts(rowid, title, author, summary, quote_text, tags)
  VALUES (new.id, new.title, new.author, new.summary, new.quoteText, new.tags);
END;
CREATE TRIGGER quotes_ad AFTER DELETE ON quotes BEGIN
  INSERT INTO quotes_fts(quotes_fts, rowid, title, author, summary, quote_text, tags)
  VALUES ('delete', old.id, old.title, old.author, old.summary, old.quoteText, old.tags);
END;
CREATE TRIGGER quotes_au AFTER UPDATE ON quotes BEGIN
  INSERT INTO quotes_fts(quotes_fts, rowid, title, author, summary, quote_text, tags)
  VALUES ('delete', old.id, old.title, old.author, old.summary, old.quoteText, old.tags);
  INSERT INTO quotes_fts(rowid, title, author, summary, quote_text, tags)
  VALUES (new.id, new.title, new.author, new.summary, new.quoteText, new.tags);
END;
```

Indexes on `quotes(author)`, `quotes(createdAt)`, `quoteSearches(createdAt)`.

**Config file:** `drizzle-quotes.config.ts` at repo root (mirror
`drizzle-devotions.config.ts`). Add package scripts:
`db:quotes:generate`, `db:quotes:migrate`, `db:quotes:studio`.

### Settings rename: `devotionAiModel` → `defaultAiModel`

The existing `devotionAiModel` key in `central-flock.db` / `settings` becomes
`defaultAiModel` so it reads naturally as "the default AI model, shared across
AI features" — used by both Devotions and the new Quote Research service.

**Migration approach** (idempotent boot-time SQL in `server/db/index.ts` or a
dedicated startup hook in `server/index.ts`):

```sql
UPDATE settings SET key='defaultAiModel'
  WHERE key='devotionAiModel'
    AND NOT EXISTS (SELECT 1 FROM settings WHERE key='defaultAiModel');

-- Clean up the old key if it somehow coexists with the new one
DELETE FROM settings WHERE key='devotionAiModel';
```

Code changes required:

- `server/routes/settings.ts` — rename `devotionAiModel` in the `DEFAULTS` dict
  (line 9-16) and in `VALID_VALUES` (line 18-20) to `defaultAiModel`. Update
  any API consumer to send/receive the new key.
- `server/services/devotion-generation.ts:35-42` — `getConfiguredModel()` now
  reads `defaultAiModel`.
- `src/pages/settings-page.tsx` (and any other UI that reads/writes the key) —
  update field name + label to "Default AI model".
- Any tests referencing the old key name.

No data is lost; no user action required. The rename is safe to ship in one
deploy because the boot-time SQL runs before any HTTP traffic.

---

## Backend — Central Flock

### Files to create

| File                                           | Purpose                                                                                           |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `server/db-quotes/schema.ts`                   | Drizzle schema (quotes + quoteSearches)                                                           |
| `server/db-quotes/index.ts`                    | DB bootstrap (copy of `server/db-devotions/index.ts`, path → `quotes.db`)                         |
| `server/db-quotes/migrations/0000_init.sql`    | Auto-gen by drizzle-kit                                                                           |
| `server/db-quotes/migrations/0001_fts.sql`     | Hand-written: FTS5 table + triggers                                                               |
| `server/routes/quotes.ts`                      | Express router (CRUD + research + search-history)                                                 |
| `server/routes/quotes-webhook.ts`              | Quote-specific sub-router mounted under the shared `/webhooks` tree                               |
| `server/routes/webhooks.ts`                    | Parent `/webhooks` router: applies `requireInternalSecret` once, mounts each tool's sub-router    |
| `server/middleware/require-internal-secret.ts` | Shared middleware for `X-Internal-Secret` (reusable for any future cgen-api → Central Flock tool) |
| `server/services/quote-parser.ts`              | Shared markdown → Quote parser; exports `extractCitedAuthor`, `parseQuoteMarkdown`                |
| `server/services/quote-research.ts`            | Prefilter + Anthropic call + XML parse + persist                                                  |
| `scripts/import-quotes.ts`                     | One-time CLI bulk import from GitHub via `gh api`                                                 |
| `drizzle-quotes.config.ts`                     | Drizzle Kit config                                                                                |

### Routes

The webhook endpoint is mounted **outside** `/api` to bypass session auth
(gated by the shared `requireInternalSecret` middleware instead).

| Method   | Path                       | Auth                | Purpose                                                                                                  |
| -------- | -------------------------- | ------------------- | -------------------------------------------------------------------------------------------------------- |
| `POST`   | `/webhooks/quotes`         | `X-Internal-Secret` | Ingest quote from cgen-api (upsert by `externalId`)                                                      |
| `GET`    | `/api/quotes`              | session             | Paginated list — supports `?page`, `?pageSize`, `?q`, `?author`, `?dateFrom`, `?dateTo`, `?sort`, `?dir` |
| `GET`    | `/api/quotes/authors`      | session             | Distinct author list (for filter dropdown)                                                               |
| `GET`    | `/api/quotes/:id`          | session             | Single quote detail                                                                                      |
| `POST`   | `/api/quotes`              | session             | Manual create (source='manual'; generates `externalId` server-side)                                      |
| `PATCH`  | `/api/quotes/:id`          | session             | Edit an existing quote                                                                                   |
| `DELETE` | `/api/quotes/:id`          | session             | Delete a quote (also cascades FTS via trigger)                                                           |
| `POST`   | `/api/quotes/research`     | session             | Run AI topic research; persists a `quoteSearches` row; returns `{searchId, synthesis, results}`          |
| `GET`    | `/api/quotes/searches`     | session             | Paginated recent searches (topic + createdAt + quoteCount)                                               |
| `GET`    | `/api/quotes/searches/:id` | session             | Single search detail — rehydrates results by joining stored `quoteId`s back to current quotes            |

Mount in `server/index.ts`:

- `app.use('/webhooks', webhooksRouter)` **before** `app.use('/api', requireAuth)` at line 38
- `app.use('/api/quotes', quotesRouter)` near line 54 (after auth)

`webhooksRouter` is a single parent router that applies
`requireInternalSecret` middleware once and mounts each tool's sub-router
(`webhooksRouter.use('/quotes', quotesWebhookRouter)`). Future cgen-api
integrations just add another sub-router under `/webhooks/<tool>` and
inherit the same auth — no new secret or middleware wiring needed.

### Shared internal-auth middleware

`server/middleware/require-internal-secret.ts`:

```ts
export function requireInternalSecret(req, res, next) {
  const expected = process.env.CENTRAL_FLOCK_INTERNAL_SECRET
  if (!expected) return res.status(500).json({error: 'internal secret not configured'})
  if (req.header('X-Internal-Secret') !== expected) {
    return res.status(401).json({error: 'invalid internal secret'})
  }
  next()
}
```

Use it in the parent `webhooksRouter`:

```ts
const webhooksRouter = Router()
webhooksRouter.use(requireInternalSecret)
webhooksRouter.use('/quotes', quotesWebhookRouter)
// future: webhooksRouter.use('/<next-tool>', nextToolWebhookRouter)
```

### Webhook request body

```json
{
  "externalId": "2026-04-13T18-12-00-167Z-dr-arthur-maricle-quote",
  "title": "Edification",
  "author": "Dr. Arthur Maricle",
  "dateCaptured": "Apr 13, 2026 at 14:01",
  "summary": "Preparation is essential to success...",
  "quoteText": "A man prepared has half fought the battle.\n◇ Miguel de Cervantes, \"Don Quixote\"",
  "tags": ["Preparation", "Planning", "Wisdom"]
}
```

Webhook handler logic (secret is already validated by
`requireInternalSecret` on the parent router — the handler itself only
deals with the body):

1. Validate body shape with a small zod schema (or hand-rolled).
2. Run `extractCitedAuthor(body.quoteText)` → `resolvedAuthor`. Fall back to
   `body.author` if null.
3. Upsert on `externalId` (Drizzle `onConflictDoUpdate`), storing
   `author=resolvedAuthor`, `capturedBy=body.author`.
4. Respond `{ok: true, id, created: boolean}`.

### Environment variables (add to `.env.example`)

```
# Shared secret for cgen-api → Central Flock internal webhooks
# (used by all /webhooks/* routes; not quote-specific)
CENTRAL_FLOCK_INTERNAL_SECRET=
```

`ANTHROPIC_API_KEY` is already in use by `server/services/devotion-generation.ts:140`.

### AI research flow (`server/services/quote-research.ts`)

Hybrid scaling — prefilter for large corpora; send all for small ones.

```ts
const PREFILTER_THRESHOLD = 300 // below this, send everything

async function research(topic: string): Promise<ResearchResult> {
  const start = Date.now()
  const model = getConfiguredModel() // reads 'defaultAiModel'
  const total = countQuotes()

  const candidates = total <= PREFILTER_THRESHOLD ? loadAllQuotes() : prefilterCandidates(topic, 100) // FTS5 + tag map, top 100 by combined score

  const {synthesis, results} = await callAnthropic(topic, candidates, model)

  // Persist search history
  const searchId = insertSearch({
    topic,
    synthesis,
    results: JSON.stringify(results),
    model,
    candidateCount: candidates.length,
    durationMs: Date.now() - start,
  })

  return {searchId, synthesis, results, candidates: candidates.length}
}
```

### Prefilter implementation

```ts
function prefilterCandidates(topic: string, limit: number): Quote[] {
  // 1. Tokenize topic → FTS5 query string with ORs for robustness
  //    "power of Christ" → 'power OR christ'  (stopwords dropped)
  const ftsQuery = toFtsQuery(topic)

  // 2. Full-text scores (FTS5 bm25)
  const ftsHits = db.all(sql`
    SELECT rowid AS id, bm25(quotes_fts) AS score
    FROM quotes_fts
    WHERE quotes_fts MATCH ${ftsQuery}
    ORDER BY score LIMIT 200
  `) // lower bm25 = better match

  // 3. Tag overlap boost — count how many tags share a token with the topic
  //    (simple Jaccard-ish; normalized into [0,1]).
  //    Combine: finalScore = α * ftsRank + β * tagBoost

  // 4. Return top `limit` ids, then fetch full rows in one query.
}
```

Caveats:

- `bm25()` returns "smaller is better"; normalize or negate before combining.
- Stopword list kept short and hand-picked (the/of/and/on/to/a/is/in/for).
- If FTS finds fewer than `limit` hits, pad with most-recent quotes so the AI
  still gets a reasonable sample.
- The `PREFILTER_THRESHOLD` is a single constant; easy to tune.

### Prompt shape (for Anthropic SDK)

Pattern mirrors `server/services/devotion-generation.ts`:

- `system`: instructions only (small; not cached).
- `messages[0].content`:
  - Block 1: large `text` block with all candidate quotes, marked
    `cache_control: {type: 'ephemeral'}`.
  - Block 2: small `text` block with the user's topic.
- Response format: strict XML — `<synthesis>` + `<results><result .../></results>`.

```
SYSTEM:
You help Pastor Tyler Candee find sermon quotes from his personal corpus.
Return exactly this XML:
<synthesis>2-4 sentences weaving the selected quotes into a framing for the topic</synthesis>
<results>
  <result id="42" relevance="high" note="one-line reason this quote fits"/>
  ...
</results>
Rules: include 3-10 quotes ranked most-relevant-first; only include genuinely
related quotes; notes should describe the unique angle.

USER (cached block):
<quote id="1">
Title: ...
Author: ...  (cited author, not capture-author)
Date: ...
Summary: ...
Text: ...
Tags: a, b
</quote>
<quote id="2">…

USER (not cached): Topic: power of Christ
```

Parse `<synthesis>` and each `<result id="..." relevance="..." note="..."/>`
via regex (same style as `parseResponse` in `devotion-generation.ts:97`). Join
`result.id` → local DB row → return enriched objects.

Cache TTL is 5 min; pastor doing serial searches reuses the cache at a
fraction of the per-token cost (especially valuable for the prefilter-off
"all quotes" path).

---

## Backend — cgen-api (webhook proxy)

`cgen-api` already authenticates n8n via `X-API-Key`, so we use it to front
the new quote webhook and avoid giving n8n a second independent secret.
cgen-api stays a **thin router**: no DB, no parsing, no business logic.

The forwarding layer is built **generically** so future tools (not just
quotes) only need a new route file that reuses the same shared client —
one secret, one `fetch` wrapper, one set of env vars.

### Files to create in `~/repos/cgen/cgen-api`

| File                            | Purpose                                                                                                                                                                                                                          |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/services/central-flock.ts` | **Shared** `fetch` wrapper: `postToCentralFlock(path, body)` sets `X-Internal-Secret` and `Content-Type`, posts to `${CENTRAL_FLOCK_BASE_URL}${path}`, returns the Central Flock response verbatim. Reused by every future tool. |
| `src/routes/quotes.ts`          | `POST /webhooks/quotes` — validates body shape lightly, calls `postToCentralFlock('/webhooks/quotes', body)`                                                                                                                     |

### Behavior

1. n8n already hits cgen-api with its existing `X-API-Key`. The existing
   middleware validates that key — reuse it unchanged.
2. Body validation: just that `externalId`, `title`, `summary`, `quoteText`,
   `tags` are present (cgen-api doesn't know/care about the domain; Central
   Flock does the real validation).
3. Forward via `postToCentralFlock('/webhooks/quotes', body)` which sets:
   - `Content-Type: application/json`
   - `X-Internal-Secret: process.env.CENTRAL_FLOCK_INTERNAL_SECRET`
4. Return the response body/status code verbatim to n8n so errors surface.

### Environment variables (add to cgen-api `.env.example` and launchd plist)

```
# Base URL for the Central Flock app (localhost on the same Mac)
CENTRAL_FLOCK_BASE_URL=http://localhost:5172

# Shared secret for any cgen-api → Central Flock internal call
CENTRAL_FLOCK_INTERNAL_SECRET=
```

The `CENTRAL_FLOCK_INTERNAL_SECRET` value must exactly match
`CENTRAL_FLOCK_INTERNAL_SECRET` in Central Flock's plist. Rotating the
secret is a two-file edit + two service restarts — no per-tool changes.

### Adding future cgen-api → Central Flock tools

1. Add a new sub-router in Central Flock under `webhooksRouter.use('/<tool>', …)`.
2. Add a new route file in cgen-api (`src/routes/<tool>.ts`) that calls
   `postToCentralFlock('/webhooks/<tool>', body)`.
3. Done — no new secrets, no new middleware, no new env vars.

### Why two secrets in the chain?

- `X-API-Key` (n8n → cgen-api): single org-wide auth for all cgen-api
  endpoints; already exists.
- `X-Internal-Secret` (cgen-api → Central Flock): single shared secret for
  all internal webhook traffic. Keeps Central Flock's auth surface
  independent of cgen-api so we can rotate them separately, and leaves a
  clean path for a future direct caller (e.g. Apple Shortcuts) to be
  authorized with its own secret without crossing this boundary.

---

## Initial data migration — seeding the 166 existing quotes

One-time operation that gets the corpus into `quotes.db` so topic research
and the browse table work immediately without waiting for n8n.

### Entry point

`scripts/import-quotes.ts` — run via `pnpm tsx scripts/import-quotes.ts`.
Fully idempotent (safe to re-run).

### What it does

1. **List files.** `gh api repos/cgen01/tscandeequotes/contents/ --paginate`
   → JSON array of `.md` files. Filter by `name.endsWith('-quote.md')`.
2. **Fetch each file.** `gh api <contents-url> --jq .content | base64 -d`
   (uses existing local `gh` auth — no new secret).
3. **Parse** with `server/services/quote-parser.ts`:
   - YAML frontmatter regex → `title`, YAML `author` (→ `capturedBy`),
     `date` (→ `dateDisplay`, and attempt ISO parse → `capturedAt`).
   - Section split on `## Summary`, `## Quote`, `## Metadata` via regex.
   - Tags: `metadata.match(/#([A-Za-z0-9_]+)/g)` → strip `#`, dedupe.
   - Run `extractCitedAuthor(quoteSection)` → `author` (fallback to YAML).
   - Malformed files: log filename, skip — never crash the whole import.
4. **Compute `externalId`** = filename without `.md`. This must match what
   n8n uses going forward. Contract documented at the top of the webhook
   handler source.
5. **Upsert** into `quotes.db` with `source='import'`. Drizzle
   `.onConflictDoUpdate({ target: quotes.externalId, set: {…, updatedAt: sql\`datetime('now')\` } })`.
6. **Report.** `Imported N, Updated M, Skipped K (errors logged above)`.

### Edge cases

- Duplicate `externalId` → upsert handles it.
- Malformed markdown → caught per-file, logged, skipped.
- Rate limits → `gh api` allows 5000 req/hr; 166 reqs is fine.
- Re-running after n8n already posted some → upsert on `externalId` means no
  dupes; content refresh happens if repo version differs.

### Recovery tool

If `quotes.db` is ever lost, re-running the import rebuilds from the repo
(while the repo still has the quotes). Pair with a nightly `sqlite3 .dump`
backup later if desired (out of scope for v1).

### Dependencies

No new npm packages. Uses: `gh` CLI (installed locally),
`child_process.execFileSync`, `better-sqlite3` + Drizzle (already in deps).

---

## Frontend

### Files to create

| File                                             | Purpose                                                                 |
| ------------------------------------------------ | ----------------------------------------------------------------------- |
| `src/lib/quotes-api.ts`                          | Typed API client (mirrors `src/lib/devotion-api.ts` / `src/lib/api.ts`) |
| `src/pages/sermons/quotes-page.tsx`              | Quotes table — search, filters, pagination, Add/Edit/Delete             |
| `src/pages/sermons/quote-detail-page.tsx`        | `/sermons/quotes/:id` — full view + Copy + Edit/Delete actions          |
| `src/pages/sermons/quote-form-dialog.tsx`        | Shared Add/Edit dialog (invoked from table and detail)                  |
| `src/pages/sermons/quotes-research-page.tsx`     | Topic input + synthesis + results + recent searches rail                |
| `src/pages/sermons/quote-searches-page.tsx`      | Search history list (topic, date, quoteCount, link to detail)           |
| `src/pages/sermons/quote-search-detail-page.tsx` | Replays a saved search: synthesis + result cards (rehydrated)           |

### Files to modify

| File                          | Change                                                                                                                                                                                                                                                                      |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/nav-config.ts`       | Add `NavGroup { id: 'sermons', label: 'Sermons', icon: ScrollText, children: [ {to:'/sermons/quotes', label:'Quotes', icon:Quote, end:true}, {to:'/sermons/research', label:'Research', icon:Sparkles}, {to:'/sermons/searches', label:'Search History', icon:History} ] }` |
| `src/App.tsx`                 | Register routes for `/sermons/quotes`, `/sermons/quotes/:id`, `/sermons/research`, `/sermons/searches`, `/sermons/searches/:id`                                                                                                                                             |
| `src/pages/settings-page.tsx` | Rename field from `devotionAiModel` → `defaultAiModel` in form + label ("Default AI model")                                                                                                                                                                                 |
| `.env.example`                | Add `CENTRAL_FLOCK_INTERNAL_SECRET=` with comment (shared for all cgen-api → Central Flock webhooks)                                                                                                                                                                        |
| `package.json`                | Add `db:quotes:generate`, `db:quotes:migrate`, `db:quotes:studio` scripts                                                                                                                                                                                                   |
| `server/index.ts`             | Mount webhook router (before auth, line ~38) and api router (line ~54); run the `defaultAiModel` rename migration at startup                                                                                                                                                |

### Quotes page (`/sermons/quotes`) — matches People/Groups patterns

Reuses components from `src/pages/people-page.tsx`:

- Top bar: `Card > CardHeader` with title + primary action `[+ Add Quote]`.
- Filter row:
  - `SearchInput` (debounced, bound to `?q` — matches FTS on title/quote/summary/tags).
  - Author `Select` filter, populated from `GET /api/quotes/authors`.
  - Date range: two date pickers (`?dateFrom`, `?dateTo`) matching `capturedAt`.
  - "Clear filters" button when any filter is active.
- Sortable `Table` columns: **Title**, **Author**, **Date**, **Tags**, **Source**, **Actions**.
- Row click → `/sermons/quotes/:id`.
- Actions column: `…` menu with **Edit** (opens dialog), **Delete** (ConfirmDialog).
- `Pagination` at bottom, server-side via `?page=&pageSize=`.
- `usePersistedState` to remember page size + active filters (matching people page convention).
- Loading: skeleton rows. Empty (no filters): helper copy + `[+ Add Quote]`. Empty (filters active): "No quotes match — [Clear filters]".

### Quote detail page (`/sermons/quotes/:id`)

- Header: title, author, date, source badge.
- Summary block.
- `<blockquote>` of `quoteText` with `whitespace-pre-wrap` (preserves `◇` lines and newlines).
- Tag pills.
- Actions: **Copy quote** (clipboard), **Edit** (opens dialog), **Delete** (ConfirmDialog → back to table), **Back**.

### Add/Edit dialog (`quote-form-dialog.tsx`)

Reuses the edit-person pattern (`src/pages/edit-person-page.tsx` style):

- Dialog with scroll area.
- Fields: Title (required), Author (required), Captured By (optional; defaults
  to Tyler's display name for manual quotes), Date Display, Summary
  (textarea, required), Quote Text (textarea, required, monospace or serif to
  preserve formatting), Tags (comma-separated input → array).
- On save, `POST /api/quotes` or `PATCH /api/quotes/:id`.
- For manual create, server generates `externalId = "manual-" + cuid()`.
- Invalidate TanStack Query `['quotes', ...]` on success + sonner toast.

### Research page (`/sermons/research`)

```
┌─ Sermons › Research ─────────────────────────┐
│  Topic:  [ power of Christ           ] [Go]  │
│  Recent: [God is Light] [suffering] [grace]  │← pills (click to re-run)
│                                              │
│  ── AI Synthesis ───────────────────────────│
│  These quotes illustrate that Christ's      │
│  power is external (Holy Spirit), perfected │
│  in weakness, and sufficient...             │
│                                              │
│  ── Quotes ─────────────────────────────────│
│  ┌─────────────────────────────────────┐    │
│  │ A.W. Tozer · Apr 10, 2026 [view →]  │    │
│  │ Why: We don't have inherent power…  │    │
│  │ Summary: …                          │    │
│  │ "God Almighty says, 'I do not…'"    │    │
│  │ #HolySpirit #Power                  │    │
│  └─────────────────────────────────────┘    │
│  ...                                         │
└──────────────────────────────────────────────┘
```

- **Submit**: TanStack `useMutation` → `POST /api/quotes/research`.
- **Recent searches pills**: fetch last 8 from `GET /api/quotes/searches?pageSize=8`; clicking a pill sets the topic and re-submits.
- **Loading**: skeleton cards + "Researching…" label.
- **Empty state** (pre-search): one-line helper + 2-3 example topic chips.
- **Error state**: `sonner` toast + inline retry.
- **Card**: header row (author · date · `[view →]`), **Why:** line,
  **Summary:** block, blockquote of `quoteText` with `whitespace-pre-wrap`,
  tag pills.
- After a successful search, `searchId` is in the response so the user can
  deep-link to `/sermons/searches/:id` (and we store it in history
  automatically).

### Search history pages

**`/sermons/searches`** (list):

- Card with Table: **Topic**, **Date**, **Results**, **Model**.
- Row click → `/sermons/searches/:id`.
- Server-side pagination via `?page=&pageSize=`.
- Search input filtering by topic substring.

**`/sermons/searches/:id`** (detail):

- Same visual layout as a completed research run (synthesis + result cards).
- Banner: "Saved search from Apr 12 · model: claude-sonnet-4-5".
- Results rehydrate against current DB — if a quote was deleted, render a
  muted "(quote #42 no longer available)" placeholder in its slot.
- Button: **Re-run this search** → submits the topic to `/api/quotes/research`
  (creates a new history entry, doesn't mutate this one).

---

## Critical files to reference (reuse these patterns)

- `server/services/devotion-generation.ts` — Anthropic SDK call, settings
  read, XML parsing (regex), missing-API-key error. `getConfiguredModel()` at
  line 35-42 will be updated to read `defaultAiModel`.
- `server/db-devotions/index.ts` — better-sqlite3 + drizzle bootstrap; db
  file lives at repo root (`path.join(__dirname, '..', '..', 'quotes.db')`).
- `server/routes/settings.ts` — settings defaults + valid values; rename
  `devotionAiModel` → `defaultAiModel` in the `DEFAULTS` dict (line 9-16)
  and `VALID_VALUES` (line 18-20).
- `server/index.ts:38` — `app.use('/api', requireAuth)` — webhook must be
  registered BEFORE this line.
- `server/routes/people.ts` — pagination + filter query shape, Drizzle
  `count()` + limit/offset idioms.
- `src/pages/people-page.tsx` — server-paginated sortable/filterable Table,
  `SearchInput`, filter drawer, `usePersistedState`.
- `src/pages/edit-person-page.tsx` — form field layout + validation pattern.
- `src/lib/api.ts`, `src/lib/devotion-api.ts` — typed client conventions
  (`request<T>`, `buildQueryString`, interface per entity).
- `src/lib/nav-config.ts` — `NavGroup` / `NavChild` shape.
- `~/repos/cgen/cgen-api/src/routes/reminders.ts` — thin route pattern for
  cgen-api's new `quotes.ts` proxy.

---

## Implementation order

1. **Settings rename migration** (low-risk, isolated) — add boot-time SQL to
   rename `devotionAiModel` → `defaultAiModel`; update
   `server/routes/settings.ts`, `devotion-generation.ts`, settings page UI.
   Verify Devotions still works end-to-end.
2. **DB + schema** — `server/db-quotes/*`, `drizzle-quotes.config.ts`,
   package.json scripts. Run `pnpm db:quotes:migrate` → `quotes.db` appears.
3. **FTS5 migration** — hand-written `0001_fts.sql` with virtual table +
   triggers; apply via migration runner.
4. **Parser** — `server/services/quote-parser.ts` including
   `extractCitedAuthor`. Unit test on 3-4 pasted sample markdown files
   (covering: comma-separated, parenthesized, affiliation after comma).
5. **Import script** — `scripts/import-quotes.ts`. Run once; verify 166 rows
   via `pnpm db:quotes:studio`; spot-check 5 rows to confirm `author` is the
   cited author, not "Dr. Arthur Maricle".
6. **Webhook endpoint** (Central Flock) — `POST /webhooks/quotes`; test with
   `curl` + fake payload.
7. **CRUD endpoints** — `GET/POST/PATCH/DELETE /api/quotes`, `GET
/api/quotes/authors`, `GET /api/quotes/:id`.
8. **Research service + endpoint** — `server/services/quote-research.ts`
   with prefilter; `POST /api/quotes/research`. Test with hardcoded topic
   via `curl`.
9. **Search history endpoints** — `GET /api/quotes/searches`,
   `GET /api/quotes/searches/:id`.
10. **Frontend API client** — `src/lib/quotes-api.ts`.
11. **Quotes table page + form dialog** — `/sermons/quotes`.
12. **Quote detail page** — `/sermons/quotes/:id`.
13. **Research page** — `/sermons/research` (including recent-pills).
14. **Search history pages** — `/sermons/searches`, `/sermons/searches/:id`.
15. **Nav + routes wiring** — `src/lib/nav-config.ts`, `src/App.tsx`.
16. **cgen-api proxy** — new `src/routes/quotes.ts` forwarding to Central
    Flock; add env var; restart cgen-api service.
17. **n8n hand-off** — point n8n's HTTP Request node at cgen-api's new
    `/webhooks/quotes` (or update URL if that path is already in use).

---

## Updating the n8n workflow

Because n8n already hits cgen-api, this becomes a **small change**: swap the
destination URL/path and payload shape on the existing HTTP Request node. No
new credentials, no new tunnel.

### Endpoint contract (what n8n sends)

- **Method:** `POST`
- **URL:** `{{CGEN_API_BASE_URL}}/webhooks/quotes` (cgen-api, not Central Flock directly)
- **Headers:**
  - `Content-Type: application/json`
  - `X-API-Key: {{CGEN_API_KEY}}` (the existing n8n ↔ cgen-api secret — no new one)
- **Body** (JSON): same as the Central Flock webhook body above.

### Response

cgen-api returns Central Flock's response verbatim:

- `200 OK` `{ "ok": true, "id": 42, "created": true }` — new row
- `200 OK` `{ "ok": true, "id": 42, "created": false }` — upserted
- `400 Bad Request` `{ "error": "<msg>" }` — malformed
- `401 Unauthorized` — bad `X-API-Key` (caught at cgen-api)
- `502 Bad Gateway` — cgen-api couldn't reach Central Flock

### `externalId` contract

The `externalId` must equal the filename-without-`.md` that the import script
computed, so re-posts don't duplicate seeded rows. If n8n currently generates
the GitHub filename inside the "Create file" step, hoist that expression into
a "Set" node earlier so it's available for the HTTP Request node.

Example: file `2026-04-13T18-12-00-167Z-dr-arthur-maricle-quote.md` →
`externalId = 2026-04-13T18-12-00-167Z-dr-arthur-maricle-quote`.

### n8n workflow changes

1. **Update the HTTP Request node** (or add one) pointed at cgen-api.
2. **Decide the fate of "Create file on GitHub":**
   - **Recommended:** remove it. Central Flock is the new source of truth.
   - **Hybrid (optional):** keep it in parallel as a passive backup. No
     Central Flock changes needed.
3. **Error handling:** wire the "On Error" branch to an n8n notifier so
   silent failures don't go unnoticed.
4. **Retry:** enable 2 retries with 30s backoff. Upsert on `externalId`
   keeps retries idempotent.

### Cut-over testing

1. Keep the existing GitHub write step in place temporarily.
2. Add/modify the cgen-api HTTP Request node after the GitHub step.
3. Fire a test quote → both the repo and `quotes.db` should get it.
4. Confirm the new row appears in `/sermons/quotes` and is searchable via
   `/sermons/research`.
5. After 2-3 successful quotes, remove the GitHub step.

### Setting the secrets

1. Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
2. Add `CENTRAL_FLOCK_INTERNAL_SECRET=<value>` to Central Flock's launchd
   plist `EnvironmentVariables` and restart the service.
3. Add the identical `CENTRAL_FLOCK_INTERNAL_SECRET=<value>` to cgen-api's
   launchd plist; restart cgen-api.
4. Document both in each project's `.env.example`.
5. Rotation later is the same two-file edit + two restarts — no per-tool work.

---

## Verification (end-to-end)

1. `pnpm db:migrate` boots Central Flock and the settings row renames from
   `devotionAiModel` → `defaultAiModel`. Existing Devotions page still generates.
2. `pnpm db:quotes:migrate` → `quotes.db` at repo root with `quotes`,
   `quoteSearches`, and `quotes_fts` tables.
3. `pnpm tsx scripts/import-quotes.ts` logs 166 upserts. Drizzle Studio
   shows 166 rows; spot-check the `author` column — it should be "Miguel de
   Cervantes", "Dr. Jerry Scheidbach", etc. — **not** "Dr. Arthur Maricle"
   for every row.
4. `curl -X POST http://localhost:5172/webhooks/quotes -H "X-Internal-Secret: $CENTRAL_FLOCK_INTERNAL_SECRET" -H "Content-Type: application/json" -d '<sample>'` → 200, new row in Studio.
5. Same `curl` again → still 200, `updatedAt` moved, count unchanged.
6. `curl -X POST http://localhost:5180/webhooks/quotes -H "X-API-Key: $CGEN_API_KEY" ...` → 200 (tests the cgen-api proxy hop through the shared `postToCentralFlock` client).
7. Navigate to `/sermons/quotes` — table renders, search/filter/sort/paginate work. Click a row → detail page. Click Edit → dialog opens populated → save → row updates in table. Click Add → dialog → save → row appears.
8. Navigate to `/sermons/research`. Enter "God is Light" → synthesis renders + result cards appear; each card has the correct cited author.
9. Reload `/sermons/research` — a "Recent" pill for "God is Light" appears; click it → same search re-runs and a new history entry is created.
10. Navigate to `/sermons/searches` → both history entries listed; click the first → detail page replays it.
11. Settings page → switch `defaultAiModel` to Haiku → re-run research → confirm faster response. Devotions page also honors the same setting.
12. `pnpm eslint` and `pnpm prettier` clean (per CLAUDE.md workflow memo).

---

## Explicitly out of scope for v1

- Favorites / "this quote worked well for sermon X" tracking.
- Chat-style follow-up refinement on a research run (single-shot only).
- Nightly `quotes.db` SQL dump backup to the repo or Dropbox.
- Public share links for a research result.
- GitHub repo backup write-through from n8n (Option C hybrid is mentioned as
  a reversible option in the n8n cut-over, but not part of v1 scope).
- Re-tagging / tag-taxonomy management UI.
- Bulk import/export of quotes from CSV inside the UI (the import script
  covers the one-time seed).
