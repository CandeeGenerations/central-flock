# Events Story (weekly upcoming-events Story)

This automates the weekly **Events Story**: CBC's 1080×1920 "Upcoming events" graphic in Canva,
posted as a Facebook and Instagram Story through Metricool. Tyler picks five **Events** from the
printed calendar. Central Flock fills the Canva design and shows the draft. On approval it saves
the design, exports a PNG and schedules the Story at the best time.

Glossary: **Events Story**, **Story Line**, **Story Run**, **Connection** and **Unconfirmed Event**
are in [CONTEXT.md](../CONTEXT.md). The architecture decision is
[ADR 0042](../docs/adr/0042-canva-edits-are-direct-mcp-calls-not-an-ai-workflow.md).

## Decisions

| #   | Decision         | Choice                                                                                                                                                                                                                               |
| --- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Who edits Canva  | Central Flock is the MCP client and calls the Canva tools directly. No Claude, no Anthropic MCP connector (ADR 0042).                                                                                                                |
| 2   | Reuse            | A general MCP+OAuth client module (`server/lib/mcp-client/`) shared by Canva, Metricool and future features. Design-specific knowledge stays with the feature.                                                                       |
| 3   | Canva sign-in    | Developer Portal app with Canva MCP turned on. Redirect `https://flock.cgen.cc/api/connections/canva/callback` (tunnel), with `http://127.0.0.1:5172/...` registered as a fallback.                                                  |
| 4   | Metricool        | Metricool's remote MCP server `https://ai.metricool.com/mcp` with OAuth 2.1, not the REST API. Brand `blogId` 2350437, America/New_York.                                                                                             |
| 5   | Sign-in check    | Every Story Run checks **both** Connections before the picker unlocks. A failure blocks the run and offers Reconnect.                                                                                                                |
| 6   | Event source     | `calendar_print_events`, never Apple Calendar.                                                                                                                                                                                       |
| 7   | Picker list      | The next 10 Events from the post date (inclusive). **Unconfirmed Events** (`* ` prefix) are excluded. A **Span** counts once, by its first day. Nothing else is filtered. The first 5 are pre-selected and exactly 5 must be chosen. |
| 8   | Default post day | Mon–Wed: today if a good hour remains, otherwise roll one day forward. Thu–Sun, or a roll that reaches Thursday: next Monday. Never skip a week of events.                                                                           |
| 9   | Best time        | `get_best_time_to_post` for Facebook and Instagram on the post day. Add the two scores per hour and pick the best hour that is at least 30 min from now and before 9 pm. If the call fails, use 10 am.                               |
| 10  | Overrides        | Any date up to 4 weeks ahead, which works out that day's best hour again. The next two best hours are quick chips, and there is a manual time picker. Events count from the chosen date.                                             |
| 11  | Late approval    | If the chosen time has passed when Approve is pressed, suggest the next good hour and confirm.                                                                                                                                       |
| 12  | Title parsing    | Deterministic. A line that starts with a time is the time; the first one goes on the day/time line (`Saturday @ 1 pm`, `Saturday @ 10 am - 2 pm`) and labels after it are dropped. No time gives just `Thursday`.                    |
| 13  | Title lines      | Two lines whenever the name has 2+ words. 2 lines are kept as-is, 1 line is split at the space nearest the middle, 3+ lines keep the first two and get ⚠. Single words stay on one line. Every field is editable in the picker.      |
| 14  | Divider          | Every run resets all 5 dividers to their fixed grid position after the text edits. Canva shifts a divider by ±54 px when its title switches between one and two lines, and the position is the same either way (see Spike findings). |
| 15  | Month            | Always 3-letter uppercase (`NOV`), written on every Story Line every run.                                                                                                                                                            |
| 16  | Lifecycle        | Drafting → Awaiting Approval → Scheduling → Scheduled, plus Failed (Retry from the failed step). Discarding cancels the Canva transaction.                                                                                           |
| 17  | Expired draft    | Approve re-applies the same edits, shows the **new** preview, and waits for one more tap.                                                                                                                                            |
| 18  | Concurrency      | One open draft at a time, because there is one design. A new run asks Resume or Discard. A second run in a week that already has a Scheduled one gets a warning.                                                                     |
| 19  | After Scheduled  | No "Posted" tracking; Metricool publishes the post. Store the post ID, the time and the exported PNG.                                                                                                                                |
| 20  | Calendar changes | A Calendar Print save that changes the Events shown in a Scheduled Story Run flags that run and offers to redo it.                                                                                                                   |
| 21  | Placement        | `/calendar/events-story`, "Events Story" under the **Calendar** nav group. Home **Needs Attention** on Mon–Wed when this week has no Scheduled run, and for a flagged run.                                                           |
| 22  | Connections UI   | **Settings → Connections**: Canva and Metricool, each with Connected as … or Reconnect.                                                                                                                                              |
| 23  | Progress         | `AIProgress` driven by real server steps (polled every 1 s), not timed fake messages.                                                                                                                                                |
| 24  | Secrets          | Plist: `CANVA_CLIENT_ID`, `CANVA_CLIENT_SECRET`, `CONNECTIONS_KEY`. Tokens are stored AES-256-GCM encrypted in the `connections` table. Each provider refreshes under its own lock and the new token is saved before it is used.     |
| 25  | Metricool post   | One post with both networks, `facebookData.type` and `instagramData.type` = `STORY`, no text, `autoPublish: true`, alt text listing the 5 events, media = the Canva export URL.                                                      |

## Step 0: Spike (before building)

### Canva findings (2026-11-16)

Tested in an editing transaction on `DAHXGTKcnks`, then **cancelled**; nothing was saved.

- **Dividers have one fixed position per Story Line, whatever the title length.** When a title
  goes from two lines to one, Canva moves that line's divider **up 54 px**. Going from one line
  back to two moves it **down 54 px**, which pushes it off the grid if the divider was "fixed"
  earlier. So the rule is: after the text edits, always set all 5 dividers (`update_line_properties`,
  start and end) to these values. This was checked in both directions on Story Lines 4 and 5.

  | Story Line | Divider locator (after `PBxpttyc19vjDJRB-`) | `top` (start = end) | start `left`       | end `left`        |
  | ---------- | ------------------------------------------- | ------------------- | ------------------ | ----------------- |
  | 1          | `LBDB7Ky39gRFfvh0-LBB1dJy44gy2tty9`         | 861.3861376344531   | 410.63839879010885 | 905.6927733757149 |
  | 2          | `LBFYmLGKJCtpX7Sr-LBjWRpdwXmR8Gb3t`         | 1083.811088031028   | 413.57476634605695 | 908.629140931663  |
  | 3          | `LBrDff7rYPXfjzKP-LBsZpJqSSqgg0dlj`         | 1306.39806352781    | 413.57476634605695 | 908.629140931663  |
  | 4          | `LBr1bH6hLQtmXRkQ-LB262V15Bs1lZmPS`         | 1528.9850390245929  | 413.57476634605695 | 908.629140931663  |
  | 5          | `LBRTht7TGy6CHyfH-LByZnTrVjvg8T0kK`         | 1751.148768496615   | 413.574766346057   | 908.629140931663  |

- **Month text is stored as `Nov` and drawn as `NOV`** by the design's styling, so writing either
  case gives the same result. Write `Nov` (Decision 15 is cosmetic either way).
- `edit-design` returns `edits_unverified` plus a thumbnail URL after each `keep_open` call. That
  thumbnail is the draft preview; no separate `read-design` call is needed.
- The `read-design` thumbnail URL is signed and lasts a few hours, so store a copy of the preview
  rather than the URL if the run is to be resumed later.

### Canva auth (from canva.dev; still unverified in practice)

- Developer Portal → app → **Outside Canva**: turn on Canva MCP, get the client ID and secret, and
  add redirect URLs. The MCP docs say you "don't need to configure an authorization URL or token
  URL": the MCP server advertises them, and the MCP TS SDK's OAuth provider discovers them.
- PKCE S256, with the client secret sent by HTTP Basic at the token endpoint.
- **Refresh tokens are single-use and rotate.** "Each refresh token can only be used once." This
  confirms that the per-provider refresh lock and save-before-use (Decision 24) are required. No
  lifetimes are documented; use the `expires_in` the token response returns.
- No review step is documented for a single-user MCP ("Outside Canva") app. Confirm by connecting.
- Scopes needed for edit and export via MCP are not documented. Find out from the first consent
  screen or a `401`/`403`.

### Still to do

1. **Tyler:** create the Developer Portal app and register both redirect URLs.
2. Confirm the first sign-in works end to end, and record the scopes and `expires_in`.
3. Find out how long a Canva editing transaction stays open (leave a test one open and retry).
4. Metricool: client registration (DCR or CIMD), and the real tool names and Story fields from
   `tools/list`.

## Server

### `server/lib/mcp-client/` (reusable)

- `oauth.ts`: authorization-code + PKCE flow, `state` store (single-use, 10 min), refresh with a
  per-provider mutex, token encryption/decryption with `CONNECTIONS_KEY`.
- `client.ts`: `getMcpClient(provider)` returns a connected `@modelcontextprotocol/sdk` client over
  Streamable HTTP with a fresh bearer token. `checkConnection(provider)` makes a cheap call
  (`tools/list`) and returns `{ok, accountName} | {ok: false, reason}`.
- `providers.ts`: a registry of `{id, label, serverUrl, clientId?, clientSecret?, scopes}` for
  `canva` and `metricool`.

### Feature: `server/services/events-story/`

- `pick-events.ts`: the next 10 Events from a date, with Unconfirmed excluded and Spans collapsed.
  Pure and unit-tested.
- `story-lines.ts`: turns an Event title into `{dayTimeLine, line1, line2?, warn}`. Pure and
  unit-tested against the real titles in the grilling notes.
- `post-time.ts`: default post day (Decision 8) plus best hour (Decision 9). Pure, with the
  best-time scores injected.
- `canva-design.ts`: design ID, page ID, the Story Line locator table, divider tops, and
  `buildEdits(lines)` that returns the `edit-design` operations.
- `run.ts`: the Story Run state machine. Step progress is written to the run row and polled by the UI.
- `stale-check.ts`: called from the Calendar Print save path. It re-picks the Events for each
  Scheduled run and flags the run if they differ.

### Routes: `server/routes/events-story.ts`, `server/routes/connections.ts`

- `GET /api/connections`, `GET /api/connections/:provider/start` (redirect),
  `GET /api/connections/:provider/callback` (no auth, checked by `state`),
  `POST /api/connections/:provider/check`, `DELETE /api/connections/:provider`.
- `GET /api/events-story/runs`, `POST /api/events-story/runs` (pre-check plus picker data),
  `GET /api/events-story/runs/:id` (state + progress), `POST /:id/draft` (chosen lines + time),
  `POST /:id/approve`, `POST /:id/retry`, `POST /:id/discard`,
  `GET /api/events-story/post-time?date=` (best hours for a day).

### Data model

```sql
-- connections
provider        TEXT PK            -- 'canva' | 'metricool'
token_blob      BLOB NOT NULL      -- AES-256-GCM {access, refresh, scope, client registration}
expires_at      TEXT
account_name    TEXT
updated_at      TEXT NOT NULL

-- events_story_runs
id              INTEGER PK
status          TEXT NOT NULL      -- drafting|awaiting_approval|scheduling|scheduled|failed|discarded
failed_step     TEXT
progress_step   TEXT
progress_pct    INTEGER
post_at         TEXT               -- ISO with offset
lines_json      TEXT NOT NULL      -- the 5 Story Lines as approved (event ids + text)
canva_txn_id    TEXT
preview_url     TEXT               -- thumbnail for Awaiting Approval
export_path     TEXT               -- stored PNG under UPLOADS_DIR (ADR 0001)
metricool_post_id TEXT
stale           INTEGER NOT NULL DEFAULT 0
created_at, updated_at
```

## Frontend

- `/calendar/events-story`: list of runs (scheduled, upcoming, past) plus a New Story button and
  the open draft.
- New Story flow (one page with steps):
  1. Connection check, with inline Reconnect.
  2. Post day and time (default, chips, date override, manual time).
  3. Picker: 10 Events, 5 checked, and the three editable fields for each checked one, with a ⚠
     marker.
  4. Make Draft, with progress.
  5. Preview (Canva thumbnail) with Approve, Edit Events, and Discard.
  6. Approve, with progress, then Scheduled.
- **Settings → Connections** section.
- Home **Needs Attention** items (Decision 21).
- Nav entry, usage-entity-resolver label for `events-story`, and a command-palette check (CLAUDE.md).

## Tests

- Unit tests (Vitest, offline): `pick-events`, `story-lines`, `post-time` (every weekday plus late
  Monday, Wednesday night → Monday, 9 pm cutoff), `canva-design.buildEdits` (one-line ↔ two-line
  divider), the run state machine with stubbed MCP clients (expired transaction, failure at
  Metricool → retry from export), and the OAuth refresh mutex.
- There is no `ai-smoke` case because this is not an AI feature (ADR 0042).

## Implementation order

1. Spike (Step 0); record the findings here.
2. `mcp-client` module, `connections` table and migration, Settings → Connections. Test it by
   connecting both services.
3. Pure functions and their tests: `pick-events`, `story-lines`, `post-time`.
4. `canva-design` and the run state machine up to Awaiting Approval (draft and preview only).
5. Approval: commit, export, Metricool schedule, and retry.
6. UI: the New Story flow and the runs list.
7. Stale check from Calendar Print, Home items, nav, palette and usage label.
8. Deploy per RUNBOOK (migration; add the plist env vars and restart the service).
