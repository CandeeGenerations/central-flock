# Multi-group message recipients via junction tables

## Context

The compose page today accepts a single group as a message's audience source: `messages.group_id` and `drafts.group_id` are nullable single-FK columns into `groups`. The compose UI exposes a two-mode toggle — Group mode (one group + extras + excludes) or Individual mode (a flat people list) — and the audience formula in Group mode is `groupMembers ∪ selectedIndividualIds − excludeIds`.

The operator's real workflow has outgrown the single-group constraint. A representative example: "send a text to Nursery Workers and Singers asking which days they'll be out over the next few months." The membership lists are disjoint enough that copying everyone into one ad-hoc list is tedious, and creating a third "Nursery + Singers" group means maintaining membership in three places forever (add one new singer → remember to add them to two groups). The source of truth for "who is a nursery worker" and "who is a singer" must stay in the per-role groups; combining them is a compose-time concern.

Three structural shapes were on the table:

- **JSON array column** — replace `group_id` with `group_ids text` holding `JSON.stringify(number[])`. Consistent with the codebase's existing JSON-text recipient primitives (`drafts.selected_individual_ids`, `drafts.exclude_ids`). Lowest migration cost; opaque to SQL joins.
- **Junction tables** — `message_groups (message_id, group_id)` and `draft_groups (draft_id, group_id)`. Normalized; SQL-joinable for future "which messages targeted this group" queries; supports FK `ON DELETE` semantics natively.
- **Junction + keep `group_id` as a denormalized "primary group" pointer** — junction holds the full set, single column holds the first-picked group for fast label rendering.

Scheduling is **out of scope** for this decision. Scheduled sends already snapshot recipients to a fixed `recipientIds` list at schedule-creation time (the server's `/messages/send` accepts pre-resolved IDs, not a group reference). Multi-group changes the compose-time picker, not the fire-time contract.

## Decision

Two new junction tables own the message → group(s) relationship:

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
  (t) => [primaryKey({columns: [t.messageId, t.groupId]})],
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
  (t) => [primaryKey({columns: [t.draftId, t.groupId]})],
)
```

`messages.group_id` and `drafts.group_id` are **dropped** after a one-time backfill (each non-null `group_id` becomes a single junction row). The junction is the sole source of truth.

The audience formula is unchanged in spirit but generalized to N groups:

```
audience = (⋃ selected groups' members) ∪ selectedIndividualIds − excludeIds
```

Set semantics; dedup automatic.

`recipient_mode` stays a `'group' | 'individual'` discriminator. Group mode now means **0..N groups picked** rather than exactly one. Zero groups in Group mode = empty audience, Send disabled (mirrors Individual mode's empty state). Mode is sticky — removing the last chip does not auto-switch to Individual mode.

The compose UI swaps the single-group `Select` for the existing `MultiSelect` (chips above the panel; tap a chip to remove). Extras and excludes panels react to the full union — extras filter to "people in _no_ selected group," excludes show "people in at least one selected group."

The message history "Recipients" cell renders comma-joined group names with a single merged "+ N more" overflow affordance whose tooltip is sectioned (Groups + Extras) — extending the existing pattern at `src/pages/message-history-page.tsx:44-88`.

## Why

- **Hard to reverse:** Dropping `group_id` from `messages` and `drafts` is a one-way migration. Restoring a denormalized primary-group column later means re-deriving "which one was the primary?" from the junction (no defensible answer for N>1) and reconciling every read-site that switched to the junction. The decision to drop, specifically, is the load-bearing irreversible choice — the junction itself could be added without dropping.

- **Surprising without context:** A future reader skimming `schema-core.ts` will see `messages` and `drafts` lacking a `group_id` column while every other "thing → group" relationship in the codebase is a direct FK. The junction-for-1..N pattern only exists today for `people_groups`. Without this ADR, the absence of `group_id` will read as an oversight, and someone will helpfully "fix" it.

- **Real trade-off — two alternatives rejected:**
  - **JSON array column.** Smallest diff: rename `group_id` → `group_ids` and JSON-encode. Consistent with `selected_individual_ids` and `exclude_ids` which are already JSON-text. Rejected because the cost of "junction" in this codebase is low (the migration is mechanical, the read sites are few), the upside ("which messages targeted Group X" SQL queries) is real even if not used today, and FK-driven cascade behavior on group deletion comes for free. JSON would require an application-level cleanup pass on group deletion.
  - **Junction + denormalized `group_id` for label-rendering speed.** Rejected because the read sites for the label are few (a handful of pages) and the cost of two-sources-of-truth — where every membership mutation has to update both places, and any divergence is a silent label bug — is higher than the cost of one extra JOIN or batched `getGroupName` lookup.

- **Latent bug fix:** `messages.group_id` today has `references(() => groups.id)` with **no `onDelete` clause**, which under Drizzle/SQLite defaults to NO ACTION — meaning group deletion silently fails whenever any sent message references the group. (`drafts.group_id` is `onDelete: 'set null'`, so the two are already inconsistent.) The junction's `ON DELETE CASCADE` on `group_id` resolves this for free: deleting a group drops its junction rows, the message survives, the label loses that name.

## Consequences

- **`messages.group_id` and `drafts.group_id` are gone.** Every read site that accesses these (`src/pages/message-history-page.tsx`, the drafts route's live-count derivation, the duplicate-message restore, the draft restore, the compose page's preset handling) is rewritten to load `groupIds` from the junction. The API response shape changes accordingly: `message.groupName` becomes `message.groupNames: string[]`. Mechanical refactor, one-time.

- **Group deletion now succeeds where it previously hung.** Any historical message that referenced a deleted group will see its label shrink (one fewer name) but the recipient records on `message_recipients` are untouched — they hold `person_id` directly, so the audit trail for "who got the text" is unaffected.

- **`recipient_mode` semantics widen.** The mode persists as `'group' | 'individual'`, but Group mode is now valid with 0..N groups instead of exactly 1. A draft saved in Group mode with no groups picked is a legitimate persistable state (the operator was mid-compose); Send is disabled until at least one group is added or the mode is flipped to Individual.

- **History label tooltip pattern extends but doesn't fork.** The existing "+ N extra" affordance for individuals-outside-the-group is folded into a single merged "+ N more" tooltip when the cell would otherwise overflow. Rows written before this feature continue to render with the same logic, since the "extras" set was already the only overflow source; pre-existing single-group sends just don't have group-overflow content to add.

- **No fire-time live-membership semantics.** Scheduled sends remain snapshotted at schedule-creation time. The operator picks the groups, the client unions/dedups, the server stores `recipientIds`. A nursery worker added to "Nursery Workers" _after_ a scheduled send was set up will **not** be included when the send fires. This matches today's behavior and is intentional — predictability beats freshness for one-off "do you have days out?" surveys.

- **No "groups of groups" / tag concept introduced.** Multi-group send is the smallest viable answer to "send to people across two groups without a maintained combined group." If a _recurring_ combined audience emerges (e.g., "always send music announcements to Singers + Pianists + Accompanists"), the right next step is either (a) a saved compose preset or (b) a tag-style grouping primitive — not extending this junction with implicit semantics.
