# Fair Booth Shift Reminders

Nightly texts to everyone working the fair the next day, using template 28
(`Fair - You're Up Next`), with each person's own times filled into `{{timeSlot}}`.

Design decisions and their reasoning: [ADR 0018](../docs/adr/0018-fair-booth-reminder-runs.md).
Domain terms (**Reminder Run**, **Shift Reminder**, **Shift**, **Signup**, **Slot**): [CONTEXT.md](../CONTEXT.md).

## What it does

- A fair produces **one Reminder Run per fair day** — nine for the 2026 fair
  (`2026-07-31` → `2026-08-08`), each firing the evening before the day it covers. The first fires
  the evening of **Thu Jul 30** for **Fri Jul 31**.
- A Run is queued as a **standing instruction** — schedule + target day + template id — not as
  rendered text. It resolves recipients and their **Shifts** *when it fires*, so a signup added
  after queuing is still included.
- Send time comes from a new setting `schedules.fairBooth.reminderSendTime` (default `19:00`).
  Changing it re-times every still-pending Run.
- Preview shows **every** recipient's fully rendered message, produced by the same resolver the send
  uses.

### `{{timeSlot}}` renders

One line per **Shift** on the target day, role shown only when it isn't plain Worker — identical to
the **Shifts Card** bullet, formatted by the same function:

```
Tyler Candee     Sat, Aug 1 — 3–10 PM                      (two Signups, merged)
Dequan Harrison  Sat, Aug 1 — 2–10 PM  (Unit Leader)
Casey Allison    Fri, Jul 31 — 6–10 PM
Brandon Cobb     Sat, Aug 8 — 3–6 PM  (Worker)             (role changed mid-day →
                 Sat, Aug 8 — 6–10 PM  (Asst Unit Leader)   two lines, both labelled)
```

### Recipient rules

| Case | Behaviour |
| --- | --- |
| Has a Signup on the target day | Texted |
| Two Signups that merge into one Shift | **One** text, merged range |
| No phone number | Recorded as `skipped` on the message, Run still succeeds |
| `status <> 'active'` | Recorded as `skipped` (matches `/api/messages/send`) |
| Has Signups but removed from the roster Group | **Still texted** — ADR 0009 makes Signups the record of who is working |
| Signs up on the target day itself | Not texted; that Run already fired |
| Target day has zero Signups | Run marked `skipped`, no message created |

Current data is clean: 39 distinct workers, all active, all with phones, all on roster Group 7, no
shared numbers. Three names render oddly through `{{firstName}}` — people 60 (`Dad`), 61 (`Mom`),
441 (`Preacher`). They send from your Messages so they read fine; **Preacher works tonight's target
day**, so confirm it in the preview.

---

## Steps

Do these in order. Steps 1–2 have no runtime effect and are safe to land first.

### 1. Extract the shift logic to a shared module

Move from `src/lib/fair-booth-render.ts` into a new **`server/lib/fair-booth-shifts.ts`**:

`mergeRanges`, `computePersonShifts`, `formatShiftDate`, `formatShiftRanges`, `formatTimeShort`,
`SHIFT_ROLE_LABEL`, and the `ShiftRange` / `ShiftGroup` / `ShiftDay` types.

Constraint: the module must import **nothing** from `server/db` or express — it has to stay safe for
the client bundle to pull in. It may import types from `server/db/schema-fair-booth`, which
`fair-booth-render.ts:3` already does.

Then re-export from `src/lib/fair-booth-render.ts` so **no call site in `src/` changes**
(`fair-booth-shifts-card.tsx`, `fair-booth-schedule-page.tsx`, `fair-booth-exports.ts`).

Add one exported helper used by both surfaces:

```ts
// One line per Shift on a single day; role suffixed only when not plain worker.
export function formatShiftReminderTimeSlot(days: ShiftDay[]): string
```

Verify with `pnpm eslint` that both tsconfigs still typecheck.

### 2. Schema + migration

In `server/db/schema-fair-booth.ts`:

```ts
export const fairBoothReminderRunStatuses = [
  'scheduled', 'sending', 'completed', 'skipped', 'past_due', 'canceled',
] as const

export const fairBoothReminderRuns = sqliteTable(
  'fair_booth_reminder_runs',
  {
    id: integer('id').primaryKey({autoIncrement: true}),
    scheduleId: integer('schedule_id').notNull().references(() => schedules.id, {onDelete: 'cascade'}),
    targetDay: text('target_day').notNull(),                 // 'YYYY-MM-DD' — the day worked
    templateId: integer('template_id').notNull(),            // live reference; validated at fire time
    scheduledAt: text('scheduled_at').notNull(),             // UTC 'YYYY-MM-DD HH:MM:SS', same convention as messages.scheduled_at
    status: text('status', {enum: fairBoothReminderRunStatuses}).notNull().default('scheduled'),
    messageId: integer('message_id').references(() => messages.id, {onDelete: 'set null'}),
    error: text('error'),
    createdAt: text('created_at').default(sql`(datetime('now'))`).notNull(),
    updatedAt: text('updated_at').default(sql`(datetime('now'))`).notNull(),
  },
  (t) => ({
    uniqScheduleDay: uniqueIndex('fair_booth_reminder_runs_schedule_day_uniq').on(t.scheduleId, t.targetDay),
  }),
)
```

The unique index is the idempotency guarantee — queuing twice can never double-send.

`pnpm db:generate`. This is **additive only** (one `CREATE TABLE`), so no service bootout is needed
per RUNBOOK's "migrations that drop or rebuild tables" caveat.

### 3. The resolver

New **`server/services/fair-booth-reminder-scheduler.ts`**, modeled on `birthday-scheduler.ts`.
Deliberately separate from `server/services/scheduler.ts` so a bug here cannot affect ordinary
message sending — see ADR 0018.

Poll every 60s under `Sentry.withMonitor('fair-booth-reminder-scheduler', ...)`. On each tick, for
every Run with `status='scheduled'` and `scheduled_at <= now`:

1. **Grace check.** Send if now is before the cutoff — local **22:00** on the Run's scheduled date.
   Past it: set `status='past_due'`, `sendNotifyMeText(...)`, do not send. (Ordinary messages keep
   their 5-minute rule; this wider window is why the schedulers are separate.)
2. **Template check.** Load `templateId`. Missing, or content lacks `{{timeSlot}}` → `status='skipped'`,
   record `error`, notify-me, do not send. Never deliver a text containing a literal `{{timeSlot}}`.
3. **Resolve** — `resolveReminderRun(runId)`, the shared function step 4 also exposes.
4. Zero recipients → `status='skipped'`, no message row.
5. Otherwise create an **ordinary, fully-rendered `messages` row** (`source='fair_booth_reminder'`,
   `status='pending'`, `renderedPreview` from the first recipient) plus its `message_recipients`
   rows, then hand it to the existing `createJob` / `processSendJob` queue. Store `messageId` on the
   Run and set `status='completed'`.

Register start/stop next to `startBirthdayScheduler` in the server entry point.

### 4. The resolver function — one code path for preview and send

In the same module, exported and pure of side effects:

```ts
export function resolveReminderRun(run: FairBoothReminderRun): {
  recipients: {person: Person; timeSlot: string; rendered: string; skipReason?: 'no_phone' | 'inactive'}[]
}
```

- `SELECT * FROM fair_booth_signups WHERE schedule_id = ? AND day_date = ?`
- Group per person via `computePersonShifts`, format via `formatShiftReminderTimeSlot`
- Render with the existing `renderTemplate(content, person, mergedGlobals, {timeSlot})` — the fourth
  argument is the `perRecipientVarValues` slot `{{rsvpLink}}` already uses (`server/lib/format.ts:8`).
  `{{signature}}` resolves from `global_variables` exactly as a normal send does.

**Preview and send must call this same function.** Any second implementation reintroduces the
staleness the whole design exists to prevent.

### 5. API

Add to `server/routes/fair-booth.ts`:

| Route | Purpose |
| --- | --- |
| `GET /api/fair-booth/:scheduleId/reminders` | List Runs + live recipient count per Run |
| `POST /api/fair-booth/:scheduleId/reminders` | Queue one Run per fair day; idempotent via the unique index; validates the template contains `{{timeSlot}}` |
| `GET /api/fair-booth/reminders/:runId/preview` | Full `resolveReminderRun` output — every recipient, every rendered message |
| `POST /api/fair-booth/reminders/:runId/cancel` | `status='canceled'` |
| `POST /api/fair-booth/reminders/:runId/send-now` | Fire immediately, ignoring `scheduled_at` |

Queuing computes each `scheduled_at` as *(target day − 1) at `reminderSendTime` local*, converted to
UTC the same way `messages.scheduled_at` is (`server/routes/messages.ts:76`).

Client helpers in `src/lib/schedules-api.ts` alongside the existing fair booth calls.

### 6. Settings

- Add `schedules.fairBooth.reminderSendTime` (default `19:00`) to the Fair Booth section of
  `src/pages/schedules-settings-page.tsx`, beside the five keys ADR 0009 defines.
- **On write of that key**, re-time every `status='scheduled'` fair-booth Run to the new time. Runs
  that already fired are untouched. This is what keeps the setting from displaying one time while
  the queue holds another.

### 7. UI

New **`src/pages/fair-booth/fair-booth-reminders-card.tsx`**, on the schedule detail page near the
existing Send Shifts controls:

```
Reminders                                    [Queue reminders]
  Thu Jul 30  7:00 PM  →  Fri Jul 31    18 workers   [Preview] [Send now] [Cancel]
  Fri Jul 31  7:00 PM  →  Sat Aug 1     18 workers   [Preview] [Send now] [Cancel]
  ...
  ✓ sent  Wed Jul 29  7:00 PM  →  Thu Jul 30    12 sent   → message history
```

Preview dialog: recipient count, an explicit "as of HH:MM — recomputed when it fires at 7:00 PM"
header, then every recipient with name, masked phone and full rendered message. Read-only.

### 8. Deploy

Working tree currently has 24 uncommitted files (export delivery, devotion scan validation, ADR
0017) — **decide whether those ship tonight** before running deploy, since `deploy.sh` prompts on a
dirty tree and will otherwise carry them.

`pnpm eslint` + `pnpm prettier`, commit, then `./scripts/deploy.sh` (backs up the DB, migrates,
builds, reloads the service). Do not run `pnpm dev` — the launchd service is the only runtime.

### 9. Tonight

1. Open the 2026 fair schedule → **Queue reminders** → confirm **nine** Runs, first at
   **Thu Jul 30, 7:00 PM → Fri Jul 31**.
2. **Preview tonight's Run.** Confirm 18 recipients, and specifically check `Preacher`, and that
   partial times read right (Casey Allison `6–10 PM`, Nate Murphy `8–10 PM`).
3. Optionally **Send now** to yourself first by temporarily pointing the Run at a one-person day —
   or just trust the preview, since it is the same resolver.
4. Watch it fire at 19:00; the completed send appears in message history as an ordinary message.

## Verification after the first Run

- Message history shows one `fair_booth_reminder` message, 18 sent, 0 failed.
- The Run row is `completed` with a `message_id`.
- Tomorrow's Run is still `scheduled` and its count reflects any signup made today.
