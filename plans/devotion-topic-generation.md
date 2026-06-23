# Topical Devotion Passage Generation

## Goal

Let Tyler steer AI-generated devotion passages toward a theme for special days
(e.g. "freedom, independence, liberty" for July 4th). Today generation is
topic-agnostic — it produces generic passages into a pool and only injects
"avoid repeating these" lists.

## Decisions (resolved via grilling)

- **Entry point:** extend the existing Generate modal on the passages/pool page
  with one optional free-text **Topic** field. No new "special days" calendar, no
  per-devotion generate button. (Option A.)
- **Count:** the topic applies to all `count` passages in the batch.
- **Optional:** blank topic → today's exact behavior (generic generation, `notes`
  null). Filled → topical generation + notes saved.
- **Prompt injection:** topic goes into the **user message** (where the avoid-lists
  already live), not the system prompt.
- **Repetition:** avoid-lists stay **fully active**. Topic steers; verses/titles
  still can't repeat the recent window. (Option A — no relaxation.) In practice no
  conflict: the avoid window (last ~80 Tyler devos + 50 pool) won't contain a verse
  used a full year ago.
- **Persistence:** add a new nullable **`notes`** column to `generated_passages`.
  Store the topic in **labeled form**: `Topic: freedom, independence, liberty`.
- **Pool UI:** show the passage `notes` on each pool card (e.g. small "Topic:" line).
- **Assignment:** in `POST /api/devotions/pool/assign`, **append** `passage.notes`
  into `devotions.notes` (new line if the devotion already has notes; plain set if
  empty). (Option B.)
- **Out of scope:** the `import-parsed` (OCR scan) linkage path is not touched.

## Code touch-points

### Schema + migration

- `server/db/schema-devotions.ts` — add `notes: text('notes')` to
  `generatedPassages`.
- Generate + apply migration against the **devotions DB** (the
  `drizzle-devotions` config, not the main one). Additive nullable column →
  non-destructive. Apply via the documented stop-service → migrate runbook
  procedure (production is the only DB).

### Backend

- `server/services/devotion-generation.ts`
  - `generateDevotionPassage(count, topic?)` — accept optional topic.
  - `buildUserMessage(extraRefs, extraTitles, topic?)` — when topic present,
    prepend a steering line (e.g. "This passage must be on the topic: <topic>.")
    above the existing avoid-lists.
  - Return the labeled notes string (`Topic: <topic>`) alongside each passage, or
    null when no topic — so the route can persist it.
- `server/routes/devotions.ts`
  - `POST /api/devotions/pool/generate` — accept `{count, topic?}`; write
    `notes` onto each inserted `generated_passages` row.
  - `POST /api/devotions/pool/assign` — append `passage.notes` into
    `devotions.notes` (newline-join if existing notes present).

### Frontend

- `src/lib/devotion-api.ts` — thread `topic` through `generatePoolPassages`;
  surface `notes` on the passage type.
- `src/pages/devotions/devotion-passages-page.tsx` — add the Topic input to the
  Generate dialog; render `notes` on each pool passage card.

## Verification

- `pnpm lint` (eslint + tsc for app and server) and `pnpm prettier` after edits.
- Manual: generate with a topic → passages carry `Topic: …` notes, visible in pool
  → assign one → devotion notes contains the topic (appended if notes already set).
- Blank topic → unchanged behavior, notes null.

## Related docs

- ADR: `docs/adr/0011-devotion-topic-in-notes.md`
- Glossary: "Devotion Topic" in `CONTEXT.md`
