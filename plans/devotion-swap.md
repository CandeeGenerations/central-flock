# Devotion Swap

Swap two devotions from the table's row menu: pick another devotion, and the **content** of the two
trades while each keeps its **slot** (number + date). See
[ADR-0016](../docs/adr/0016-devotion-swap-box-model.md) and CONTEXT.md (Devotions). **Not yet built.**

## Semantics (resolved)

- **Box model.** `number` + `date` stay with the row; content moves.
- **Field boundary.** Swap every `devotions` column **except** `id`, `number`, `date`, `createdAt`.
  Bump `updatedAt` on both. Production/publish flags (`produced`, `rendered`, `youtube`,
  `facebookInstagram`, `podcast`) and `flagged` swap (they describe the content).
- **Passages follow content.** Swap `generated_passages.devotionId` links between the two rows.
- **Third-party chains.** `referencedDevotions`/`chainIgnores` on _other_ devotions are left as-is
  (they cite the number/box). Warn in the modal if either number appears in another devotion's chain.

## Backend

- `POST /api/devotions/:id/swap` body `{targetId}`. Single transaction:
  1. Load both rows; 404 if either missing; 400 if `id === targetId`.
  2. Exchange the content columns (everything except id/number/date/createdAt), set `updatedAt=now`.
  3. Swap passage links: `generated_passages` rows with `devotionId=A` → `B` and `B` → `A`
     (use a temp/CASE update to avoid clobbering).
  4. Return both updated rows.
- Chain-warning check (for the modal): given the two numbers, return whether either appears in any
  other devotion's `referencedDevotions`/`chainIgnores`. Either a small `GET
/api/devotions/:id/swap-warning?targetId=` or computed client-side from the devotions list.

## Frontend

- Add **"Swap with…"** to the row `⋯` menu (`src/pages/devotions/devotion-list-page.tsx`,
  `CopyMenu` dropdown).
- Modal:
  - **Searchable devotion picker** — search by number / title / scripture; exclude self; show
    number + date + title per option.
  - After pick, **before/after confirmation**: "#234 (Mar 3) ← Psalm 23 · #567 (Aug 8) ← John 3:16",
    plus the chain-reference warning when applicable.
  - Confirm → call swap endpoint → toast → invalidate `['devotions']` (and passages pool).
- Client: `swapDevotions(id, targetId)` in `src/lib/devotion-api.ts`.

## Notes

- Swap is its own inverse (swapping again reverts) — no history/undo table needed.
- `number` unique constraint is never touched (numbers don't move), so no temp-value dance for it.
