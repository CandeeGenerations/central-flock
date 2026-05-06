# Central Flock — Domain Context

Glossary of domain terms used in Central Flock. Update inline as terms are resolved.

## Terms

### RSVP List

A tracker for who is coming to a specific Event. Seeded from a Group, then freely editable (add/remove people). Records each person's response (Yes / No / Maybe / No response), an optional headcount, and an optional free-text note.

### Event

The thing being RSVP'd to (e.g., Extravaganza, 4th of July). May be:

- **Linked Event** — a row from the synced `calendar_events` table (Calendar.app sync), or
- **Standalone Event** — an ad-hoc event created inside Central Flock with a title and date (no calendar link).

A single Event can have multiple RSVP Lists (e.g., "Extravaganza — Members" and "Extravaganza — Volunteers"). Each RSVP List has its own editable name, defaulting to the event title.

**Standalone Event fields:** title, date, optional time. No location (most events are on church grounds; not worth tracking). Stored **inline on `rsvp_lists`** rather than in a separate table — RSVP lists hold either a `calendar_event_id` (Linked) or `standalone_title` + `standalone_date` + `standalone_time` (Standalone). No `events` wrapper table.

### RSVP Entry

One person's row on an RSVP List. Always tied to a Person (`people.id`); guests-not-in-contacts are represented via headcount on the inviter's entry, not their own row. Fields: status, headcount, note, responded_at.

### Headcount

Total attendees represented by a single Yes RSVP (default 1, can be higher to cover spouse/kids/guests). Only meaningful when status = Yes.

### Group → RSVP List relationship

**Snapshot + manual edits.** Picking a Group when creating an RSVP List copies its current members in as RSVP Entries. After that, the list is independent: changes to the Group do not affect the list, and individuals can be added/removed on the list directly. Mirrors the existing `drafts` recipient pattern (group seed + selectedIndividualIds + excludeIds).

### RSVP input

Responses are entered manually by the app user as they arrive (text, in person, phone). No inbound SMS parsing; no public RSVP link in v1. Bulk actions (multi-select → set status, "mark all No-Response as No") are first-class. A public-facing RSVP page is a future project, likely a separate Netlify app that calls back into the Central Flock API.

### RSVP navigation

- Primary home: a sidebar link nested **inside the existing Calendar section** of the sidebar (lists all RSVP Lists, filterable by active/past).
- Secondary entry points: "+ Start RSVP list" button on the Group detail page (pre-seeds this group) and on the Calendar Event detail (pre-attaches this event).
- Dashboard: a small card surfacing active RSVPs with response counts.

### RSVP lifecycle

Lists are **auto-archived by date**: if the event date is in the past, the list is hidden from the default "RSVPs" view. A "Show past" toggle reveals them. No manual archive flag.

### RSVP UI reference

Visual and interaction patterns mirror the **Devotion List page** (`src/pages/devotions/devotion-list-page.tsx`): `Card`-wrapped filter bar, `SearchInput` + `MultiSelect`/`Select` filters persisted via `usePersistedState`, sortable table columns, and `Pagination`. Status changes mutate via TanStack Query and invalidate the list query.

**Status cell:** uses the standard `Select` component (same one used for the devotion filters) — shows current status, opens a dropdown with Yes / No / Maybe / No Response on click. Not a binary `CheckboxCell` since there are 4 states.

**Detail page table columns:** Name | Status (Select) | Headcount | Note (truncated) | Responded At | Edit icon. No phone column. Edit icon opens a modal for editing headcount and notes (matches existing edit-modal pattern in other tables). Headcount is editable for any status, not just Yes.

**Headcount default:** when an entry's status changes to Yes or Maybe and headcount is empty/null, auto-set headcount to 1. Don't touch headcount on transitions to No or No-Response (preserve any user-entered value).

**Detail page summary header:** Event title (RSVP list name) · event date · time. Below that: counts row (Yes / No / Maybe / No-Response / Total), then "Expected attendees: N" (sum of headcount where status='yes'), then a "Response rate: X% (responded/total)" line. Counts are display-only — table filters handle drill-down.

### Send Message from an RSVP List

A "Send Message (N)" button on the detail page. Audience = currently-filtered RSVP entries on the table (no filter = entire list). Clicking opens the message compose page in **individual recipient mode** (mirrors `drafts.recipientMode='individual'`) with `selectedIndividualIds` pre-populated. Button shows a count badge of the current audience size.

### RSVP detail page filters, sort, bulk actions

- **Filters:** `SearchInput` (by name) + Status `MultiSelect` (Yes / No / Maybe / No-Response). Persisted via `usePersistedState`.
- **Default sort:** last name ascending (matches the People list).
- **Bulk actions:** row checkboxes for multi-select; sticky toolbar appears when ≥1 row selected with actions "Set status →" (Yes / No / Maybe / No-Response), "Remove from list," "Clear selection." No top-level "Mark all No-Response as No" shortcut — multi-select covers it.

### RSVP list mutations

- **Add person to list:** `+ Add Person` button on the detail page opens a search dialog modeled after the "Add Members to Group" dialog (`src/pages/group-detail-page.tsx:404`). Excludes people already on the list. Multi-select; new entries default to status = No-Response.
- **Person deletion behavior:** cascade. `rsvp_entries.person_id` has `onDelete: 'cascade'` to mirror existing patterns (`peopleGroups`, `birthdayMessagesSent`).
- **Edit list metadata:** a list-edit dialog allows changing the name, standalone date/time, and (re)linking the Calendar event.
