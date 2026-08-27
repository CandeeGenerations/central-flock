# Fill America — dashboard

Season-aware charts, summary tiles and two leaderboards over the campaign history imported in
slice 2.

Slice 3 of 3, after [sunday-school-stats.md](./sunday-school-stats.md) and
[fill-america-core.md](./fill-america-core.md). No schema changes — everything here is a query over
tables slice 2 creates.

One ADR governs the numbers on this page:

- [0032 — Unique Participants is derived, never stored](../docs/adr/0032-fill-america-unique-participants-is-derived.md)

Terms (**Campaign**, **Season**, **Household**, **Roster Entry**, **Tract Report**) are defined in
[CONTEXT.md](../CONTEXT.md).

## The problem

The Main Services dashboard plots a continuous weekly series. Fill America has nothing continuous:
18 campaigns over four years, each 3 weeks, separated by 2-3 month gaps. Plotting all 51
campaign-weeks on a date axis gives three clustered dots then three months of white space, eighteen
times over.

Worse, a naive "vs last year" line compares whatever campaign came before — which is usually a
different **Season**, and season dominates the result:

| Season           | n   | Avg tracts | Avg door hangers | Avg unique participants |
| ---------------- | --- | ---------- | ---------------- | ----------------------- |
| Fall (Aug/Sep)   | 4   | **2,101**  | 1,589            | **38**                  |
| Summer (Jun/Jul) | 5   | 1,783      | 864              | 32                      |
| Winter (Dec)     | 4   | 1,683      | 1,125            | 25                      |
| Spring (Mar/Apr) | 4   | **1,497**  | 1,002            | 30                      |

Fall runs ~40% ahead of Spring on tracts and 50% ahead of Winter on people. A December campaign
held against the August one before it shows a decline that is purely calendar. So the x-axis is the
**Campaign**, and the comparison line is the **same Season a year earlier**.

## Phase 1 — Server

Add to `server/routes/fill-america.ts`:

| Method | Path                                        | Notes                                                             |
| ------ | ------------------------------------------- | ----------------------------------------------------------------- |
| GET    | `/series?metric&householdId&season&from&to` | one point per campaign, ascending by `startDate`                  |
| GET    | `/summary?householdId`                      | tiles: latest campaign, this year, all-time, average per campaign |
| GET    | `/leaderboard?scope&season&limit`           | `scope=household` (all-time) or `scope=effort` (single campaign)  |

- `metric` is `tracts | doorHangers | uniqueParticipants`.
- `householdId` and `season` both accept `all`; `from`/`to` filter on `startDate`.
- Each series point carries `{campaignId, title, startDate, season, value}` so the chart can label
  its axis and the tooltip can name the campaign.
- Unique Participants is computed per ADR-0032 — never read from a column, because there isn't one.
  Filtering by `householdId` makes it meaningless, so the endpoint returns `null` for that metric
  when a single household is selected and the client hides the option.

## Phase 2 — Dashboard page

`src/pages/fill-america/campaign-list-page.tsx` grows a dashboard above the existing table, keeping
`/fill-america` as one page rather than adding a route. Structure mirrors
`src/pages/attendance/attendance-dashboard-page.tsx`.

1. **Filter card** — Metric (Tracts / Door Hangers / Unique Participants), Household (All combined /
   each), Season (All / Spring / Summer / Fall / Winter), `DateRangePicker` over campaign start
   dates defaulting to all-time, and a `vs Last Year` toggle.
2. **Four tiles** — Latest Campaign, This Year (total + campaign count), All-Time, Average per
   Campaign.
3. **Chart** — the same `ComposedChart` as Main Services: `Area` on `var(--primary)` with the
   `linearGradient` fade, red least-squares `Line` for trend, blue `Line` for the comparison. One
   point per campaign, x-axis labelled with short campaign titles (`Dec 25`, `Mar 26`).

   The comparison line is **not** the previous campaign. For each point, find the campaign with the
   same `season` whose `startDate` is 10-14 months earlier; `null` when there is none, with
   `connectNulls` on. Selecting a single Season collapses this to a clean year-over-year line.

   Lift `linreg()` out of `attendance-dashboard-page.tsx` into a shared helper as part of slice 1;
   this is its second consumer. `toWeekly()` is not reused — points are already one per campaign.

4. **Two leaderboards**, side by side.

**Most Faithful (all-time, per household)** — `sum(tracts)`, campaigns participated, average per
campaign. Expected top 10 after the slice-2 import:

| #   | Household        | Tracts | Campaigns | Avg   |
| --- | ---------------- | ------ | --------- | ----- |
| 1   | Wenigers         | 6,573  | 17        | 387   |
| 2   | Candees          | 5,629  | 17        | 331   |
| 3   | Harrisons        | 4,857  | 17        | 286   |
| 4   | Neil Tellier     | 2,484  | 17        | 146   |
| 5   | Mirtha Coronado  | 1,347  | 17        | 79    |
| 6   | Sharon Hamrick   | 1,130  | 5         | 226   |
| 7   | Andrew VanKleeck | 1,009  | 1         | 1,009 |
| 8   | Gabe Rivera      | 911    | 10        | 91    |
| 9   | Higgins          | 899    | 15        | 60    |
| 10  | Madeline Turner  | 769    | 17        | 45    |

`Campaigns` counts campaigns where the household reported tracts, so it tops out at 17 rather than
18 — the `Aug 29 – Sept 12, 26` campaign has no data yet.

`Andrew VanKleeck` at #7 on a single campaign is correct, not a bug: he distributed 1,009 tracts in
`Jun 25 – Jul 9, 22` and is deliberately kept separate from the later `Van Kleeks` household.

**Top Campaign Efforts (single campaign)** — replaces the workbook's `Grand Totals` Top 10 block.
Computed from the import:

| #   | Household            | Tracts    | Campaign            |
| --- | -------------------- | --------- | ------------------- |
| 1   | **Andrew VanKleeck** | **1,009** | Jun 25 – Jul 9, 22  |
| 2   | Candees              | 645       | Aug 30 – Sep 13, 25 |
| 3   | Candees              | 644       | Aug 31 – Sep 14, 24 |
| 4   | Candees              | 610       | Dec 9 – 23, 23      |
| 5   | Wenigers             | 583       | Dec 9 – 23, 23      |
| 6   | Harrisons            | 554       | Mar 25 – Apr 8, 23  |
| 7   | Candees              | 527       | Mar 25 – Apr 8, 23  |
| 8   | Wenigers             | 513       | Mar 25 – Apr 8, 23  |
| 9   | Wenigers             | 512       | Sep 2 – 16, 23      |
| 10  | **Van Kleeks**       | **500**   | Jun 21 – Jul 5, 25  |

This deliberately differs from the workbook, which lists `Candees 645` first and `Harrisons 460`
and `Harrisons 457` at 9-10. The hand-kept list was built from the 17 tabs that share a layout and
never saw the oldest campaign, so it missed `Andrew VanKleeck 1,009` — the largest single effort
ever recorded — along with `Van Kleeks 500`. Rows 2-9 match the sheet exactly. Do not "fix" the
query to reproduce the spreadsheet's ordering.

Both boards respect the Season and date-range filters, so "best Fall effort ever" is one click.

## Phase 3 — Campaign page

The campaign detail page from slice 2 gains a small 3-week bar chart above its Weeks card —
Tracts and Door Hangers per **Campaign Week** — and a `vs <same Season, prior year>` line under the
title showing that campaign's totals against its seasonal predecessor.

## Out of scope

Printing or PDF export; CSV export; per-household door hangers; any cross-feature comparison with
Sunday School Stats or `service_records`.

## Done when

- The chart plots 18 points and the comparison line connects each campaign to the same Season a
  year earlier, skipping cleanly where there is no predecessor.
- Selecting Season = Fall shows four points trending across 2022-2025.
- Both leaderboards match the tables above.
- Selecting a single household removes the Unique Participants metric rather than showing a wrong
  number.
- `pnpm eslint` and `pnpm prettier` clean.
