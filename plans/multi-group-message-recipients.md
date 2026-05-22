# Multi-group Message Recipients

Lets the compose page target **multiple groups in a single send/draft/scheduled message**, eliminating the need to maintain a "combined" group whose membership has to be hand-synced with the source groups. Replaces the single-FK `messages.group_id` / `drafts.group_id` columns with junction tables and generalizes the audience formula to `(⋃ selected groups' members) ∪ selectedIndividualIds − excludeIds`.

Domain context: [CONTEXT.md → Message recipients / Recipient mode / Message recipient label](../CONTEXT.md). Decisions: [docs/adr/0007-multi-group-message-recipients.md](../docs/adr/0007-multi-group-message-recipients.md). This plan is the implementation playbook.

## Goals

- Compose UI accepts N groups via a multi-select chip picker instead of a single `Select`.
- `messages` and `drafts` store their group association in junction tables (`message_groups`, `draft_groups`). The single-FK `group_id` columns are removed.
- Audience formula `(⋃ groups) ∪ selectedIndividualIds − excludeIds` applies to draft, immediate send, and scheduled send paths.
- `recipient_mode = 'group'` is valid with 0..N groups (mirrors Individual mode's empty state when N = 0). Send is disabled when the resolved audience is empty.
- Message history "Recipients" cell renders comma-joined group names with a single merged "+ N more" tooltip combining overflowed groups + extras (extends `src/pages/message-history-page.tsx:44-88`).
- Group deletion succeeds even when sent messages reference the group (fixes a latent NO ACTION FK bug on `messages.group_id`).

## Non-goals (deferred)

- Live-membership resolution at scheduled-send fire time. Recipients are still snapshotted to a fixed `recipientIds` list when the user clicks Send/Schedule.
- "Groups of groups" / tag-style grouping primitives. If a _recurring_ combined audience emerges, the next step is a saved compose preset, not changes to this junction.
- Saved recipient presets / favorite audiences.
- Per-group exclude scoping. `excludeIds` stays global ("don't send to this person regardless of which group brought them in").
- Birthday scheduler or RSVP send-flow changes. Both use `recipient_mode = 'individual'` and are unaffected.

---

## Phase 1 — Schema + backfill migration

This phase introduces the junction tables, backfills from the existing single-FK columns, and drops the old columns. Reads and writes still flow through the old shape until Phase 2 updates the routes, but the columns are gone — Phase 1 lands as a single migration coupled with a code change that switches the server to read/write the junction. **Do not split this phase.**

**Schema changes (`server/db/schema-core.ts`):**

Add the junction tables (placed next to `peopleGroups` for symmetry):

```ts
export const messageGroups = sqliteTable(
  'message_groups',
  {
    messageId: integer('message_id')
      .notNull()
      .references(() => messages.id, {onDelete: 'cascade'}),
    groupId: integer('group_id')
      .notNull()
      .references(() => groups.id, {onDelete: 'cascade'}),
  },
  (table) => [primaryKey({columns: [table.messageId, table.groupId]})],
)

export const draftGroups = sqliteTable(
  'draft_groups',
  {
    draftId: integer('draft_id')
      .notNull()
      .references(() => drafts.id, {onDelete: 'cascade'}),
    groupId: integer('group_id')
      .notNull()
      .references(() => groups.id, {onDelete: 'cascade'}),
  },
  (table) => [primaryKey({columns: [table.draftId, table.groupId]})],
)
```

Remove `groupId` from the `messages` table definition and from the `drafts` table definition.

**Migration files (after `pnpm db:generate`):**

The generated migration creates the two new tables and drops two columns. **Hand-edit** the migration to insert the backfill step between create-tables and drop-columns:

```sql
-- After CREATE TABLE message_groups, draft_groups
INSERT INTO message_groups (message_id, group_id)
  SELECT id, group_id FROM messages WHERE group_id IS NOT NULL;
INSERT INTO draft_groups (draft_id, group_id)
  SELECT id, group_id FROM drafts WHERE group_id IS NOT NULL;
-- Then the generator's ALTER TABLE messages DROP COLUMN group_id; etc.
```

SQLite's `ALTER TABLE DROP COLUMN` is supported by Drizzle's migrator via the table-rebuild pattern. Verify the generated SQL — if Drizzle emits a `__new_messages` rebuild, the backfill `INSERT` must run **before** the rebuild copies data, or it'll be lost. Safest pattern: backfill first, then let Drizzle do its rebuild.

**Deployment order (per memory: stop service before DB migrations):**

1. `launchctl bootout gui/$(id -u)/cc.cgen.central-flock`
2. `cp central-flock.db central-flock.db.pre-multi-group-bak` (the backups dir already holds dated copies; this is a belt-and-suspenders step)
3. `pnpm db:migrate`
4. Confirm row counts: every old non-null `messages.group_id` produced one `message_groups` row; same for drafts.
5. Code from Phase 2 deploys; `launchctl bootstrap …` restarts.

**Acceptance:**

- `SELECT COUNT(*) FROM message_groups` equals pre-migration `SELECT COUNT(*) FROM messages WHERE group_id IS NOT NULL`.
- Same for `draft_groups` vs `drafts.group_id IS NOT NULL`.
- `PRAGMA table_info(messages)` and `PRAGMA table_info(drafts)` no longer list `group_id`.
- Deleting a group via the Groups admin page succeeds; junction rows referencing it are gone; the referenced messages remain.

---

## Phase 2 — Server routes: read/write the junction

Lands together with Phase 1 — the column is gone, so the routes must already speak junction.

**`server/routes/messages.ts`:**

- `POST /api/messages/send`: accept `groupIds: number[]` in the request body (was `groupId?: number`). After creating the `messages` row, batch-insert `message_groups` rows. Drop the `groupId: groupId || null` assignment on the messages insert.
- `GET /api/messages` (history): the SELECT needs to join `message_groups` and aggregate group names. The shape returned to the client changes from `{ ..., groupName: string | null, extraNames?: string[] }` to `{ ..., groupNames: string[], extraNames?: string[] }`. `groupNames` is ordered by join order; can sort alphabetically server-side for determinism.
- The single-group "search by group name" filter, if any, expands to "match any of the joined groups."

**`server/routes/drafts.ts`:**

- `POST /api/drafts` and `PUT /api/drafts/:id`: accept `groupIds: number[]`; replace the row's `draft_groups` set inside a transaction (`DELETE … WHERE draft_id = ?; INSERT … VALUES …` for each new ID).
- `GET /api/drafts` recipient-count derivation (today at `server/routes/drafts.ts:33-75`): replace `WHERE peopleGroups.groupId = draft.groupId` with `WHERE peopleGroups.groupId IN (…)` using the junction's group IDs. Dedup via `DISTINCT` on person_id. Subtract `excludeIds.length` from the deduped union count, then add `selectedIndividualIds` not in the union. Mirror the current "live count from peopleGroups" semantics but over N groups.
- Duplicate-draft handler (`server/routes/drafts.ts:294-297`): carry the source draft's junction rows over to the new draft.

**`server/lib/route-helpers.ts`:**

- `getGroupName(id)` stays. Add `getGroupNames(ids: number[]): string[]` as a batched helper that hits `groups` once and returns names in the input order.

**Type updates (`src/lib/api.ts`):**

- `Message` type: `groupId?: number` → `groupIds: number[]`, `groupName?: string | null` → `groupNames: string[]`.
- `Draft` type: same.
- API client methods that take a `groupId` parameter for send/save accept `groupIds: number[]`.

**Acceptance:**

- Send a message to one group via the existing UI (Phase 3 not yet shipped, so client still posts a single `groupId` — temporarily wrap as `[groupId]` server-side to keep the UI functional during the transition, OR ship Phase 2 + Phase 3 together as one PR). Recommend the latter — there's no value in landing Phase 2 alone, and a transitional wrapper is dead code the moment Phase 3 ships.
- Drafts list shows correct recipient counts for migrated single-group drafts (`groupIds.length === 1`).
- History list shows the same `groupName` string (now as `groupNames[0]`) for migrated single-group messages.

---

## Phase 3 — Compose UI: multi-select chips

**`src/pages/message-compose-page.tsx`:**

- Replace the local state `selectedGroupId: string` with `selectedGroupIds: number[]`. The Group/Individual mode toggle stays — `recipientMode` continues to be `'group' | 'individual'`.
- Replace the single `<Select>` over groups with the existing `<MultiSelect>` component (used today in RSVP and Specials filters). Selected groups appear as chips above the search-style picker.
- Group-membership query: today `enabled: recipientMode === 'group' && !!selectedGroupId`. Change to `enabled: recipientMode === 'group' && selectedGroupIds.length > 0`, and the query fetches **all groups' members** in one round trip (`GET /api/groups/members?ids=1,2,3` or similar; add the route if it doesn't exist — single-group `/api/groups/:id` returning members works today and could be parallelized with `Promise.all`, but a batched endpoint is cleaner). Server unions and dedups by `person_id`.
- `groupRecipients` memo: pulled from the unioned-deduped result.
- `extrasOutsideGroup` filter (today excludes "people in the selected group"): update to "people in _none_ of the selected groups."
- `excludeIds` panel: now shows the unioned member list; selecting an exclude removes that person from the audience regardless of which group brought them in.
- **Empty-Group-mode state:** when `selectedGroupIds.length === 0` in Group mode, recipient panels render empty, the recipient count is 0 (plus any extras), and the Send button is disabled — matches Individual mode's empty state. Do **not** auto-switch to Individual mode.
- Preset/preload paths:
  - `presetGroupId` query param (e.g. from "Send to group" on the Group detail page): seed `selectedGroupIds = [presetGroupId]`.
  - Draft load (`draftData.groupIds`): seed `selectedGroupIds = draftData.groupIds ?? []`.
  - Duplicate-message load (`dupState.groupIds`): same.
  - Edit-message load (`editMessageData.groupIds`): same; also reconstructs `recipientMode = editMessageData.groupIds.length > 0 ? 'group' : 'individual'`.
- Save-draft payload: send `groupIds` (was `groupId`).
- Send payload: send `groupIds` (was `groupId`).

**Component reuse check:** confirm `MultiSelect` supports the count + search affordances Compose needs (Selected count badge, "Search groups…" placeholder, chip removal). If not, add a thin wrapper rather than a one-off component.

**Acceptance:**

- Pick 2 groups in compose; recipient panel shows the deduped union; extras panel filters out anyone in either group; exclude panel lists union members.
- Remove all chips → Send disabled; recipient count = 0 (or = extras count, minus excludes).
- Save as draft; reopen; chips reload in the same order.
- Schedule the send; confirm `recipientIds` on the resulting `messages` row is the deduped union snapshot.

---

## Phase 4 — History + drafts list rendering

**`src/pages/message-history-page.tsx`:**

- `MessageRecipientsCell` (`src/pages/message-history-page.tsx:44-88`) needs new branches:
  - `msg.groupNames.length === 1` and no extras → render the single name as today.
  - `msg.groupNames.length > 1` and no extras → comma-join names, soft-truncate with CSS overflow; on overflow, swap in a "First, Second + N more" affordance with a tooltip listing all group names.
  - Any case with extras → keep extras separate visually until cell would overflow; on overflow, **merge** groups and extras into one "+ N more" tooltip with two labeled sections (`Groups:` … and `Extras:` …).
  - `msg.groupNames.length === 0` (individual mode): unchanged from today's "≤2 names inline, else +N more" path.
- Drafts list cells use the same `groupNames` shape — the existing render at `message-history-page.tsx:340-365` updates to mirror the new logic.

**Overflow detection:** prefer a `ResizeObserver`-style measurement that compares rendered width against cell width, falling back to a name-count heuristic (`groupNames.length > 2` → switch to overflow mode) if a measurement-based approach feels finicky. The name-count heuristic is fine for v1.

**Acceptance:**

- Send to 1 group, no extras → cell reads "Singers".
- Send to 2 groups, no extras → cell reads "Singers, Nursery Workers".
- Send to 3 groups, 2 extras → cell reads "Singers, Nursery Workers + 3 more", tooltip is sectioned (`Groups: Pianists` / `Extras: Jane Doe, John Doe`).
- Send to 0 groups, 5 individuals → cell reads "Jane Doe, John Doe + 3 more" (unchanged from today's individual-mode path).

---

## Phase 5 — Cleanup + verification

- `pnpm eslint` and `pnpm prettier` pass.
- Spot-check the Group detail page's "Send Message to Group" button → preloads compose with one chip selected.
- Spot-check the Person detail page's "Message" button (if it sends to one person) → individual mode, unchanged.
- RSVP "Send Message (N)" path uses `recipientMode='individual'` → still works, no group chips involved.
- Sentry: no instrumentation tied to `messages.group_id` (verify; nothing in `server/sentry.ts` or scheduler instrumentation should reference it).
- Delete a test group that has historical messages → succeeds; the message row remains; its "Recipients" cell shows one fewer name (or no group names if it was the only one).
- Update `central-flock.db.pre-multi-group-bak` retention: keep until verified in production for one week, then delete.

---

## Migration risks

- **Backfill ordering vs Drizzle column-drop.** SQLite's column drop is implemented via table rebuild in older Drizzle versions. If the rebuild runs before the backfill, `group_id` is gone from the rebuilt table and the `INSERT INTO message_groups … SELECT … FROM messages` reads `NULL`. Mitigation: inspect the generated migration SQL; place the backfill INSERTs **before** any `__new_messages` rebuild block. Test on a copy of the live DB before running on prod.
- **`groupId` references in client code.** TypeScript will catch most read-site updates after the API type changes. Spot-check the duplicate-message and edit-message flows — they're tangled in `message-compose-page.tsx` and easy to miss.
- **Empty-Group-mode draft state.** A draft saved with `recipient_mode='group'` and zero junction rows is legitimate (operator was mid-compose). The drafts list must not crash on `groupNames === []` — render as "No group selected" matching today's null-group-id case at `message-history-page.tsx:342`.
