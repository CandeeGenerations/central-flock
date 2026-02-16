# Plan: Scheduled Message Sending

## Context
The compose page already collects a `scheduledAt` value via DateTimePicker and saves it to drafts, but pressing Send always sends immediately — there's no backend scheduling. Since this is an always-on desktop app, a simple `setInterval` poller on the server is the right approach: no external dependencies, survives restarts by checking the DB on boot, and reuses the existing `processSendJob()` flow.

## Key Design Decisions
- **60-second polling interval** — matches the minute-level precision of scheduling, negligible overhead
- **New `'scheduled'` status** on messages — distinguishes from `'pending'` (about to send now)
- **UTC storage** — DateTimePicker produces local time (`2026-02-15T14:30`); convert to UTC before storing so the scheduler's `datetime('now')` comparison works correctly
- **Past-due detection, not auto-send** — if the server was offline when a scheduled message came due, mark it `'past_due'` instead of sending automatically (avoids unexpected sends at odd hours). The user can manually send or cancel from the detail page.

## Files to Modify

### 1. `server/db/schema.ts` — Add column + status
- Add `scheduledAt: text('scheduled_at')` to `messages` table (after `batchDelayMs`)
- Add `'scheduled'` and `'past_due'` to the status enum: `['pending', 'scheduled', 'past_due', 'sending', 'completed', 'cancelled']`
- Run `pnpm db:migrate` after

### 2. `server/services/scheduler.ts` — NEW FILE
Simple polling service:
- `startScheduler(processFn, pollIntervalMs = 60_000)` — runs `checkScheduledMessages` immediately, then on interval
- `checkScheduledMessages` — queries `WHERE status = 'scheduled' AND scheduled_at <= datetime('now')`
  - If `scheduled_at` is within the last 5 minutes (i.e. on time): transition to `'pending'`, call `createJob()` + `processSendJob()`
  - If `scheduled_at` is older than 5 minutes (i.e. past due): transition to `'past_due'` — do NOT send
- `stopScheduler()` — clears interval
- Accepts `processSendJob` as a callback to avoid circular imports with messages route

### 3. `server/routes/messages.ts` — Accept scheduledAt, conditional scheduling
- Add `scheduledAt` to destructured request body and type annotation
- Convert local `scheduledAt` to UTC string before storing: `new Date(scheduledAt).toISOString().replace('T', ' ').slice(0, 19)`
- If `scheduledAt` is in the future: set status to `'scheduled'`
- If `scheduledAt` is in the past or not provided: set status to `'pending'` and send immediately
- Store `scheduledAt` (UTC) on the message record
- Only call `createJob()` + `processSendJob()` for immediate sends; scheduled messages just return `{messageId, scheduled: true}`
- **Export** `processSendJob` so the scheduler can call it

### 4. `server/index.ts` — Start scheduler on boot
- Import `startScheduler` from `./services/scheduler.js` and `processSendJob` from `./routes/messages.js`
- Call `startScheduler(processSendJob)` inside the `app.listen` callback

### 5. `src/lib/api.ts` — Update types
- Add `scheduledAt?: string` to `sendMessage()` params
- Add `scheduledAt: string | null` and `'scheduled' | 'past_due'` to the `Message` interface status union
- Update return type of `sendMessage` to `{messageId: number; jobId?: string; scheduled?: boolean}`

### 6. `src/pages/message-compose-page.tsx` — Thread scheduledAt through send
- Add `scheduledAt: scheduledAt || undefined` to `sendMutation.mutationFn` call
- In `onSuccess`: if `data.scheduled`, show "Message scheduled" toast and navigate to `/messages?tab=scheduled` instead of polling
- Invalidate messages query on success (so history page updates)
- Change Send button label: `scheduledAt ? 'Schedule Message' : 'Send Message'`
- Update confirmation dialog: title says "Schedule for..." / "Send to...", confirmLabel says "Schedule" / "Send"
- Show scheduled time in confirmation dialog body when scheduling

### 7. `src/pages/message-history-page.tsx` — Three-tab layout + scheduled status
- Add a third **"Scheduled"** tab (`/messages?tab=scheduled`) alongside existing "Sent Messages" and "Drafts" tabs
- "Sent Messages" tab: filter to `status IN ('pending', 'sending', 'completed', 'cancelled')` (unchanged behavior)
- "Scheduled" tab: filter to `status IN ('scheduled', 'past_due')`
- "Drafts" tab: unchanged (reads from drafts table)
- Add `scheduled: 'secondary'` and `past_due: 'destructive'` to `statusColors` map
- In the Scheduled tab's Date column: show `formatDateTime(msg.scheduledAt)` for scheduled, `Past Due: {formatDateTime(msg.scheduledAt)}` for past_due

### 8. `src/pages/message-detail-page.tsx` — Display + cancel for scheduled
- Show "Scheduled For" row in message content card when `message.scheduledAt` exists
- Show Cancel button for `status === 'scheduled'` or `'past_due'` (in addition to existing `'sending'`)
- Show "Send Now" button for `status === 'past_due'` — calls existing send endpoint to trigger immediate send
- Add `'scheduled'` to `refetchInterval` condition so the page auto-refreshes when the scheduled time arrives

## Verification
- `pnpm db:migrate` — push schema changes
- `pnpm lint` — no type errors
- `pnpm dev` — manual testing:
  1. Compose with a scheduledAt a couple minutes in the future → confirm shows "Schedule", button says "Schedule Message", navigates to Scheduled tab, message appears there
  2. Wait for the poll interval → message transitions to sending/completed
  3. Compose with scheduledAt in the past → sends immediately
  4. Compose with no scheduledAt → sends immediately (unchanged behavior)
  5. Cancel a scheduled message from detail page → status becomes cancelled
  6. Stop server, let a scheduled message's time pass, restart → message shows as "past_due" (not auto-sent)
  7. Click "Send Now" on a past-due message → sends successfully
