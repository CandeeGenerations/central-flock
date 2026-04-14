# Church Calendar (read-only Apple Calendar viewer)

## Context

The app currently has no Apple Calendar (Calendar.app) integration — only an internal date-picker UI built on `react-day-picker`. The user wants to view one or more named calendars from Apple Calendar (e.g., "Church", "Worship Team", "Youth Ministry") inside Central Flock as a read-only merged feed of upcoming events. No event creation, no sync back, no messaging tie-in (yet).

The intended outcome:

- A new top-level "Calendar" section in the sidebar/bottom-tab nav with a full-page merged list of upcoming events from all selected calendars
- A compact "Upcoming Events" widget on the Home page
- Configurable via Settings (which Apple calendars to show, multi-select)
- Each event visually tagged with its source calendar (color dot/pill)

## Refresh model — answering "do I need to click something?"

**No.** JXA reads Calendar.app live whenever a query mounts/refreshes. Calendar.app keeps iCloud calendars synced in the background, so events appear automatically. The only one-time user action is granting Calendar access in System Settings → Privacy & Security → Calendars when macOS prompts on the first call.

**n8n is not needed for the basic flow.** It would only be useful as an optional snapshot cache (nightly POST to a `/webhooks/calendar-events` endpoint, mirroring `server/routes/quotes-webhook.ts:21`) if live JXA latency on the Home page proves annoying. With multi-calendar support, this becomes more compelling past ~5 calendars (each adds one JXA round-trip, even when parallelized). Defer until measured — ship live-only first.

## Approach

Read-only pipeline: JXA → Express route → React Query → page + home widget. Selected calendar names configurable via existing `settings` table (JSON-encoded array).

### Backend

1. **`server/services/osascript.ts`** (new, small refactor) — extract `spawnStdin`, `runJXA`, `runAppleScript` from `server/services/applescript.ts:3-40` so multiple services can share. Update `applescript.ts` to import from it.

2. **`server/services/calendar.ts`** (new) — mirrors `fetchContacts` (`applescript.ts:167`).
   - `CalendarEvent` type: `{id, title, startDate, endDate, allDay, location, calendarName}` — note `calendarName` so the UI can color/group/filter.
   - `fetchAvailableCalendars(): Promise<{name: string; color: string}[]>` — lists Calendar.app calendar names AND their native Calendar.app color (so the UI can mirror Apple's color choices by default).
   - `fetchUpcomingEvents(calendarNames: string[], daysAhead): Promise<CalendarEvent[]>` — runs one JXA query per calendar in parallel via `Promise.all`, merges results, sorts by `startDate`. Each event tagged with its source `calendarName`. JXA: `Application('Calendar').calendars.byName(name).events.whose({...startDate range...})`.
   - Per-calendar errors are isolated: a missing/renamed calendar logs a warning and returns `[]` for that calendar rather than failing the whole request. Top-level error only for "Calendar access denied".

3. **`server/routes/calendar.ts`** (new) — shape modeled on `server/routes/contacts.ts:11`.
   - `GET /api/calendar/calendars` → `{calendars: {name, color}[]}` — used by Settings multi-select.
   - `GET /api/calendar/events?days=30` → `{events, calendarNames, missing}` where `missing` lists configured names that no longer exist in Calendar.app (so UI can prompt user to fix Settings).
   - Reads `churchCalendarNames` from `settings` (JSON array); 400 with actionable message if unset/empty.
   - Wire into `server/index.ts` near line 55.

4. **`server/routes/settings.ts`** — add `churchCalendarNames` to allowed keys. Value stored as JSON-encoded `string[]`.

5. **`server/routes/home.ts`** — extend `GET /api/home` response to include `upcomingChurchEvents` (next 14 days, max 5, merged across all configured calendars). Each event includes its `calendarName` so the widget can show the color tag. On error or unconfigured, return `[]` — never break the home page if calendars are misconfigured.

### Frontend

6. **`src/lib/api.ts`** — typed helpers `fetchCalendarEvents(days)`, `fetchAvailableCalendars()`. Extend the home response type to include `upcomingChurchEvents` with `calendarName` per item.

7. **`src/pages/calendar-page.tsx`** (new) — full-page layout following existing page conventions (`p-4 md:p-6 space-y-6`, `Card`/`CardHeader`/`CardContent` from `@/components/ui/card`, `Badge`, `PageSpinner`).
   - Header: title + day-range selector (7 / 30 / 90) + refresh button.
   - Below header: a row of toggle chips, one per configured calendar (colored dot + name), to filter the merged feed client-side. Default: all enabled.
   - Grouped by day: date heading → list of events with time, title, location, and a small colored dot/pill showing the source calendar.
   - All-day events render as a pill at the top of each day group.
   - If `missing` array from the API is non-empty, show a dismissible banner: "Calendar 'X' is no longer available — update in Settings."
   - Empty / unconfigured / access-denied states each show a clear CTA (link to Settings or instructions to grant Calendar access).

8. **Settings UI** (`src/pages/settings-page.tsx`) — new "Church Calendars" section:
   - Multi-select list (checkbox per available calendar) populated by `GET /api/calendar/calendars`. Each row shows the calendar's native color dot.
   - Save persists the array to `churchCalendarNames` via the existing settings save flow.

9. **Home widget** — in `src/pages/home-page.tsx`, add a new `Card` titled "Upcoming Events" alongside the existing birthdays/anniversaries card (the `lg:grid-cols-2` block at line 149). Reuse the same compact list pattern (lines 162–197). Each row shows a colored dot for its source calendar + event title + relative time, and is a tappable `Link` to `/calendar`. Hide the card cleanly when no calendars are configured.

10. **`src/lib/nav-config.ts:36`** — add a NEW top-level nav group placed after `messaging`:

    ```ts
    {
      id: 'calendar',
      label: 'Calendar',
      icon: Calendar, // already imported on line 6
      children: [{to: '/calendar', label: 'Upcoming', icon: Calendar}],
    }
    ```

    Appears in desktop sidebar AND mobile bottom tab bar (`src/App.tsx:150`).

11. **`src/App.tsx:226`** — register `<Route path="/calendar" element={<CalendarPage />} />`.

### Out of scope

- Writing/modifying events.
- Tying events to message scheduling (future task).
- n8n cache layer (only if live JXA proves too slow with many calendars).
- Per-calendar custom color overrides (use Calendar.app's native colors).

## Critical files

- `server/services/applescript.ts` — pattern to mirror; extract shared helpers into `osascript.ts`.
- `server/routes/contacts.ts` — closest route shape.
- `server/routes/home.ts:34` — extend response with church events.
- `server/routes/settings.ts` — register new key.
- `server/index.ts:55` — register new router.
- `src/pages/home-page.tsx:149` — add widget alongside existing Upcoming Events card.
- `src/App.tsx:226`, `src/lib/nav-config.ts:36`, `src/lib/api.ts` — frontend wiring.

## Verification

1. `pnpm lint` clean; `pnpm build` succeeds.
2. With launchd service running (per repo convention, do NOT start `pnpm dev` manually):
   - `curl http://localhost:5172/api/calendar/calendars` — first call may trigger TCC prompt; grant Calendar access; confirm available calendars appear with their colors.
   - Select 2+ calendars in Settings.
   - Reload `/calendar` — confirm merged list grouped by day with correct titles, times, locations, all-day handling, and color-tagged source per event.
   - Toggle calendar filter chips — confirm events show/hide client-side without refetching.
   - Reload `/` — confirm the home widget shows the next few merged events with color tags; tapping a row navigates to `/calendar`.
3. Edge cases:
   - No calendars selected → home widget hidden, `/calendar` shows CTA to Settings.
   - One configured calendar renamed/deleted in Calendar.app → other calendars still load, `missing` banner shows on `/calendar`.
   - Calendar access denied → instructions to grant in System Settings.
   - No upcoming events in range → friendly empty state.
4. Confirm new "Calendar" group appears in the desktop sidebar AND the mobile bottom tab bar.
