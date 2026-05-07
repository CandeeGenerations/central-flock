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

### Special Music

A performance during a service — distinct from `hymns` (which are congregational song selections). Tracked in a `special_music` table under the **Music** nav as "Specials" (route `/music/specials`).

A Special is identified by a **date** + **service slot** + **performers** + **song**. Section title is "Special Music"; the entity noun is "Special."

### Service slot

The slot during the week that a Special is performed in. Modeled as an **enum** on `special_music`, not a link to `calendar_events` — recurring weekly services would force picking the right occurrence row, and "will perform" specials may be planned before the calendar event exists.

- `service_type` enum: `sunday_am`, `sunday_pm`, `wednesday_pm`, `other`
- Optional `service_label` text (e.g., "Christmas Eve," "Revival Night 2") — primarily used when `service_type = 'other'`.

### Special performers

A Special can have multiple performers. Modeled as junction + structured guest list:

- `special_music_performers (special_id, person_id, ordering)` — for performers in the `people` table.
- `special_music.guest_performers` — **JSON array of names** (e.g., `["Bobby Smith", "Smith Family"]`). One slot per name; "Smith Family" counts as one slot. Avoids polluting `people` with visitors/non-contacts.

`ordering` preserves billing ("John & Jane" vs "Jane & John"). Accompanists are not modeled separately — when not attaching them avoids inflating the performer count.

### Special song

A Special's song is stored on the `special_music` row with both freeform and structured fields:

- `song_title` (required, free text) — always the canonical display title.
- `hymn_id` (optional FK → `hymns.id`) — set when the song is from the burgundy/silver hymnals. Enables cross-reference reporting ("show all performances of burgundy 245").
- `song_arranger` (optional text) — for arrangements like "arr. Mark Hayes."
- `song_writer` (optional text) — for non-hymnal pieces.

Song picker UX: typeahead searches `hymns.title`, `hymns.first_line`, and `hymns.refrain_line`; selecting a hymn auto-fills `song_title` and `song_arranger` (still editable) and sets `hymn_id`. Free text is always allowed without picking a hymn.

### Special type

Enum: `solo, duet, trio, group, instrumental, other`. **Stored, not computed**, but auto-_suggested_ on save based on combined performer count (linked + guest):

- 1 → solo, 2 → duet, 3 → trio, 4+ → group

Manual override always wins (e.g., a single piano performer derives to "solo" but the user overrides to "instrumental"; a guest entry "Smith Family" derives to "solo" but overrides to "group"). The form suggests the derived type when performers change but never silently overwrites a manual choice.

### Special media

Each Special has at most:

- **One `youtube_url`** (optional text). When set, used for AI extraction at paste time.
- **One sheet music file** (optional). Stored at `$UPLOADS_DIR/special-music/<filename>` where `$UPLOADS_DIR` is configurable. The DB stores the relative path only.

**Uploads directory:** `UPLOADS_DIR` env var (default `./data/`). Production launchd plist points it at `~/Library/Mobile Documents/com~apple~CloudDocs/Backups/central-flock/`. Existing nursery-logos and scan-images directories are migrated under this same root in the same release. DB rows for those features are migrated to store relative paths (no `/data/` prefix).

### Special YouTube import

Pasting a YouTube URL triggers two complementary AI extractions, both from the same backend call:

1. **Metadata extraction** — fetch video title, description, and upload date (oEmbed or YouTube Data API). Claude parses into `date`, `song_title`, `performers` (names), and `type`.
2. **Transcript-based hymn matching** — fetch captions via `youtube-transcript` (existing dep, used in devotions). Match captions text against `hymns.title`, `hymns.first_line`, and `hymns.refrain_line`. If a match is found with high confidence, suggest `hymn_id`.

Performer name extraction returns plain strings; the form fuzzy-matches them to `people` rows. Unambiguous matches auto-link; ambiguous ones show candidates; unmatched names default to `guest_performers`.

**Trigger points (both supported):**

- **Review-queue path:** on a `needs_review` Special's detail page, paste URL → AI fills missing fields → you confirm → Mark Reviewed.
- **New-entry path:** on the new-Special page, paste URL → AI pre-fills the form → review and save.

### Special occasion tag

Optional `occasion` text field for thematic services (Easter, Christmas, Mother's Day, Revival, etc.). Free text with autocomplete from existing distinct values. Powers "show all Easter specials" queries.

### Special repeat warnings

On the new-Special form, soft (non-blocking) warnings surface when:

- **Song repeat:** the same `song_title` or `hymn_id` was performed within the last 8 weeks.
- **Performer repeat:** any of the linked performers did a Special within the last 4 weeks.

Implemented as form-time checks against `special_music` history; the warnings render as alerts above the save button but don't prevent submission. Window values configurable later if 8/4 weeks isn't right.

### Special status

Three-state machine: `will_perform`, `needs_review`, `performed`.

- **Created with date in future** → `will_perform`. **Created with date in past** → `needs_review`.
- **Auto-transition `will_perform` → `needs_review`** via a daily job in `server/services/scheduler.ts`: `UPDATE special_music SET status='needs_review' WHERE status='will_perform' AND date < date('now', 'localtime')`.
- **`needs_review` → `performed`** is gated by a **manual "Mark Reviewed" button**. Attaching a YouTube link does not auto-advance status — review is a deliberate check (verify performers, song title, attachments). YouTube attach is a _trigger_ to review, not the review itself.
- **Backwards transitions are date-driven, not user-picked.** A user never manually selects `will_perform`. Rules:
  - `performed` → `needs_review`: allowed via edit dialog (oops, needs another fix).
  - Any → `will_perform`: **only** by editing the date to a future value. The save handler auto-sets status to `will_perform` whenever `date > today`, regardless of the prior status.
  - The daily scheduler job picks back up from `will_perform` → `needs_review` once the new date passes.

Default list ordering: `needs_review` first (actionable), then `will_perform` (upcoming), then `performed` (history). Mirrors Devotion list pattern.

### Special UI

Pattern mirrors the **Devotion List page** (referenced elsewhere in this doc).

**`/music/specials` (list):**

- Filter card: `SearchInput` (song / performer name) + `Status` MultiSelect + `Service` MultiSelect + `Type` MultiSelect, persisted via `usePersistedState`.
- Sortable columns: Date · Service · Song · Performers · Type · Status · YouTube? · Sheet music?
- Default sort: `needs_review` pinned to top, then `will_perform`, then `performed` by date desc.
- "+ New Special" button top-right.

**`/music/specials/:id` (detail):**

- Header card: date · service · song · performers chip list · status badge with quick actions ("Mark Reviewed").
- Media card: YouTube embed when set; "Paste YouTube URL" + AI-extract button when not. Sheet music preview/upload widget.
- Edit fields card: inline form on the same page (no modal). Save mutates and invalidates the list query.

**`/music/specials/new`:** standalone page with a "Paste YouTube URL" helper at the top that pre-fills the form via AI extraction.

**Cross-links:**

- Person detail page: "Specials performed" section listing this person's linked specials.
- Hymn detail page: "Performances" section listing specials with `hymn_id = this.id`.

### RSVP list mutations

- **Add person to list:** `+ Add Person` button on the detail page opens a search dialog modeled after the "Add Members to Group" dialog (`src/pages/group-detail-page.tsx:404`). Excludes people already on the list. Multi-select; new entries default to status = No-Response.
- **Person deletion behavior:** cascade. `rsvp_entries.person_id` has `onDelete: 'cascade'` to mirror existing patterns (`peopleGroups`, `birthdayMessagesSent`).
- **Edit list metadata:** a list-edit dialog allows changing the name, standalone date/time, and (re)linking the Calendar event.
