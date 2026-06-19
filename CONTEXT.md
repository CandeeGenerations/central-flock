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

**Specials and Schedules are the same rows.** A Sunday AM/PM cell on a [[Special Music schedule]] is a `special_music` row. Adding a singer to a future date creates a `will_perform` row; the daily transition job moves it to `needs_review` once the date passes; song details are filled in later from the Specials detail page. `song_title` is **nullable** to allow scheduled-but-unsung rows. The schedule view shows only the fields visible on the printed page (performers + override label); the Specials page handles the rest.

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

### RSVP list merge

Folding multiple RSVP Lists into one. Directional: the user picks one selected list as the **target** (its id, URL, name, and event metadata survive) and the others become **sources** (hard-deleted after their entries are absorbed). N ≥ 2 sources supported in a single merge. Cross-event merges are allowed — target's event link wins regardless of what sources were linked to.

**Trigger:** row checkboxes on `/rsvp`; when ≥2 lists are checked, a sticky toolbar surfaces "Merge lists…" (mirrors the RSVP detail page's bulk-action toolbar pattern). The dialog flow is: target picker (radio, pre-selected to the list with the most entries) → conflict picker (only if any overlapping people) → confirm screen → commit.

**Conflict resolution:** a person on more than one of the selected lists is a conflict. The picker shows one row per conflicted person with a radio per side displaying the full entry summary (`status`, `headcount`, `note`, `respondedAt`). Default pre-selects the **most-informative** side (a real response beats `no_response`; non-null headcount/note breaks further ties; target wins true ties). Selection is **whole-entry** — the chosen side's row survives intact (including its `publicToken`); the other side's row is deleted. No field-mixing.

**Token & URL behavior:** the chosen entry's `publicToken` is what survives the merge for that person. This means any public RSVP URL pointing at a _non-chosen_ entry — including target's own existing URL when the user picks a source-side entry — will 404 after the merge. The confirm screen surfaces a one-line warning ("N public RSVP links from removed entries will stop working") whenever there is at least one conflict or non-empty source.

**Confirm screen contents:**

- Merged-list size (was → will be).
- Conflict count with target/source split (e.g., "5 conflicts: 3 keep target, 2 keep source").
- Names of source lists that will be deleted.
- "Event stays: <event title>" line confirming target's event metadata survives.
- Cross-event line when any source linked to a different calendar event than target (e.g., "⚠ 'Choir' is linked to a different event (Picnic). Its 12 entries will be folded in.").
- Broken-URL warning (see above).
- Hard delete; no soft-delete window, no undo. The multi-step gate (select → target → picker → confirm) is the safety net.

### Normal Schedule

The recurring weekly service schedule printed on the church's monthly calendar (e.g. "Sunday School 9:30", "Wednesday Prayer 7:00"). Rendered in the **footer** of every printed page. Three weekday slots — **Sunday, Wednesday, Saturday** — also get a small italic "Normal Schedule" label in their calendar cell pointing at the footer (`calendar-grid.tsx:245-250`).

The Normal Schedule has a **default** (used every month unless overridden) and an optional **per-month override** stored on `calendar_print_pages.normalScheduleText`.

### Schedule item

A single line on the Normal Schedule. Structured (not freeform text). Fields: `text`, `bold`, `column` (1 or 2 in the footer's two-column layout), `eligibleDays` (subset of `['sun','wed','sat']` indicating which weekday slots this item is allowed to appear in as an inline override), plus a `sortOrder`. A `spacer` item type preserves blank-line spacing in the footer. Replaces the prior freeform-text representation in a one-time migration that diff-checks footer HTML output to guarantee visual fidelity.

### Inline schedule override

A per-cell override of the small "Normal Schedule" label on a Sun/Wed/Sat cell. Instead of the label (which points at the footer), the cell renders a selected subset of Schedule items inline. Stored as `inlineItemIds: number[] | null` on a `calendar_print_day_overrides` row keyed by date — `null` (or no row) means "use default label behavior"; a non-empty array means "render these items inline, suppress the label." An empty array collapses back to the default (saving zero items is treated as a no-op; explicit silence uses the existing `suppressNormalSchedule`/`no_kaya` event mechanism).

**Snapshot semantics:** master-schedule edits to an item's `text` flow through; master-schedule additions/deletions do not retroactively change existing cell selections.

**Eligibility:** the per-cell picker only shows Schedule items whose `eligibleDays` includes that cell's weekday (e.g. Saturday cells only see items tagged `sat` — typically cleaning and visitation). Default for a new item is all three slots checked.

**Inline render:** items are pinned to the bottom of the cell (same anchor as today's "Normal Schedule" label, `marginTop: 'auto'`) at 9pt, line-height 1.15, centered. Each item's `bold` flag carries through inline. `column` is ignored inline (cells are single-column). No truncation or auto-shrink — overflow risk is surfaced at edit time, not render time.

**Overflow warning:** the picker shows a live "fits / borderline / will clip" indicator based on selected item count vs. a known per-cell line ceiling (~3 comfortable, 4 tight, 5+ likely clipped). The user chooses to accept the risk.

**Bulk apply:** the picker includes "Apply this selection to all [Sundays|Wednesdays|Saturdays] in [Month]". Confirms loudly when some target cells already have overrides ("3 already customized — overwrite?"). No top-level "edit all" entry — bulk apply is always launched from a single cell.

**Interaction with events:** event-level `suppressNormalSchedule` and `no_kaya` continue to win — a cell with either of those hides the inline schedule the same way it hides today's label.

### Day editor

The single dialog that opens when a Sun/Wed/Sat (or any) cell in the calendar print preview is tapped. Replaces the per-date entry points scattered across the old left-column Events card. Two sections inside:

- **Events** — same form fields and add/edit/duplicate/delete actions that exist today, scoped to this date.
- **Inline Schedule** — only shown for Sun/Wed/Sat. The picker described in `Inline schedule override`. Hidden on Mon/Tue/Thu/Fri.

Title shows the weekday and full date (e.g. "Sun, May 17, 2026"). One entry point, all per-day concerns in one place.

### Calendar print editor (interactive preview)

The Calendar Print Page's preview is the primary editing surface, not a passive render. Every in-month cell is tappable (the whole cell — no persistent affordance chrome; cursor change on desktop, `:active` flash on tap). Tapping opens the Day editor.

The page must continue to work on iPad — affordances are touch-first (no hover-only reveals), reorder uses up/down arrow buttons (not drag-and-drop), and tap targets stay at full cell size.

**Capture-target split:** the visible interactive preview is a wrapper component (`CalendarGridEditor`) around the existing pure-render `CalendarGrid`. PDF/JPG export still captures the hidden offscreen `CalendarGrid` directly via `captureRef` — editor chrome, hover states, and click handlers exist only on the visible copy and never reach the print output.

**All-events overview:** a small read-only collapsible "Events this month" section persists in the left column for skimming a sorted-by-date list of events (catches typos and wrong dates faster than visual grid scan). No edit affordances — all editing flows through the Day editor.

### Schedule

A printable document that lists who is doing what on which date — Nursery workers, Special Music performers, future Sunday School teachers. All Schedules share an envelope (title, scope, status, logo, footer text blocks) but each Schedule type has its own body shape.

Stored as a row in the **`schedules`** table (the **envelope**). The envelope row holds: `id`, `schedule_type` (`nursery` | `special_music` | future `sunday_school`), `scope_kind` (`monthly` | `date_range`), `month` + `year` (when monthly), `scope_start` + `scope_end` (when date_range), `scope_label`, `status` (`draft` | `final`), timestamps. Per-type **body** tables (`nursery_assignments`, special_music rows queried by date range) carry the actual contents.

### Schedule type

Discriminator on `schedules.schedule_type` selecting which body to render, which generator to run, which singer/worker pool to read from, and which type-defaults (title prefix, footer blocks) apply. Initial types: `nursery`, `special_music`. Future: `sunday_school`.

### Schedule scope

The date range a Schedule covers.

- **Monthly scope** (`scope_kind='monthly'`): used by Nursery. The `month` + `year` columns drive Nursery's borrowed-pair logic (see _Special Music vs Nursery scope_). `scope_start`/`scope_end` are unused.
- **Date-range scope** (`scope_kind='date_range'`): used by Special Music and (future) Sunday School. `scope_start` and `scope_end` are arbitrary Sundays — Special Music schedules can span any number of weeks. `month`/`year` unused.

### Scope label

Editable display string shown in the Schedule's title (e.g., "January 2026", "Summer 2026", "2026"). Auto-populated from the scope (monthly → `${monthName} ${year}`, date_range → `${year}` or `${startMonth}–${endMonth} ${year}`) but always user-editable. Renders as `${settings.<type>.titlePrefix} ${scope_label}`.

### Schedule envelope vs body

**Envelope** = the `schedules` row + per-type settings (title prefix, footer blocks, logo). Owns what every Schedule has in common.

**Body** = per-type rows describing the actual contents:

- **Nursery body** = rows in `nursery_assignments` (FK → `schedules.id`). Generated by the fairness scorer (`server/services/nursery-scheduler.ts`).
- **Special Music body** = rows in `special_music` queried by date range and service type. No FK from `special_music` to `schedules` — schedules are _views over a date range_, not owners. Deleting a Schedule leaves the specials intact. New specials created via the Specials page automatically appear on any overlapping Schedule.
- **Sunday School body** (future) = its own body table.

### Special Music schedule

A `schedule_type='special_music'` envelope rendering a two-column grid (Sunday AM / Sunday PM) over the Sundays in its date-range scope. Each cell shows a `special_music` row's performers + override label (no song title, no other Specials fields — only the fields visible in the printed image). Empty cells are virtual until clicked; clicking creates a `special_music` row.

The schedule does not auto-fill assignments. Casting is a pastoral decision and there's no fairness/rotation scorer — the page provides a _manual editor with autocomplete + "last sang" hints_ rather than a generator.

### Singer pool

The set of `people` eligible to appear in the Special Music schedule's cell editor. Configured via a settings key `schedules.specialMusic.singerGroupIds` — a multi-select of existing **Groups** (the SMS-recipient kind). Members of all selected Groups are unioned with **deduplication** (a person in both "Singers" and "Pianists" appears once).

No `singers` table. The Group is the curation primitive.

### Override label

Optional text on a special_music row (reusing the existing `service_label` field) that **replaces the type prefix** in the schedule rendering. With no override, the cell renders `${type.toUpperCase()} – ${performerList}` (e.g., "DUET – Tyler and Carissa"). With an override, the cell renders `${overrideLabel} – ${performerList || 'TBA'}` (e.g., "MEN'S GROUP – TBA", "HISPANIC SPECIAL – TBA", "LADIES TRIO – TBA"). When no performers are assigned, the performer list shows "TBA".

### Schedule logo

Single global logo image stored under a `settings.schedulesLogoPath` key (core `settings` table, not `nursery_settings`). Used as the header art on every Schedule's printed page across all types. Uploads land in `$UPLOADS_DIR/schedule-logos/` (replacing the prior `nursery-logos/` directory; a one-time migration moves the existing file).

### Schedule footer blocks

A configurable list of text blocks rendered at the bottom of every printed Schedule of a given type. Stored as a settings key per type (`schedules.<type>.footerBlocks` — JSON array of `{kind: 'quote' | 'note' | 'spacer', text, bold?}` objects). **Settings-only, no per-instance override** — editing the default changes what every current and future printed Schedule of that type renders. Historical schedules don't store frozen footer copies; re-exporting an old schedule renders today's footer.

The Special Music type seeds with the Psalm 9 quote and the two reminder bullets from the printed sample. Nursery seeds with an empty array (today's Nursery print has no footer).

### Schedule title prefix

Per-schedule-type settings key (`schedules.<type>.titlePrefix`) holding the fixed half of the title. The full title is `${titlePrefix} ${scopeLabel}`. Defaults: Nursery = "Nursery Schedule", Special Music = "CBC Special Music Schedule". Editable from the Schedules settings page.

### Schedule cell editor (Special Music)

Inline popover opened by clicking a cell on the Special Music schedule. Fields: **performers** (multi-select people picker filtered to the deduplicated singer pool), **guest performers** (freeform strings with autocomplete from prior distinct values — captures "Wengers", "Candees", etc.), **override label** (freeform with autocomplete from prior distinct `service_label` values — captures "Men's Group", "Hispanic Special", "Ladies Trio"). Type (solo/duet/trio/group) is derived from total performer count and editable inline.

Song title, hymn link, YouTube, sheet music, occasion, notes are **not** edited in the popover — a "Open in Specials →" link routes to the existing Specials detail page for full editing.

Auto-saves on close. Empty popover save deletes the underlying row (returns the cell to its virtual state).

### Special Music vs Nursery scope

Nursery uses `scope_kind='monthly'` because its generator semantics depend on month boundaries (the 5-Sundays rule, the borrowed-pair carryover from prior month). Special Music uses `scope_kind='date_range'` because casting decisions don't respect month boundaries — a singer's "last sang N weeks ago" hint reaches across months freely. Different scope kinds, same envelope.

### Schedule master editor

Replaces the current freeform-text editor (today's "Edit default" and per-month "Override" textareas). A row-based form: each row is one Schedule item with inline-edit `text`, `bold` toggle, `column` picker (1/2), `eligibleDays` checkboxes, and up/down arrow reorder. "+ Add item" and "+ Add spacer" at the bottom. A live footer preview renders alongside the editor — the same `FooterContent` component fed by the in-progress rows — so visual fidelity is verifiable as you edit.

Same editor reused for the default schedule and per-month overrides (only `scopeType`/`scopeId` differs). The textarea is gone — no fallback path. Migration is one-way.

### Message recipients

The audience for a draft, scheduled send, or sent message. Composed from three sources:

- **Groups** — zero or more [[Group]]s, joined via the `message_groups` / `draft_groups` junction tables. Selecting multiple groups _unions_ their memberships; a person in both "Singers" and "Nursery Workers" appears once.
- **Individuals (`selectedIndividualIds`)** — people added on top of the group union. In Group mode they are "extras outside the groups"; in Individual mode they are the entire audience.
- **Excludes (`excludeIds`)** — people removed from the union. Global, not per-group: an exclude removes the person regardless of which group brought them in.

Final audience = `(union of all selected groups' members) ∪ selectedIndividualIds − excludeIds`. Set semantics; dedup automatic.

**Snapshot timing.** Recipients are resolved to a fixed `recipientIds` list **at the moment Send or Schedule is clicked**, not at fire time. A scheduled send freezes its audience when scheduled. Reopening a draft re-derives live counts from the current group memberships, but those counts are advisory until commit.

### Recipient mode

Discriminator on `drafts.recipient_mode` selecting how the compose UI assembles the audience. Two values:

- **`group`** — picker shows the multi-select group chips with associated extras (`selectedIndividualIds` outside any selected group) and excludes (`excludeIds` from within the union). Zero groups picked = empty audience, Send disabled (mirrors Individual mode's empty state).
- **`individual`** — picker is a flat people search; `selectedIndividualIds` is the entire audience. No group or exclude semantics.

Mode is sticky: removing the last group chip does not auto-switch the user to Individual mode — they explicitly picked Group mode and the mode choice survives an empty chip list.

### Mobile primary tabs

The four group tabs always visible in the mobile bottom nav, between Home (left) and More (right). Bound to `navGroups[0..4]` in `src/lib/nav-config.ts` — the **first four groups in declaration order**. There is no separate pinned-tabs config; reordering `navGroups` reflows the mobile primary strip. Currently People, Messaging, Devotionals, Schedules.

### Mobile in-group bar

When the user is inside a [[nav group]] (e.g., `/devotions/scriptures`), the bottom bar swaps from primary tabs to that group's children — `Home · first 4 children · More`. Same "first N from declaration order" rule as the primary tabs. Children beyond the 4th are reached via [[More sheet]]. Only Devotionals exceeds 4 children today.

### More sheet

A bottom sheet opened by tapping the "More" tile on the mobile bottom nav. Renders the **full nav tree** — every group, each expandable to its children — using the same `CollapsibleNavGroup` component as the desktop sidebar. Includes the [[Mobile primary tabs]] groups too: the sheet is reliably "everything," not "the leftovers." Every leaf in the app is two taps from anywhere (More → leaf).

### Message recipient label

The "Recipients" cell on the message history table renders the audience compactly:

- **0 groups, ≤ 2 individuals:** comma-joined names.
- **0 groups, ≥ 3 individuals:** first 2 names + "+ N more" with a tooltip listing all names.
- **Group send:** comma-joined group names. When the rendered line would overflow or when extras exist, a single merged "+ N more" affordance ends the line; its tooltip is sectioned ("Groups: …", "Extras: …").

### Fair Booth Schedule

A `schedule_type='fair_booth'` envelope rendering a dense per-hour signup grid across the 9-day county fair (Friday through the following Saturday). The grid (page 1) shows initials with role markers (dashes for the shift role, stars for the whole-fair role) and partial-time annotations like `(5-7)`; the roster (page 2) is the legend mapping initials to names plus per-person signup counts. See [docs/adr/0009-fair-booth-schedule.md](docs/adr/0009-fair-booth-schedule.md).

Unlike Nursery (auto-generated) and Special Music (cell editor), Fair Booth uses a per-day sub-page editor — the rendered grid is read-only WYSIWYG with click-to-route hotspots on day columns and roster rows.

### Fair day

A virtual day in a Fair Booth schedule. Days are not stored; they're derived from `schedule.scope_start` (always a Friday) and a hardcoded day-of-week → slot-pattern map. The pattern is fixed:

- **Sat / Sun / Tue** — two slots: `2:00–6:00 PM` and `6:00–10:00 PM`.
- **Fri / Mon / Wed / Thu** — one slot: `5:00–10:00 PM`.

If the local fair ever changes shape (different start day, different hours, different run length), this hardcoded map becomes a code change.

### Fair slot

A named time band within a Fair day. Slots are render-only — sign-ups are stored as arbitrary `(start_minute, end_minute)` ranges on `fair_booth_signups`, not FK'd to a slot. Slots drive the day-header layout (`(7-6 // 8-7)` style counts) and the "Spans both" / "Slot 1" / "Slot 2" add buttons in the [[Fair day editor]].

### Fair Booth signup

A single row in `fair_booth_signups`: `(schedule_id, person_id, day_date, start_minute, end_minute, shift_role, sort_order, display_row_override?)`. Times are minutes-since-midnight at 30-minute granularity. A person who works both slots of a 2-slot day is one row spanning the full range, not two. Render placement (which slot column shows the entry) is determined by "majority of hours in slot wins; ties to the later slot."

### Shift role

Per-signup enum on `fair_booth_signups.shift_role`: `unit_leader` (1 dash), `asst_unit` (2 dashes), `worker` (3 dashes). Rendered as the dash prefix on the initials. At most one Unit Leader and one Asst Unit Leader are allowed per (schedule, day, slot); enforced in the editor and validated on save. Workers are unbounded and reorderable within the tier via `sort_order` ↑↓ in the [[Fair day editor]].

### Fair role

Per-schedule enum on `fair_booth_roster_attrs.fair_role`: `worker` (1★), `asst_unit` (2★), `unit_leader` (3★), `asst_fair_mgr` (4★), `fair_mgr` (5★). Rendered as the star suffix on the initials. Caps the [[Shift role]] a person can be assigned: 1★ → worker only; 2★ → up to asst_unit; 3★/4★/5★ → up to unit_leader. The cap is a soft enforcement in the editor (the dropdown hides higher tiers), not a DB constraint.

### Fair roster

The set of `people` eligible to appear on the Fair Booth schedule. Configured via `schedules.fairBooth.rosterGroupIds` — a multi-select of existing **Groups** (the SMS-recipient kind), members union'd and deduplicated. **Live, not snapshot** — mid-season Group adds/removes propagate immediately. People who were removed from the Group but still have signups on the grid render as a soft warning in the schedule UI; the operator resolves manually.

### Fair Booth roster attrs

Sparse per-schedule per-person overrides in `fair_booth_roster_attrs`. A row only exists when the user has set a non-default. Carries `fair_role` and `initials_override`. Reading the roster left-joins this table against the live roster pool; missing rows use defaults (`fair_role='worker'`, computed initials).

### Initials and collision resolution

Display initials = `firstName[0] + lastName[0]`, uppercased, computed at render time. When two people on the same schedule's roster would share the same 2-letter base, the **alphabetically-first person (by `lastName`, then `firstName`) keeps the base** and later names extend by walking first-name characters from position 2 and inserting a lowercased disambiguating slice between F and L (Becky Candee → `BeC` when Brandon Cobb keeps `BC`). Three-way collisions extend the second and third names until each is unique. Manual `initials_override` on `fair_booth_roster_attrs` always wins; overridden people are removed from the collision pool before the algorithm runs.

### Hispanic flag

`people.is_hispanic` boolean (default `false`). Used by the Fair Booth day-header coverage calculation. Edited from the Person detail page; surfaced read-write in the [[Fair Booth roster row modal]] for convenience (writes flow back to the same global column, with a one-line note that the change applies app-wide).

### Hispanic coverage

The Fair Booth day-header color is driven by Hispanic coverage across the **full day's hours** (union of `2:00 PM – 10:00 PM` on 2-slot days, `5:00 PM – 10:00 PM` on 1-slot days). Coverage = union of `is_hispanic = true` people's `[start, end)` signup intervals on that day. Full coverage of every minute → **green** header. Partial coverage (any gap, even one minute) → **yellow/orange**. Zero coverage → **red**. Multiple Hispanic people overlapping doesn't add to coverage; it's binary per minute.

### Headcount coloring and dotted transitions

Per-hour rows in the grid are colored by **headcount at that hour** (distinct people whose `[start, end)` overlaps the hour): ≤3 red, 4 orange, 5 yellow, 6 light blue/green, 7 blue, 8 green, >8 purple. A **dotted line** is drawn between hour rows within the same slot wherever the headcount changes from one row to the next. **Slot boundaries** (the 6 PM line on a 2-slot day) are always solid, not dotted.

### Day-header count format

`(openCount-closeCount)` per slot, separated by `//` for 2-slot days. `openCount` = headcount at the first minute of the slot; `closeCount` = headcount at the last minute. When `openCount == closeCount` the dash collapses to a single number. Examples from last year's run: Fri 8 → `(8)`, Mon 11 → `(10-6)`, Sat 9 → `(7-6 // 8-7)`, Sat 16 → `(4 // 6)`. The grand total above the title (`(32)` last year) is the count of distinct people on the live roster.

### Fair day editor

The sub-page at `/schedules/fair-booth/:scheduleId/day/:date` reached by clicking any cell in a day column on the schedule detail view. Header has back-to-schedule plus `← Prev day / Next day →` chevrons walking through the schedule's 9 days. Body: a live day-column preview (rendered identically to the print) above a signups table grouped by shift role with ↑↓ buttons for sort and a separate ↑↓ pair for `display_row_override`. Add affordance: three buttons on 2-slot days (`+ Add to Slot 1 (2–6)`, `+ Add to Slot 2 (6–10)`, `+ Add spanning both`), one button on 1-slot days. Auto-saves on every change.

### Fair Booth roster row modal

A modal opened by clicking a name row on page 2 of the schedule detail view. Fields: initials override (text; empty = use computed), fair role (1–5★ picker), Hispanic checkbox (writes to `people.is_hispanic` globally with a one-line note). Read-only signup count with "filter grid to this person" link. There is no "+ Add to roster" affordance on page 2 — roster membership flows from the configured Group(s) in settings.

### Page 1 / Page 2 layout

The Fair Booth schedule detail view shows two "pages" — the grid (page 1) and the roster legend (page 2). Layout is responsive: **side-by-side on desktop, stacked on mobile**. Both panes are clickable (grid cells → [[Fair day editor]], roster rows → [[Fair Booth roster row modal]]). PDF capture writes them as two pages; the on-screen layout doesn't affect capture.

### Roster ordering and column split

Page 2 sort order: fair role descending (`fair_mgr` → `worker`) → `lastName` ascending → `firstName` ascending. The single sorted list is split at its midpoint into two columns of equal length; each column's header carries a `(N)` count of names in that column, and the page-1 title carries a `(N)` of the total roster size.

### Italic and bold roster markers

On page 2: **italic** = on the roster but zero signups for this schedule. **Bold** = signup count is below `schedules.fairBooth.minSignupsForBold` (default `3`). Both markers are computed per render against the live data; neither is a stored flag.

### No draft/final lifecycle for fair_booth

Unlike Nursery and Special Music, Fair Booth schedules are always editable and always exportable. The shared `schedules.status` column stays at `'draft'` permanently for `schedule_type='fair_booth'` rows; the Fair Booth UI hides the status badge and the Finalize/Reopen buttons. Operationally, the sheet is reprinted weekly during the fair and gating exports behind "final" would mean flipping back to draft every time anyone signs up.

### Quote search

A topic-driven sermon-prep search under **Sermons** (route `/sermons/research`, history at `/sermons/searches`, backed by the `quote_searches` table). One free-text **topic** drives the search; results come from up to two sources, each gated by its own toggle (**both on by default**):

- **Quote portion** — searches the [[Quote library]] (the `quotes` table) and returns ranked quotes plus a synthesis paragraph. This is the original behavior. Stored as `quote_searches.synthesis` + `results` (an id+metadata JSON array rehydrated against current `quotes` rows on read).
- **Music portion** — searches the burgundy/silver songs and returns [[Song lyric quote]]s. Stored self-contained (see below).

The research form is the topic input + **two source toggles** (Quotes, Music — both on by default every visit, not persisted) + Search button, shown where the old "Recent searches" pills were (those pills are removed — request #1 — as the history list page is redundant with them). The history list (`/sermons/searches`) shows per-row **chips** indicating which portions a search has (`Quotes` / `Lyrics`). The Lyrics tab has no synthesis paragraph (quotes-only feature) and **two distinct empty states**: "not searched yet" (shows the Add-music CTA) vs. "searched, found nothing."

A search must have **at least one** portion (both toggles off is rejected / Search disabled). A search may therefore be quotes-only, music-only, or both — so `synthesis` and `results` are **nullable**. The table name `quote_searches` is kept despite music-only searches: a lyric is itself "a quote of a song," so both halves are quotes from different sources.

**Results UI** is a two-tab layout (`Quotes (N)` / `Lyrics (N)`, both tabs always present with live counts). The quote synthesis paragraph lives inside the Quotes tab. Default active tab is whichever portion has results (Quotes wins when both do; Lyrics for music-only). A portion that wasn't searched renders an **empty state with a CTA** in its tab — "Search music for this topic" on a quotes-only search, and symmetrically "Search quotes for this topic" on a music-only search (request #3, made bidirectional). Both CTAs hit the respective phase endpoint and fill in the missing portion of the existing search. While the music half runs, the Lyrics tab shows a spinner.

**Execution is two-phase.** `POST /api/quotes/research` creates the row and runs the (fast) quote portion inline, returning quotes immediately. The (slow, web-search) music portion runs via a separate `POST /api/quotes/searches/:id/music` call — fired automatically when the music toggle is on, and the **same** endpoint the "Add music" button (request #3) calls on an existing search. When the music call resolves, a plain sonner toast ("Lyrics ready — N songs") fires *while the user is still on the research page*; navigating away forgoes the toast (no app-level runner — kept simple).

**Re-run** (detail page) reproduces the original search's portion set as a new saved search (original preserved): quotes-only re-runs quotes, music-only re-runs music, a both search runs quotes inline and auto-fires the music phase.

### Song lyric quote

A music result inside a [[Quote search]]: the verse(s)/chorus(es) of a burgundy/silver hymn that fit the topic, for pasting into a message. The AI picks relevant hymns from stored `hymns` metadata, then sources the actual lyric text via web search (verified against the stored `first_line`); swappable to a hymnal-PDF corpus later. Result shape and sourcing strategy: see [docs/adr/0010-music-lyric-source.md](docs/adr/0010-music-lyric-source.md). Stored self-contained as a JSON blob on the `quote_searches` row (mirrors `hymn_searches.sections`) because lyrics aren't in the DB and can't be rehydrated by id.

**Copy:** each song result has a Copy button (songs only — quote results have no copy affordance; the user hand-copies the part of a quote they want). Copying yields the reference + excerpt — book, number, title, then the lyric excerpt — with a `toast.success('Copied')`.

**What's returned:** 3–8 songs (fewer if fewer genuinely fit — no padding), each with the burgundy/silver `BookNumberBadge`, title, author, the **relevant stanza excerpt** (complete verse(s)/chorus(es) only — never partial lines or the whole hymn), a "why this fits" note, a `relevance` of high/medium/low (same vocabulary as quote results), a `verified` flag, and the source URL. **No book filter in v1** — always searches both burgundy and silver. Full-hymn lookup is out of scope (the user reads the rest from the physical book).

Distinct from the [[Hymn suggestion]] feature, which takes title/scripture/theme/audience and returns a full worship-**service structure** (opening, congregational, special, invitation, flow) rather than quotable lyric excerpts.

### Quote library

The corpus of captured quotes in the `quotes` table (sourced from n8n, import, or manual entry), browsable at `/sermons/quotes`. The quote portion of a [[Quote search]] searches this corpus (FTS5 prefilter when large) and the AI returns quotes drawn only from it — never invented.

### Blank PDF export

A Fair Booth–specific export alongside the live PDF/JPG exports. Renders **page 1 with empty hour cells** (no signups, no counts in parens, uncolored headers, no dotted lines), and **page 2 with the live roster** (since people sign initials on the printed sheet and the roster is the legend). Available regardless of schedule state.
