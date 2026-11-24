# Central Flock MCP server

Status: **Design settled 2026-11-24. Nothing built; scheduled after the TanStack Start rewrite merges.**

## Goal

Let outside AI assistants work with Central Flock data through one MCP server, starting with:

1. **The Grok devotion bot** (a grok.com project) reads which scripture references have been used,
   so new **Passages** don't overlap, and adds new Passages to the **Passage Pool**, where they show
   up in the scan page's picker when a month's schedule is added. In time this may replace
   generating Passages inside Central Flock with Claude.
2. **Nursery schedule** tools matching today's nursery day API, so a bot like Roo can use MCP
   instead of the REST route.

Terms: **Passage** and **Passage Pool** are defined in [CONTEXT.md](../CONTEXT.md).

## What exists today

- **Passage Pool:** `generated_passages` table (`server/db/schema-devotions.ts`): title, KJV
  reference, talking points, notes, subcode, `recorded`, `used`, `devotionId`. Endpoints under
  `/api/devotions/pool` (list, generate, assign, pull-for-scan, update, delete). The scan page pulls
  available Passages for Tyler's devotions — recorded first, then oldest — or one is picked by hand.
- **Repeat avoidance today:** `server/services/devotion-generation.ts` sends Claude the references
  and titles of Tyler's last 80 devotions plus the last 50 pool Passages.
- **Data size (2026-11-24, read-only count):** 2,336 devotions (445 Tyler, 576 original, 1,113
  revisit, 140 favorite, 50 Gabe, 12 Ed), 1,053 distinct references, 2020-03-29 to 2026-12-31.
  Pool: 94 Passages, 6 still available.
- **Nursery day:** `GET /webhooks/nursery/day?date=` (`server/routes/nursery-webhook.ts`, logic in
  `server/services/nursery-day.ts`), reached by Roo through cgen-api's `GET /api/nursery/day` with
  its own scoped key (`NURSERY_API_KEY`, 20 calls/minute). _(Uncommitted work at the time of writing.)_
- **MCP SDK:** `@modelcontextprotocol/sdk` 1.32.2 is already a dependency (used as a client for
  Canva/Metricool). It includes the server side: `McpServer`, the streamable HTTP transport, and
  OAuth server handlers (metadata, dynamic client registration, authorize, token, revoke).

## How grok.com connects (checked 2026-11-24)

grok.com → Connectors → New Connector → Custom, with a public MCP server URL over streamable HTTP.
OAuth sign-in in a popup is the one documented way to authenticate in the grok.com connector;
static API-key headers are documented for Grok Bots and the API, not clearly for grok.com. Custom
connectors reportedly need a paid plan. Whether a connector can be scoped to a single Grok project
is not documented. Sources: [xAI connectors](https://docs.x.ai/grok/connectors),
[catalog](https://docs.x.ai/grok/connectors/catalog), [custom MCP tunneling](https://docs.x.ai/grok/connectors/custom-mcp-tunneling).

## Decisions

1. **The MCP server lives in Central Flock**, at `flock.cgen.cc/mcp` once the app is on Railway
   ([ADR 0043](../docs/adr/0043-railway-hosting-with-mac-work-behind-cgen-api.md)). The OAuth sign-in
   page is Central Flock's own login, so there is one password, and the server works when the Mac
   is off. This narrows the cloud plan's decision 8 to: _public, unauthenticated callers go through
   cgen-api; a signed-in agent may connect to Central Flock directly._ Recorded in [ADR 0045](../docs/adr/0045-signed-in-agents-connect-to-central-flock-directly.md). ADR 0014's reasoning (no
   public unauthenticated routes) still holds.
2. **One general server, tools grouped by area.** Each connected assistant gets its own OAuth
   grant limited to the areas approved on the consent screen (e.g. "Devotions: read and add
   passages", "Nursery: read schedule") — the same idea as cgen-api's one-key-per-bot scoped keys.
   A Settings list shows connected assistants and can switch any one off. No tool sends texts or
   messages.
3. **Nursery tools from the start**, matching the existing nursery day API (same input: optional
   `YYYY-MM-DD`, default the coming Sunday Eastern; same output: schedule, assignments, unfilled),
   built on `loadNurseryDay`. Roo's REST route through cgen-api stays as it is; Roo can switch to
   MCP whenever its platform supports it.

4. **The devotion bot sees the full history, minus revisits.** Every reference used in any
   **Devotion** except revisits (originals, favorites, and every guest speaker's) plus every
   **Passage** in the pool, used or not — each with its date,
   number, type, speaker, title and used/recorded state. Optional filters: speaker, type, date
   range. About 1,053 distinct references, small enough for one call. A second tool checks a list
   of candidate references against that history, so Grok can confirm before proposing.
   - Note for the overlap check: `parseReference`/`referenceKeys` (`server/lib/bible-reference.ts`)
     expand dash ranges into verses but drop comma lists — `John 10:11, 30` yields only 10:11.
     92 devotion references use commas or semicolons, so the check needs a fuller parser.
5. **An overlap is any shared verse.** References are expanded to individual verses (ranges and
   comma lists, e.g. `Luke 2:25-26, 30-34`) after normalising book names; two references overlap if
   they share one verse. A reference with no verse (`Psalm 23`) covers the whole chapter.
   _Same chapter, no shared verse_ is reported as a warning, not an overlap. Every result names
   what it overlaps — devotion number and date, or pool Passage — so Grok can explain or move on.
6. **Revisits are left out of everything here** — history, overlap checks and counts. A revisit
   repeats an earlier devotion by design (all 1,113 link back through `referenced_devotions`), so
   counting it would make one use look like many: 443 references appear more than once with
   revisits, 167 without.
7. **A reused verse is allowed; repeated talking points are what get flagged.** One verse can carry
   several different devotions, so the add tool never refuses a Passage for its verse. When the
   verse overlaps an earlier use, the new talking points are compared with that use's points:
   - **Different points:** no warning at all.
   - **Similar points:** the Passage is still added, with a warning naming the earlier devotion or
     Passage and its points, so Grok can rewrite them and you can see it when picking.
   - Applies however many times the verse has been used before.
8. **The add tool refuses only what is broken:** a reference that doesn't parse or names a verse
   that doesn't exist in the AKJV Bible text, a missing title, or not 3–4 talking points. The rest
   of a batch is still added. References are normalised to the canonical form (full book name,
   `Chapter:Verse`, hyphen for ranges, "Psalm" for one psalm) before saving.

9. **Claude judges "similar talking points", with a word-overlap fallback.** Runs only when a
   verse overlaps an earlier use. A small, cheap Claude call compares the new points with each
   earlier use's points by meaning and returns `similar` or `different` with a one-line reason.
   It goes through `createMessage` (model configured in `server/lib/ai-models.ts`) and gets a case
   in `server/test/ai-smoke.ai.test.ts`, per CLAUDE.md. In sandbox mode, or if Claude is
   unreachable, a word-overlap check runs instead (key words after dropping common words); the
   warning records which method decided.
10. **Up to 10 Passages per add call** (a default; easy to change).
11. **Every Passage records where it came from; no review step.** A `source` on each Passage —
    `grok`, `claude` (the in-app generator) or `manual` — plus its stored warnings, shown on the
    pool page and in the scan page picker. Passages from Grok are pickable as soon as they're added.
    - **Why no review step:** the back-and-forth happens in the Grok conversation, using the
      history and check tools, before anything is sent. The add call is the final, agreed version.
    - Scan-page auto-fill still skips a Passage that carries a warning, so a repeated set of
      talking points is only ever used by choosing it.
    - Schema: two new columns on `generated_passages` (`source`, `warnings`); existing rows get
      `source = 'claude'`. This is an ordinary additive migration — it must land outside the Start
      rewrite branch, which allows no schema changes (cloud plan decision 22).

12. **Built after the TanStack Start rewrite merges**, Start-first: tools and OAuth routes as Start
    server routes, no Express version. Slots in after Phase 4 of
    [tanstack-migration.md](./tanstack-migration.md), alongside Phase 5, once the `main` freeze ends;
    the `source`/`warnings` migration lands then too.
13. **In test copies and staging** (decided without asking — follows the cloud plan's sandbox rules):
    the MCP server runs, so it can be tested, and its writes go to that environment's own database.
    The Claude similarity check is blocked by sandbox mode, so the word-overlap fallback runs.
    OAuth grants and tokens are environment-local: the sandbox-only import that copies production
    into staging **clears every MCP grant and token**, so a production token never works against
    staging, and Grok is only ever connected to production.

14. **The in-app Claude generator stays, alongside Grok.** Both add to the same **Passage Pool**,
    tagged by `source`. The generator's repeat avoidance switches from "Tyler's last 80 devotions +
    last 50 pool Passages" to the same full-history, shared-verse and talking-point rules as the
    MCP tools (revisits excluded), so both sources follow one rule. Revisit retiring it after a few
    months of using Grok.

## Open

Nothing open. Ready to break into build steps when the Start rewrite has merged.
