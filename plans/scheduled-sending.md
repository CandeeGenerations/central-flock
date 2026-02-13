# Plan: Scheduled Message Sending

## Context
The compose page already collects a `scheduledAt` value via DateTimePicker and saves it to drafts, but pressing Send always sends immediately — there's no backend scheduling. Since this is an always-on desktop app, a simple `setInterval` poller on the server is the right approach: no external dependencies, survives restarts by checking the DB on boot, and reuses the existing `processSendJob()` flow.

## Key Design Decisions
- **30-second polling interval** — sufficient precision for a desktop app, negligible overhead
- **New `'scheduled'` status** on messages — distinguishes from `'pending'` (about to send now)
- **UTC storage** — DateTimePicker produces local time (`2026-02-15T14:30`); convert to UTC before storing so the scheduler's `datetime('now')` comparison works correctly
- **Past scheduledAt = send immediately** — no special handling needed
- **Scheduler runs check on startup** — catches any messages that became due while server was off

## Files to Modify

### 1. `server/db/schema.ts` — Add column + status
- Add `scheduledAt: text('scheduled_at')` to `messages` table (after `batchDelayMs`)
- Add `'scheduled'` to the status enum: `['pending', 'scheduled', 'sending', 'completed', 'cancelled']`
- Run `pnpm db:migrate` after

### 2. `server/services/scheduler.ts` — NEW FILE
Simple polling service:
- `startScheduler(processFn, pollIntervalMs = 30_000)` — runs `checkScheduledMessages` immediately, then on interval
- `checkScheduledMessages` — queries `WHERE status = 'scheduled' AND scheduled_at <= datetime('now')`, transitions each to `'pending'`, then calls `createJob()` + `processSendJob()`
- `stopScheduler()` — clears interval
- Accepts `processSendJob` as a callback to avoid circular imports with messages route

### 3. `server/routes/messages.ts` — Accept scheduledAt, conditional scheduling
- Add `scheduledAt` to destructured request body and type annotation
- Convert local `scheduledAt` to UTC string before storing: `new Date(scheduledAt).toISOString().replace('T', ' ').slice(0, 19)`
- Set status to `'scheduled'` if `scheduledAt` is in the future, otherwise `'pending'`
- Store `scheduledAt` (UTC) on the message record
- Only call `createJob()` + `processSendJob()` for immediate sends; scheduled messages just return `{messageId, scheduled: true}`
- **Export** `processSendJob` so the scheduler can call it

### 4. `server/index.ts` — Start scheduler on boot
- Import `startScheduler` from `./services/scheduler.js` and `processSendJob` from `./routes/messages.js`
- Call `startScheduler(processSendJob)` inside the `app.listen` callback

### 5. `src/lib/api.ts` — Update types
- Add `scheduledAt?: string` to `sendMessage()` params
- Add `scheduledAt: string | null` and `'scheduled'` to the `Message` interface status union
- Update return type of `sendMessage` to `{messageId: number; jobId?: string; scheduled?: boolean}`

### 6. `src/pages/message-compose-page.tsx` — Thread scheduledAt through send
- Add `scheduledAt: scheduledAt || undefined` to `sendMutation.mutationFn` call
- In `onSuccess`: if `data.scheduled`, show "Message scheduled" toast and navigate to `/messages` instead of polling
- Invalidate messages query on success (so history page updates)
- Change Send button label: `scheduledAt ? 'Schedule Message' : 'Send Message'`
- Update confirmation dialog: title says "Schedule for..." / "Send to...", confirmLabel says "Schedule" / "Send"
- Show scheduled time in confirmation dialog body when scheduling

### 7. `src/pages/message-history-page.tsx` — Display scheduled status
- Add `scheduled: 'secondary'` to `statusColors` map
- In Date Sent column: show `Scheduled: {formatDateTime(msg.scheduledAt)}` when `msg.status === 'scheduled'`

### 8. `src/pages/message-detail-page.tsx` — Display + cancel for scheduled
- Show "Scheduled For" row in message content card when `message.scheduledAt` exists
- Show Cancel button for `status === 'scheduled'` (in addition to existing `'sending'`)
- Add `'scheduled'` to `refetchInterval` condition so the page auto-refreshes when the scheduled time arrives

## Verification
- `pnpm db:migrate` — push schema changes
- `pnpm lint` — no type errors
- `pnpm dev` — manual testing:
  1. Compose with a scheduledAt a couple minutes in the future → confirm shows "Schedule", button says "Schedule Message", message appears in history as "scheduled"
  2. Wait for the poll interval → message transitions to sending/completed
  3. Compose with scheduledAt in the past → sends immediately
  4. Compose with no scheduledAt → sends immediately (unchanged behavior)
  5. Cancel a scheduled message from detail page → status becomes cancelled
