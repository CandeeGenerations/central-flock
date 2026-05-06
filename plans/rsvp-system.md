# RSVP System

Track who's coming to events (Extravaganza, 4th of July, etc.) by attaching an RSVP list to a Group + Event. Per-person status (Yes / No / Maybe / No-Response), headcount, notes, and a one-click "Send Message" to chase responses.

Domain context lives in [/CONTEXT.md](../CONTEXT.md). This plan is the implementation playbook.

## Goals

- One place to track attendance for any event (linked from Calendar.app or standalone in-app).
- Seed an RSVP list from a Group; manually add/remove individuals after.
- Manual response entry with bulk actions and a "Send Message" handoff to compose.
- Auto-archive past lists; persist filters; mirror existing devotion-list-page UX.

## Non-goals (deferred)

- Inbound SMS reply parsing.
- Public RSVP link (planned as a future Netlify side-app calling back into the API).
- Year-over-year recurring-event reporting (group is the source of truth for the invite list).
- CSV export, printable attendee list, reminder scheduling.

---

## Phase 1 — Schema + migration

**File:** `server/db/schema-core.ts`

Append two tables:

```ts
export const rsvpLists = sqliteTable('rsvp_lists', {
  id: integer('id').primaryKey({autoIncrement: true}),
  name: text('name').notNull(),
  calendarEventId: integer('calendar_event_id').references(() => calendarEvents.id, {onDelete: 'set null'}),
  standaloneTitle: text('standalone_title'),
  standaloneDate: text('standalone_date'), // 'YYYY-MM-DD'
  standaloneTime: text('standalone_time'), // 'HH:MM' or null
  createdAt: text('created_at')
    .default(sql`(datetime('now'))`)
    .notNull(),
  updatedAt: text('updated_at')
    .default(sql`(datetime('now'))`)
    .notNull(),
})

export const rsvpEntries = sqliteTable(
  'rsvp_entries',
  {
    id: integer('id').primaryKey({autoIncrement: true}),
    rsvpListId: integer('rsvp_list_id')
      .notNull()
      .references(() => rsvpLists.id, {onDelete: 'cascade'}),
    personId: integer('person_id')
      .notNull()
      .references(() => people.id, {onDelete: 'cascade'}),
    status: text('status', {enum: ['yes', 'no', 'maybe', 'no_response']})
      .default('no_response')
      .notNull(),
    headcount: integer('headcount'),
    note: text('note'),
    respondedAt: text('responded_at'),
    createdAt: text('created_at')
      .default(sql`(datetime('now'))`)
      .notNull(),
    updatedAt: text('updated_at')
      .default(sql`(datetime('now'))`)
      .notNull(),
  },
  (t) => [uniqueIndex('rsvp_entries_list_person_uniq').on(t.rsvpListId, t.personId)],
)
```

Re-export from `server/db/schema.ts`.

**Steps (follow in order — workflow memory: stop service before migration):**

1. Stop launchd service.
2. `pnpm db:generate` — review the generated migration.
3. `pnpm db:migrate`.
4. Restart launchd service.
5. `pnpm lint` then `pnpm prettier`.

---

## Phase 2 — Backend routes

**File:** `server/routes/rsvp.ts` (new). Mounted at `/api/rsvp` in `server/index.ts` (or wherever routes register).

Endpoints:

| Method   | Path                             | Purpose                                                                                                                                                                                                                                         |
| -------- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET`    | `/api/rsvp/lists?archived=false` | All lists; `archived=false` → only those whose effective event date is today or future (or has no date).                                                                                                                                        |
| `GET`    | `/api/rsvp/lists/:id`            | List metadata + entries (joined with person) + summary counts.                                                                                                                                                                                  |
| `POST`   | `/api/rsvp/lists`                | Create list. Body: `{ name, calendarEventId?, standaloneTitle?, standaloneDate?, standaloneTime?, seedGroupIds?: number[], seedPersonIds?: number[] }`. Server seeds entries from the union (deduped) of group members and explicit person IDs. |
| `PATCH`  | `/api/rsvp/lists/:id`            | Update name / standalone fields / calendarEventId.                                                                                                                                                                                              |
| `DELETE` | `/api/rsvp/lists/:id`            | Cascade-delete entries.                                                                                                                                                                                                                         |
| `POST`   | `/api/rsvp/lists/:id/entries`    | Add people. Body: `{ personIds: number[] }`. Skips duplicates via unique index.                                                                                                                                                                 |
| `PATCH`  | `/api/rsvp/entries/:id`          | Update status / headcount / note. Server sets `respondedAt` when status transitions from `no_response`; auto-defaults `headcount` to 1 when status becomes `yes` or `maybe` and current headcount is null.                                      |
| `POST`   | `/api/rsvp/entries/bulk`         | Body: `{ ids: number[], status?, removeFromList?: boolean }`. For multi-select toolbar.                                                                                                                                                         |
| `DELETE` | `/api/rsvp/entries/:id`          | Remove from list.                                                                                                                                                                                                                               |

**Effective event date logic:** `COALESCE(calendarEvents.startDate (date portion), rsvpLists.standaloneDate, NULL)`. Computed in SQL where possible, fallback in route handler.

---

## Phase 3 — Frontend API client

**File:** `src/lib/rsvp-api.ts` (new). Mirror style of `src/lib/api.ts`. Exports typed functions for every endpoint above plus types `RsvpList`, `RsvpEntry`, `RsvpListSummary`.

---

## Phase 4 — Frontend pages and components

**Directory:** `src/pages/rsvp/`

- `rsvp-list-page.tsx` — Index page. `Card`-wrapped filter bar (search + "Show past" toggle), table of lists with columns: Name | Event Date | Counts (Y/N/M/NR) | Expected attendees | Created. Click row → detail. "+ New RSVP List" button.
- `rsvp-detail-page.tsx` — Detail page. Header (name, event date/time, Send Message button with count badge, Edit list, "+ Add Person", "Delete list"). Summary block (counts + Expected attendees + Response rate). Filters (search + status MultiSelect, persisted via `usePersistedState`). Table: Name | Status (Select) | Headcount | Note (truncated) | Responded At | Edit icon. Multi-select toolbar with bulk actions.

**Components in `src/components/rsvp/`:**

- `rsvp-list-create-dialog.tsx` — Create dialog. Fields: name (autofills from event title), event picker (tabs: "Calendar event" search vs "Standalone" with date/time inputs), seed source (Group MultiSelect + optional individuals).
- `rsvp-list-edit-dialog.tsx` — Edit metadata.
- `rsvp-add-person-dialog.tsx` — Modeled on the Group "Add Members" dialog (`src/pages/group-detail-page.tsx:404`). Excludes already-on-list people; multi-select.
- `rsvp-entry-edit-modal.tsx` — Modal with headcount + note fields, opened by the row's edit icon.

**Routing:** add to `src/App.tsx` — `/rsvp`, `/rsvp/:id`.

---

## Phase 5 — Integrations

1. **Sidebar (`src/components/sidebar.tsx`):** add "RSVPs" link under the existing Calendar section.
2. **Group detail (`src/pages/group-detail-page.tsx`):** "+ Start RSVP list" button → opens create dialog with this group pre-selected.
3. **Calendar event detail / agenda:** "+ Start RSVP list" action → opens create dialog with `calendarEventId` pre-attached and name auto-filled to the event title.
4. **Send Message handoff:** clicking "Send Message (N)" navigates to the compose page with `recipientMode='individual'` and `selectedIndividualIds` set to the currently-filtered RSVP entries' person IDs. Confirm the compose page accepts these via URL/state — likely needs a small adjustment to its initial-state hydration.
5. **Dashboard (`src/pages/dashboard-page.tsx`):** small "Active RSVPs" card listing up to N upcoming lists with counts. Link each to its detail page.
6. **kbar / command palette (`src/components/command-palette.tsx`):** register actions:
   - "Open RSVPs" → `/rsvp`.
   - "New RSVP list" → opens create dialog.
   - Each active RSVP list as a searchable item → its detail page (similar to how People/Groups are likely registered).

---

## Phase 6 — Polish

- Empty states for the index page ("No active RSVP lists. Start one from the Calendar or a Group.") and detail page ("This list has no people yet — add some.").
- Toasts for create/update/delete via `sonner`.
- Confirm dialogs for "Delete list" and "Remove N from list" via existing `ConfirmDialog`.
- `pnpm lint` + `pnpm prettier` before stopping.

---

## Acceptance walkthrough

1. From the Calendar agenda, click "+ Start RSVP list" on the next Extravaganza. Dialog opens with the event pre-attached and name pre-filled. Pick the "Members" group as seed. Create.
2. Detail page shows all members with status = No-Response. Counts: Y 0 / N 0 / M 0 / NR 50.
3. Set Dave to Yes — headcount auto-fills to 1; he can be edited to 4 via edit modal. Counts update.
4. Filter to Status = No-Response. "Send Message (32)" button opens compose pre-populated with those 32 individuals.
5. Click "+ Add Person," search for sister-in-law, add — she appears as No-Response.
6. After the event passes, the list disappears from the default RSVPs view; "Show past" reveals it.
7. From kbar, type "extravaganza" — the list is findable globally.
