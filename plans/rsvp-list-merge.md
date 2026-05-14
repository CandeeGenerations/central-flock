# RSVP List Merge — Implementation Plan

## Context

Today an RSVP List is an independent unit (its own event metadata, entries, public tokens). There's no way to collapse two lists into one — if you accidentally start "Extravaganza — Members" and "Extravaganza — Volunteers" as separate lists for the same event, the only way to consolidate is to manually add each person to one list and delete the other, losing the responses and tokens on the absorbed side.

This feature adds a **directional merge**: the user picks N lists on `/rsvp` (N ≥ 2), nominates one as the **target** (id/URL/event metadata survives), and the remaining **sources** are absorbed into it and hard-deleted. People that appear on more than one of the selected lists trigger a **conflict picker** so the user keeps the better entry per-person. The chosen entry's row survives intact (including its `publicToken`); the other side's is deleted.

All design decisions captured in `CONTEXT.md` under "RSVP list merge."

---

## Domain Rules (re-stated for implementers)

- **Direction:** target survives; sources are hard-deleted.
- **N ≥ 2 sources** in one merge. Cross-event merges allowed (target's event link wins).
- **Conflict** = same `person_id` on the target and at least one source.
- **Conflict picker fires only if any conflicts exist.** Empty conflict set → straight to confirm.
- **Granularity:** per-person, whole-entry. No field-mixing. The chosen side's row is the one that survives intact.
- **Default selection:** "most-informative" (real response beats `no_response`; non-null `headcount`/`note` breaks ties; target wins true ties).
- **`publicToken` follows the chosen entry.** Non-chosen side's tokens 404 after merge.
- **Hard delete**, single `sqlite.transaction`. No undo, no soft-delete window.
- **Stale resolutions tolerated:** if a conflict appears at commit time that wasn't in the preview (e.g., user added an entry to a source between preview and commit), the commit defaults that person to the most-informative side rather than failing.

---

## Vertical Slice 1 — Selection UI on `/rsvp`

Ships the row-selection scaffold and the toolbar entry point. No merge logic yet. The "Merge lists…" button opens a placeholder dialog with a "Coming soon" body. This makes the rest of the slices independently mergeable.

### Files

- `src/pages/rsvp/rsvp-list-page.tsx` — add row checkboxes, a `selectedIds` `Set<number>` state, and a sticky bulk toolbar.

### Behavior

- Row checkbox in a new leading column (matches existing bulk-select patterns; see RSVP detail page bulk toolbar referenced in `CONTEXT.md` § "RSVP detail page filters, sort, bulk actions").
- Header checkbox toggles all visible (filtered) rows.
- Clicking a row navigates as before; clicking the checkbox cell does not navigate (`stopPropagation` on the cell).
- Sticky toolbar appears when `selectedIds.size >= 2`. Contents: count badge ("3 lists selected"), "Merge lists…" button, "Clear selection" button.
- Toolbar disabled state messaging: with exactly 1 list checked, show a muted helper ("Select another list to merge") instead of the toolbar — or simply don't render until 2.

### Done when

- Checking 2+ lists shows the toolbar; clicking "Merge lists…" opens a `Dialog` with a "Coming soon" body.
- Single-checkbox state shows no toolbar (or the muted helper if we chose that path).
- Selection is reset when filters change such that selected lists are no longer visible (use `useEffect` keyed on filtered ids).

---

## Vertical Slice 2 — Preview endpoint + target/conflict dialogs

Adds the read-only side of the API and the multi-step dialog (target picker → conflict picker). Confirm + commit still disabled at the end of the picker.

### Backend

New route in `server/routes/rsvp.ts`:

```
POST /api/rsvp/lists/merge/preview
body: {targetId: number, sourceIds: number[]}
```

Validates:

- `targetId` and every `sourceIds[i]` exist; no duplicates; `targetId` not in `sourceIds`; `sourceIds.length >= 1`.

Computes:

- All entries across `[targetId, ...sourceIds]` joined to `people` (name fields for display).
- Groups by `person_id`. A person with rows in ≥2 of the selected lists is a conflict.
- For each conflict, builds `{personId, firstName, lastName, target: EntrySummary | null, sources: Array<EntrySummary & {sourceListId, sourceListName}>}`. Note: a person can be conflicted across multiple sources (3-way conflict); the picker handles 1-of-N selection.
- `EntrySummary = {entryId, status, headcount, note, respondedAt}`.
- `defaultKeep`: per conflict, the implementation of "most-informative" — pseudocode:
  - Score each entry: `(status !== 'no_response' ? 2 : 0) + (headcount != null ? 1 : 0) + (note ? 1 : 0)`.
  - Highest score wins. Ties → target if present, else first source by `sourceListId`.
- `sourcesWithDifferentEvent`: list of `{sourceListId, sourceListName, sourceEventLabel}` where the source's effective event differs from the target's. Two lists share the "same event" when both reference the same `calendarEventId` OR both have matching `standaloneTitle + standaloneDate`. Mismatched standalone vs. linked counts as different.
- `tokenLossCount`: number of entries that will be deleted (sum of source-side rows minus rows that get re-parented when "Keep source" wins). Server returns the **worst case** ("Keep target on every conflict") and the **default case** (using `defaultKeep`); UI surfaces the default; the confirm screen recomputes the exact count from the resolutions.

Response shape:

```ts
{
  targetId: number
  targetName: string
  targetEventLabel: string
  sourceCount: number
  totalEntriesAfter: number
  conflicts: Array<{
    personId: number
    firstName: string | null
    lastName: string | null
    target: EntrySummary | null
    sources: Array<EntrySummary & {sourceListId: number; sourceListName: string}>
    defaultKeep: {kind: 'target'} | {kind: 'source'; sourceListId: number}
  }>
  sourcesWithDifferentEvent: Array<{
    sourceListId: number
    sourceListName: string
    sourceEventLabel: string
    sourceEntryCount: number
  }>
  tokenLossDefault: number
}
```

### Frontend

- `src/lib/rsvp-api.ts` — add `previewMerge(targetId, sourceIds)`.
- New component `src/components/rsvp/rsvp-merge-dialog.tsx` — replaces the placeholder dialog from Slice 1.

Dialog has three internal steps managed by local state, not separate dialogs:

1. **Target picker.** Radio list of every selected list, showing name + event date + entry count. Pre-selected to the list with the most entries. "Next →" calls `previewMerge`.
2. **Conflict picker** (skipped if `conflicts.length === 0`). Scrollable list, one row per conflict. Each row shows the person's name and a vertical radio group: target entry first (if present), then each source entry. Each radio option shows `status`/`headcount`/`note`/`respondedAt` inline. Pre-selected to `defaultKeep`. Top of the picker: a summary line ("5 conflicts — defaults are pre-selected, override any you want"). Bottom: "← Back" and "Next →".
3. **Confirm** — built in Slice 3.

State per conflict: `Map<personId, {kind: 'target'} | {kind: 'source', sourceListId}>` initialized from `defaultKeep`.

### Done when

- Selecting 2+ lists, clicking "Merge lists…", picking target, clicking "Next" calls the preview endpoint and renders the conflict picker (or a "No conflicts — ready to merge" message if empty).
- Each conflict row shows full entry summaries on each side; default radio matches the server's `defaultKeep`.
- "Back" returns to the target picker preserving selection state.

---

## Vertical Slice 3 — Confirm screen + commit endpoint

Wires up the destructive step.

### Backend

New route in `server/routes/rsvp.ts`:

```
POST /api/rsvp/lists/merge
body: {
  targetId: number
  sourceIds: number[]
  resolutions: Array<{personId: number, keep: {kind: 'target'} | {kind: 'source', sourceListId: number}}>
}
```

Single `sqlite.transaction` doing, in order:

1. **Re-validate** target/source ids still exist. If a source was deleted concurrently, fail with 409 and a friendly message ("One of the selected lists was deleted; reload and try again").
2. **Recompute conflicts** server-side from current DB state (don't trust the client list — entries may have been added/changed since preview).
3. **Apply resolutions:**
   - For each conflict person:
     - Determine the chosen `entry_id` from `resolutions` (fall back to recomputed `defaultKeep` if a person is missing from the resolutions list — handles the stale-resolution case).
     - **If chosen is the target's existing entry:** delete all source-side entry rows for this person.
     - **If chosen is a source entry:** delete the target's entry row (if any) and all _other_ source-side entry rows for this person. Then `UPDATE rsvp_entries SET rsvp_list_id = :targetId WHERE id = :chosenEntryId`. The `publicToken` rides along on the row, satisfying the "chosen token survives" rule.
   - For each non-conflicted source entry (person only on one source, not on target): `UPDATE rsvp_entries SET rsvp_list_id = :targetId WHERE id = :sourceEntryId`. Token rides along.
4. **Delete the source lists:** `DELETE FROM rsvp_lists WHERE id IN (:sourceIds)`. The unique index `rsvp_entries_list_person_uniq (rsvp_list_id, person_id)` must already be satisfied at this point — every source-side entry has either been re-parented to target or deleted, so no source list still has rows referencing it.
5. **Return:**

   ```ts
   {
     targetId: number
     entriesBefore: number     // target row count before merge
     entriesAfter: number      // target row count after merge
     conflictsResolved: {keepTarget: number, keepSource: number}
     sourcesDeleted: number
     tokensLost: number        // entry rows deleted (excludes re-parented)
   }
   ```

**Important ordering wrinkle:** because of the `(rsvp_list_id, person_id)` unique index, when re-parenting a source entry to target where target already has a row for that person, **the target row must be deleted before the `UPDATE`** — otherwise the update violates the constraint. The handler must order operations per-person: delete losers first, then re-parent the winner.

### Frontend

- `src/lib/rsvp-api.ts` — add `commitMerge(...)`.
- `src/lib/query-keys.ts` — no new keys; invalidate `queryKeys.rsvpLists(...)` on success.
- `rsvp-merge-dialog.tsx` Step 3 (Confirm):
  - "Merge N lists into '<targetName>'"
  - Line: "Will have X entries after merge (was Y)" — compute X from preview + chosen resolutions client-side.
  - Line: "Z conflicts: A keep target, B keep source" (only if conflicts).
  - Line: "Sources to delete: <comma-separated names>"
  - Line: "Event stays: <targetEventLabel>"
  - Conditional line for each entry in `sourcesWithDifferentEvent`: "⚠ '<sourceListName>' is linked to a different event (<sourceEventLabel>). Its <sourceEntryCount> entries will be folded in."
  - Conditional broken-URL warning (if any conflict or any non-empty source): "⚠ N public RSVP links from removed entries will stop working."
  - Buttons: "← Back" and "Merge" (primary, destructive variant).
  - On success: close dialog, navigate to `/rsvp/:targetId`, invalidate the list query and the target's detail query.

### Done when

- Confirm screen shows correct counts, deletion list, event-stays line, cross-event lines, and the broken-URL warning when applicable.
- Clicking "Merge" commits in a transaction, deletes source lists, redirects to target's detail page, and the detail page reflects the merged entries (including any source-side entries kept via the conflict picker).
- A concurrent source-deletion produces a friendly error, not a 500.
- The unique index never throws — verified by a test case where target and a source both have an entry for the same person.

---

## Vertical Slice 4 — Polish

Small bits that don't fit cleanly in 2 or 3.

- **Empty source list:** if a selected source has zero entries, it still appears in the target picker (it's a real list with possibly a name worth absorbing nothing of). Merging it just deletes it. No special UI.
- **Self-merge guard:** server rejects a request where `targetId` is in `sourceIds`. Client never sends this (the target picker removes the chosen list from the source set).
- **Disable on past lists?** No — past lists are filterable from the default view but mergeable. The "Show all" toggle is required to even see them, so the gate is implicit.
- **Telemetry:** none for v1.
- **Sentry:** route handlers use `asyncHandler` (existing pattern), errors will surface naturally.

---

## Out of Scope

- Soft delete / undo of merges.
- Splitting a list (the inverse operation).
- Per-field conflict resolution.
- Auto-merge by "same event" detection. Manual selection only.
- Public RSVP page changes — public tokens that land on deleted rows 404 normally; no special redirect logic.

---

## Test Plan

Manual smoke (run after Slice 3):

1. **No-conflict merge.** Two lists with disjoint people → pick target → "Next" → conflict picker is skipped → confirm shows correct counts → "Merge" → redirects to target with combined entries.
2. **Conflict, keep target.** Person on both lists; pick "Keep target" in the picker. Target's existing entry should be unchanged after merge; the source entry should be deleted.
3. **Conflict, keep source.** Same setup; pick "Keep source." Target's existing entry should be replaced by the source entry — and the surviving merged row should have the **source's** `publicToken`. Hit the public RSVP URL with that token to confirm it still resolves to the right person on the target list.
4. **Three-way conflict.** Person on target + two sources, all with different responses. Picker shows three radio options; pick the middle source. The other two entries (target + the other source) should be deleted.
5. **Cross-event merge.** Source linked to a different calendar event than target. Confirm screen shows the "⚠ linked to a different event" line. After merge, target's event metadata is unchanged.
6. **Concurrent source deletion.** Open the merge dialog, then in another tab delete one of the selected sources, then hit "Merge." Expect a 409 with a friendly message — no 500, no partial commit.
7. **Stale resolutions.** Open the dialog through to the conflict picker, then in another tab add a new entry to a source for a person already on target. Submit the original resolutions. Expect the new conflict to be auto-resolved by `defaultKeep` server-side; merge succeeds.
8. **`pnpm eslint` and `pnpm prettier`** both pass.

---

## File Touchpoints (summary)

| File                                        | What changes                                           |
| ------------------------------------------- | ------------------------------------------------------ |
| `server/routes/rsvp.ts`                     | Add `/lists/merge/preview` and `/lists/merge`.         |
| `src/lib/rsvp-api.ts`                       | Add `previewMerge` and `commitMerge` typed helpers.    |
| `src/pages/rsvp/rsvp-list-page.tsx`         | Row checkboxes, sticky bulk toolbar.                   |
| `src/components/rsvp/rsvp-merge-dialog.tsx` | New. Three-step dialog (target → conflicts → confirm). |
| `CONTEXT.md`                                | Already updated (no further changes needed).           |

No schema changes. No new migrations.
