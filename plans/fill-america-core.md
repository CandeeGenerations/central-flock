# Fill America — core

Campaigns, Households and the roster grid, plus a one-off import of four years of
`Fill America Stats.xlsx`.

Slice 2 of 3. Slice 1 is [sunday-school-stats.md](./sunday-school-stats.md) and must land first —
it renames the nav group this feature hangs off. Slice 3 is
[fill-america-dashboard.md](./fill-america-dashboard.md).

Two ADRs govern this work — read them first:

- [0032 — Unique Participants is derived, never stored](../docs/adr/0032-fill-america-unique-participants-is-derived.md)
- [0033 — Households are durable, Size is per-Campaign](../docs/adr/0033-fill-america-households-are-durable-with-per-campaign-size.md)

Terms (**Campaign**, **Season**, **Household**, **Roster Entry**, **Size**, **Campaign Week**,
**Tract Report**, **Door Hangers**, **Unique Participants**) are defined in
[CONTEXT.md](../CONTEXT.md).

## The problem

One workbook tab per campaign, 18 of them from Jun 2022 to Sep 2026, plus a `Grand Totals` tab of
cross-sheet references. Seventeen tabs share a layout; the oldest does not (see Phase 6). Each
campaign tab is two blocks side by side:

| Block                      | Columns                                         | Typed or derived                                                           |
| -------------------------- | ----------------------------------------------- | -------------------------------------------------------------------------- |
| Left, one row per Saturday | Date, Unique Participants, Tracts, Door Hangers | Tracts is `=SUM(H29)` — the roster column. Participants and Hangers typed. |
| Right, one row per family  | Name, Goal, Week 1, Week 2, Week 3, Total       | Weeks typed (tracts). Total is `=SUM(H2:J2)`.                              |

So of everything on the sheet, only four things are genuinely entered: a household's tracts per
week, its goal, and the week's participants and door hangers. Per ADR-0032, participants becomes
derived too — leaving three.

The headcount lives inside the row label (`Candees x 5`) and the labels mutate across four years.
That is what makes the import the hard part of this slice, not the schema.

## Phase 1 — Schema

New file `server/db/schema-fill-america.ts`, exported from `server/db/schema.ts`.

```ts
export const fillAmericaSeasons = ['spring', 'summer', 'fall', 'winter'] as const

// Durable participant unit. Name is the identity; Size lives on the Roster Entry.
fillAmericaHouseholds
  id, name TEXT NOT NULL, active BOOLEAN NOT NULL DEFAULT 1,
  sortOrder INTEGER NOT NULL DEFAULT 0, createdAt, updatedAt
  UNIQUE(name)

// Weeks are derived from (startDate, endDate) — never a stored count.
// Season is stored, defaulted from the start month. See CONTEXT.md.
fillAmericaCampaigns
  id, title TEXT NOT NULL,
  startDate TEXT NOT NULL, endDate TEXT NOT NULL,
  season TEXT NOT NULL,            // enum above
  createdAt, updatedAt
  UNIQUE(startDate)

// One week of a campaign. Holds exactly one typed number.
fillAmericaCampaignWeeks
  id, campaignId -> campaigns(id) ON DELETE CASCADE,
  weekNo INTEGER NOT NULL,         // 1-based
  weekDate TEXT NOT NULL,          // startDate + 7*(weekNo-1)
  doorHangers INTEGER,             // nullable: blank is not zero
  UNIQUE(campaignId, weekNo)

// A Household's participation in one Campaign.
fillAmericaRosterEntries
  id, campaignId -> campaigns(id) ON DELETE CASCADE,
  householdId -> households(id) ON DELETE CASCADE,
  size INTEGER NOT NULL DEFAULT 1,
  goal INTEGER,
  sortOrder INTEGER NOT NULL DEFAULT 0,
  UNIQUE(campaignId, householdId)

// The cell of the roster grid.
fillAmericaTractReports
  id, rosterEntryId -> rosterEntries(id) ON DELETE CASCADE,
  weekId -> campaignWeeks(id) ON DELETE CASCADE,
  tracts INTEGER,                  // nullable
  UNIQUE(rosterEntryId, weekId)
```

There is no `uniqueParticipants` column anywhere. ADR-0032.

Migration `0048_fill_america.sql`. Per [RUNBOOK.md](../RUNBOOK.md) production is the only DB —
stop the service, back up, migrate.

## Phase 2 — Derivation

`src/lib/fill-america-core.ts`, pure and import-safe from both sides, in the manner of
`src/lib/sunday-school-roll-core.ts`:

```ts
campaignWeekDates(startDate, endDate): string[]   // start, +7, … through end
defaultSeason(startDate): Season                  // Mar/Apr spring, Jun/Jul summer,
                                                  // Aug/Sep fall, Dec winter; else nearest
defaultTitle(startDate, endDate): string          // "Jun 20 – Jul 4, 2026"
```

**Unique Participants** — the one rule everything else leans on, per ADR-0032:

- **Campaign** = `sum(size)` over roster entries with any `tracts > 0` in any week.
- **Campaign Week** = the same sum, restricted to households whose _first_ week with `tracts > 0`
  is this one. The weekly figures therefore add up to the campaign figure exactly.

Blank and `0` both mean "did not participate" for this purpose. A household that went out and
reported nothing is invisible; the roster is the only evidence there is.

**Tracts** for a week is `sum(tracts)` over that week's reports. Never typed, never stored.

## Phase 3 — Server

New `server/routes/fill-america.ts` at `/api/fill-america`.

| Method                | Path                                 | Notes                                                                                                 |
| --------------------- | ------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| GET                   | `/households`                        | `?includeInactive=1`; adds `campaignCount`, `totalTracts`                                             |
| POST / PATCH / DELETE | `/households[/:id]`                  | delete 409s when referenced; retire via `active`                                                      |
| GET                   | `/campaigns`                         | list + derived totals per campaign                                                                    |
| POST                  | `/campaigns`                         | `{startDate, endDate, season?, title?}`; creates weeks; copies the previous campaign's roster forward |
| PATCH                 | `/campaigns/:id`                     | dates, season, title. Changing dates reconciles weeks — see below                                     |
| DELETE                | `/campaigns/:id`                     | cascades                                                                                              |
| GET                   | `/campaigns/:id`                     | full grid: weeks, roster entries, tract reports, all derived totals                                   |
| PUT                   | `/campaigns/:id/weeks/:weekNo`       | `{doorHangers}`                                                                                       |
| PUT                   | `/campaigns/:id/roster/:householdId` | `{size, goal}`; creates the entry if absent                                                           |
| DELETE                | `/campaigns/:id/roster/:householdId` | removes from this campaign only                                                                       |
| PUT                   | `/campaigns/:id/tracts`              | `{householdId, weekNo, tracts}`; `null` clears                                                        |

Editing a campaign's dates adds or removes trailing weeks. Removing a week that has any non-null
tract report or door-hanger count must 409 rather than silently discard data.

## Phase 4 — Client

`src/lib/fill-america-api.ts` and `query-keys.ts` entries, following the slice-1 pattern.

**`campaign-list-page.tsx`** at `/fill-america` — table of campaigns newest first: title, dates,
**Season** badge, and derived Unique Participants / Tracts / Door Hangers. `New Campaign` dialog
takes start and end dates, showing the derived week count, the defaulted title and the defaulted
Season, both editable. Mirror `src/pages/sunday-school-roll/roll-list-page.tsx`, including its
`?new=1` handling so the command palette can open the dialog directly.

**`campaign-view-page.tsx`** at `/fill-america/:id` — the sheet, in two stacked cards:

1. **Weeks** — one row per **Campaign Week**: date, Unique Participants (derived, greyed), Tracts
   (derived, greyed), Door Hangers (editable). Totals row.
2. **Roster** — one row per **Roster Entry**: household name, Size, Goal, a tracts input per week,
   and a derived row total. Footer sums each column. `Add household` picks from active Households
   or creates one inline. Save on blur, optimistic; every write invalidates the campaign query so
   the derived columns refresh.

Show the campaign's Top 10 single-week efforts on this page; the all-time boards are slice 3.

**`households-section.tsx`** — settings pane, another copy of `service-times-section.tsx`.

## Phase 5 — Nav, routes, palette

- `src/lib/nav-config.ts` — add `{to: '/fill-america', label: 'Fill America', icon: Megaphone}` to
  the `attendance` group (now labelled **Ministry Stats**), after Sunday School.
- `src/App.tsx` — `/fill-america`, `/fill-america/:id`, and `households` under
  `/attendance/settings`.
- `attendance-settings-layout.tsx` — add the Households section.
- `src/lib/search/providers/fill-america-campaigns.ts`, registered in `providers/index.ts`, and a
  `GROUP_ORDER` + `PREFIX_TO_GROUP` entry in `src/components/command-palette.tsx`. Set `navPath` on
  its items so Recents de-dupe.
- `server/services/usage-entity-resolver.ts` — a `/fill-america` resolver returning the campaign
  title. Per [CLAUDE.md](../CLAUDE.md) this is required for any `/section/:id` route; without it the
  Recents entry reads "Fill America #7" and a dev-only console warning fires.

## Phase 6 — Backfill

`scripts/backfill-fill-america.ts`, run once, reading `~/Desktop/Fill America Stats.xlsx` and the
reviewed merge map at `scripts/data/fill-america-households.json`.

### The merge map

**114 distinct roster labels** across 18 campaigns resolve to **61 Households**. The mapping is a
reviewed artifact, not an algorithm:

- [`scripts/data/fill-america-households.json`](../scripts/data/fill-america-households.json) — the editable source of
  truth, `{"<Household>": ["<label>", …]}`. Move a label between groups, or give it its own group,
  to change an association. Every label must appear exactly once; the script asserts this.
- [`scripts/data/fill-america-households.md`](../scripts/data/fill-america-households.md) — a generated read-only view of
  the same data with campaign counts, tract totals and first/last campaign per label, for making
  those decisions.

22 groups merge more than one label; 39 labels
stand alone. Associations reviewed and confirmed:

- `Preacher`, `Pastor Brad Weniger`, `Gwendolyn Weniger` → **Wenigers**; `Max Weniger` and
  `Chase Weniger` are their own households.
- `Tyler Candee`, `Klaus Candee`, `Carissa Candee`, `Carissa Candee x2` → **Candees**; `Mark Candee`, `Becky Candee` →
  **Candees Senior**.
- `Alex`, `Melissa`, `James`, `Philip Rivera` → **Riveras**; `Gabe Rivera` is his own.
- `Carla`, `Julina`, `Silas`, `Victoria`, `Jonathan Mendez` → **Mendez** (size 5).
- `Eric Stewart`, `Eric & Kim Stewart` → **Stewarts**.
- On their own: `Sharon Hamrick`, `Andrew VanKleeck` (separate from `Van Kleeks x4`),
  `Barbara Braught` (separate from `Barbara Braucht`), `Viciy DeLacy` (separate from
  `Vicky DeLacy`).

One association is assumed rather than confirmed: `Viki DeLacy` is merged into `Vicky DeLacy`
while `Viciy DeLacy` is kept separate, though all three are the same spelling error.

### The oldest tab is irregular — handle it first

`Jun 25 - Jul 9, 22` differs from the other 17 in two ways, and both will silently corrupt the
import if missed:

1. **Different column layout.** Its header is
   `Name | Week 1 | Week 2 | Week 3 | _ | Date | Unique Participants | Tracts | Door Hangers` —
   name-block first, and **no Goal column**. Every other tab is
   `Date | Unique Participants | Tracts | Door Hangers | _ | Name | Goal | Week 1 | Week 2 | Week 3 | Total`.
   Parse by **reading the header row and finding columns by name**, never by fixed index. Reading
   column F as the name on this tab yields the three date serials `44738` / `44745` / `44752` and
   silently drops the entire roster.
2. **It records individuals, not families.** 25 rows: `Pastor Brad Weniger`, `Max Weniger`,
   `Chase Weniger`, `Gwendolyn Weniger` where later campaigns have one `Wenigers`; four Riveras;
   `Tyler Candee` and `Klaus Candee`; `Andrew VanKleeck`, whose 1,009 tracts is the largest single
   effort in the workbook. The merge map rolls these into their households and **Size** carries the
   headcount — the Wenigers' 2022 Roster Entry is size 4.

### Import rules

- **Size comes from that campaign's own label**, never from the current one — `Sells x 3` in 2024
  imports as size 3, `Sells x 4` in 2025 as size 4. A label with no `x N` is size 1. This is the
  point of ADR-0033 and the reason Size is not on the Household.
- **Merged rows within one campaign** sum: sizes add and each week's tracts add. This happens 18
  times across 7 campaigns — `Harrisons` in 6 of them, plus `Wenigers`, `Candees`,
  `Candees Senior`, `Riveras`, `Mendez`, `Higgins` and `Sekhons`. Confirmed correct against the
  workbook's own Top 10, which already treats the Harrisons as one household: `554` for
  `Mar 25 – Apr 8 2023` is Dequan 380 + Dane 174, and `460` and `457` reconcile the same way.
- The **Candees** size sequence is a good smoke test that merging is right: 3 (2022, three labels)
  → 3 → 3 → 4 (`Candees x 4`, 2023) → 5 (`Candees x 5`, 2024 on). A family growing by one every
  couple of years, not a broken join.
- Weeks come from `campaignWeekDates(startDate, endDate)`; assert the count matches the tab's date
  rows. All 18 campaigns are 3 weeks.
- Campaign start/end are the first and last date rows. Season defaults from the start month;
  spot-check `Aug 29-Sept 12, 26`, whose tab name disagrees with the `Grand Totals` label
  (`Aug 23 – Sep 12`) — trust the date cells, not either label.
- Blank tract cells import as `null`, explicit `0` as `0`.
- Skip the Total, Total Goal and Averages rows — all derived.
- Idempotent: upsert on the natural keys so a re-run is safe.

### Verification

After import, compare against the `Grand Totals` tab.

**Tracts must match all 18 campaigns exactly** — verified against the current merge map, they do,
including the irregular 2022 tab. Any mismatch means the parser or the map is wrong.

**Door Hangers must match all 18 exactly** — they are typed, never derived.

**Unique Participants will not**, by design (ADR-0032). Under the current map, 10 of 18 match and
these 8 differ:

| Campaign              | Sheet   | Derived |
| --------------------- | ------- | ------- |
| `Jun 25 – Jul 9, 22`  | 44      | 43      |
| `Sep 3 – 17, 22`      | 47      | 46      |
| `Dec 10 – 24, 22`     | 22      | 20      |
| `Sep 2 – 16, 23`      | 30      | 31      |
| `Dec 9 – 23, 23`      | 18      | 19      |
| `Aug 31 – Sep 14, 24` | 31      | 32      |
| `Dec 7 – 21, 24`      | 33      | 34      |
| `Aug 30 – Sep 13, 25` | 43      | 42      |
| **All-time**          | **527** | **526** |

Every difference is ±1 or ±2 — hand-entry drift, exactly as ADR-0032 predicts.

**These numbers move when the merge map is edited.** Regenerate this table after finishing the map
review, and treat a change outside the 8 rows above as a signal that a merge was wrong.

## Out of scope

Per-household door hangers; linking Households to `people`; printing or CSV export; the dashboard,
season comparison and all-time leaderboards (slice 3).

## Done when

- All 18 campaigns import; tracts and door hangers reconcile exactly against `Grand Totals`.
- The `Jun 25 - Jul 9, 22` tab imports its full 25-row roster, not zero rows.
- Unique Participants differs on exactly the eight campaigns above.
- `Harrisons` is one household with 17 campaigns of history — size 2 from 2024, size 2 in 2022
  (Dequan + Dane).
- `Wenigers` totals 6,573 tracts across 17 campaigns, starting Jun 2022 at size 2
  (Brad + Gwendolyn).
- `Sells` shows size 3 in its 2024 campaigns and 4 in its 2025 ones.
- A new campaign created from two dates derives its weeks and copies the last roster forward.
- `pnpm eslint` and `pnpm prettier` clean.
