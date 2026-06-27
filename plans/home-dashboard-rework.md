# Home Dashboard Rework

Rework the Home screen (`/`, `src/pages/home-page.tsx` — distinct from the
Messaging **Dashboard** at `/dashboard`) from a stats-heavy launcher into an
**agenda + launchpad** hybrid. Drop pins, demote stats, add a frecency-driven
"Jump back in" strip and a tightly-scoped "Needs attention" strip.

Design decisions and rationale are captured in `CONTEXT.md` under **Home
screen**, **Quick launch**, **Needs attention (Home strip)**, **Pinned items
(deprecated on Home)**, and **Home stats footer**. This plan is the build order.

## Target layout (top → bottom, detail increasing downward)

```
Home
┌──────────────────────────────────────────────────────────┐
│ ⚠  Needs attention   3 drafts · 2 RSVPs need replies · …  │  ← conditional, hidden when empty
└──────────────────────────────────────────────────────────┘

JUMP BACK IN                                                   ← frecency entity chips (hero)
[ John Smith ·Person ] [ Choir ·Group ] [ Devo #2318 ·Devotion ] [ … ]   (≤8)

┌── Upcoming Events ──────────────┐  ┌── Celebrations ──────────────┐
│ • Cleaning & Visitation    2 days│  │ 🎂 Dequan Harrison      4 days│  ← agenda, two columns
│ 📤 Message to Choir   Tue 9:00 AM│  │ …                             │  (scheduled-msg lines muted)
└──────────────────────────────────┘  └───────────────────────────────┘

TOOLS                                                          ← curated, unchanged
[ Messaging ] [ Devotions ] [ Nursery ] [ Sermon Prep ] [ Calendar ]

People 861 · Groups 25 · Msgs 662 · Templates 47 · Devotions 2,145 · …   ← thin stats footer
```

## Backend

Only **one** new aggregation is needed; everything else reuses existing
endpoints. Fold the new data into the existing `GET /api/home`
(`server/routes/home.ts`) rather than adding a new route — Home already makes one
fetch and one query-key (`queryKeys.home`) invalidation; keep it that way.

### 1. `attention` object on `/api/home`

Add an `attention` block to the JSON response. Each feed returns a count (and the
strip/segment hides at 0). **Global rule: a feed appears only when its count > 0.**

- **`draftsOlderThan2Days`** — `drafts` table (`schema-core.ts:111`). Count rows
  where `updatedAt < datetime('now', '-2 days')`. The age gate avoids flagging a
  draft being composed right now. Segment links to the drafts view.
- **`rsvpsNeedingReplies`** — `rsvp_lists` (`schema-core.ts:237`) whose event date
  is within the next 7 days **and** that have ≥1 `rsvp_entries.status =
'no_response'`. Event date = linked `calendar_events.startDate` when
  `calendarEventId` set, else `standaloneDate`. Return the count of such lists.
  Segment links to `/rsvp`.
- **`nurseryNextMonthUnfinalized`** — boolean. True when **today is within ~10
  days of month-end** AND no `schedules` row exists with
  `scheduleType='nursery'`, `scopeKind='monthly'`, `month`/`year` = **next
  month**, `status='final'` (`schema-schedules.ts:14`). Segment label
  `Nursery (<NextMonthName>)`, links to `/nursery`.
- **`devotionsIncomplete`** — reuse the devotions-stats window query
  (`server/routes/devotions.ts:591–645`): count `devotions` with `date >=`
  first-of-current-month where **any** of `produced`, `rendered`, `youtube`,
  `facebookInstagram`, `podcast` is false. Past devotions excluded as "shipped."
  Segment `N devotions`, links to the incomplete list (devotions stats /
  filtered list).

Shape:

```ts
attention: {
  draftsOlderThan2Days: number
  rsvpsNeedingReplies: number
  nurseryNextMonthUnfinalized: boolean
  nurseryNextMonthLabel: string | null // e.g. "July" — only when the bool is true
  devotionsIncomplete: number
}
```

> **Note:** `Specials in needs_review` is intentionally **not** a feed yet — that
> feature is still under active development. It is the obvious next feed once it
> stabilizes (pairs with a future "Specials" Tools card).

### 2. `scheduledMessages` array on `/api/home` (agenda heads-up)

Add a sibling array for the muted send lines interleaved into the Upcoming Events
column. `messages` table (`schema-core.ts:86`): `status = 'scheduled'` and
`scheduledAt` within the next 14 days (same window as `upcomingChurchEvents`).

```ts
scheduledMessages: {
  id: number
  scheduledAt: string // ISO
  totalRecipients: number
  preview: string | null // short snippet of content, optional
}
;[]
```

Render as `📤 Message · {N} recipients · {date/time}`, muted, no action — purely
informational. (Recipient _group names_ are not on the `messages` row; use
`totalRecipients` + optional content snippet to keep it cheap.)

### 3. Keep `pinnedItems` in the response, dormant

**Do not** remove the `pinnedItems` payload, the `pinned_items` table, or the
`POST/DELETE /api/home/pin` endpoints. The frontend simply stops rendering them.
Deletion is irreversible churn for no benefit; a future "pin to top of Jump-back-in"
override may revive it.

### 4. No backend change for Jump back in

It reuses `GET /api/usage/recents` via the existing `fetchRecents()`
(`src/lib/usage-api.ts:25`).

## Frontend (`src/pages/home-page.tsx`)

Reorder the component to the target layout. Update the `HomeData` type in
`src/lib/api.ts` (`:742`) to include `attention` and `scheduledMessages`.

### A. Needs attention strip (new)

- New component, rendered **first**, only when **any** feed is non-empty.
- **One compact amber-tinted alert row**, leading warning icon, linked segments
  separated by `·` (e.g. `⚠ Needs attention · 3 drafts · 2 RSVPs need replies ·
Nursery (July) · 4 devotions`).
- Build the segment list by filtering out zero/false feeds, so order is stable
  and only live items show.
- **Responsive:** segments use `flex-wrap` (no horizontal scroll — bad on touch),
  icon pinned leading, each segment a full-size tappable link. ≤4 feeds → no
  overflow affordance needed.
- Segment → destination: drafts → messages drafts view, RSVPs → `/rsvp`, nursery
  → `/nursery`, devotions → incomplete devotions list.

### B. Jump back in strip (new, hero)

- New component below the attention strip. Fetch via `fetchRecents()`
  (`useQuery`, new query key e.g. `['usage','recents']`).
- **Compact chips** `[type-icon] {label} · {typeLabel}`, cap to **8** client-side
  (`.slice(0, 8)`), wrapping row.
- Route each chip via its `path`; show the live `label` (renames reflected).
- **All entity types** the resolver returns — no filtering.
- **Hide the whole strip when there are no recents** (same rule as attention).
- Map `entityType` → lucide icon (person→Users, group→FolderOpen,
  template→FileText, devotion→BookOpen, special→Music, …); fall back to a generic
  icon for unknown types.

### C. Upcoming (modify existing)

- Keep the two-column Events + Celebrations layout (`UpcomingChurchEventsCard` +
  Celebrations card) essentially as-is.
- **Interleave** `scheduledMessages` into the Events column, sorted by datetime
  alongside church events, rendered muted with a send icon. Distinct styling so it
  reads "FYI, queued," not "do something."

### D. Tools (unchanged)

- Keep the existing five curated cards (Messaging, Devotions, Nursery, Sermon
  Prep, Calendar) with their rich subtitles, stable order. Move the section to sit
  below Upcoming.

### E. Stats footer (demote)

- Replace the 8 big `StatCard` tiles with **one thin wrapping row of small
  `label: value` chips** at the very bottom. Keep all 8, keep click-through links.
  Remove the large-tile grid.

### F. Pinned section (remove from UI)

- Delete the Pinned `<section>` and the `PinDialog` usage/component from
  `home-page.tsx`. Remove now-unused imports (`Pin`, `PinOff`, `Plus`, pin
  mutations, `pinHomeItem`/`unpinHomeItem`, `HomePinnedItem`, `PinDialog`).
- Leave `pinHomeItem`/`unpinHomeItem` in `src/lib/api.ts` (dormant backend).
- Keep the mobile settings/logout block at the bottom.

## Build order

1. **Backend `/api/home`**: add `attention` + `scheduledMessages`; verify queries
   against the real DB. Update `HomeData` type in `src/lib/api.ts`.
2. **Frontend skeleton**: reorder sections to target layout; remove Pinned UI;
   demote stats to chip footer. (No new data yet — should still render.)
3. **Jump back in** strip wired to `fetchRecents()`.
4. **Needs attention** strip wired to `attention`.
5. **Scheduled-message** interleave in Upcoming Events.
6. Responsive pass (mobile: everything stacks; attention segments wrap; chips
   wrap).
7. `pnpm lint` (eslint + prettier) per project convention.

## Out of scope / deferred

- Specials `needs_review` attention feed (feature still in development).
- Removing the `pinned_items` table/endpoints (kept dormant).
- Frecency-ordering the Tools row (set too small; intentionally stable).
- A "pin to top of Jump-back-in" override (possible future revival of pins).

## Notes

- No ADR: this is reversible UI reshuffling over endpoints that already exist; the
  frecency infrastructure itself is already covered by `docs/adr/0012`.
- Per project ops: production is the only DB; no schema migration is required
  (no new tables/columns — all reads).
