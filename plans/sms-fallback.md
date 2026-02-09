# Plan: Auto-fallback from iMessage to SMS on failure

## Context

When sending via iMessage to a non-iMessage contact, the AppleScript `osascript` call throws an error. Currently the app catches this error and marks the recipient as "failed" -- but it doesn't try again via SMS. The user wants automatic SMS fallback so messages reach everyone regardless of iMessage compatibility.

## Approach

Add a `smsFallback` option (default: true when sending via iMessage). When a recipient fails via iMessage, automatically retry that recipient via SMS before marking them as truly failed.

## Changes

### 1. `server/services/applescript.ts`

- Add a `sendMessageWithFallback()` function that:
  1. Tries sending via iMessage
  2. On failure, retries via SMS
  3. Returns `{ success: boolean, serviceUsed: 'iMessage' | 'SMS', error?: string }`

### 2. `server/db/schema.ts`

- Add `serviceUsed` column to `message_recipients` table -- tracks which service actually delivered each message (`'iMessage' | 'SMS' | null`)

### 3. `server/routes/messages.ts`

- Update `processSendJob()` to use `sendMessageWithFallback()` when `smsFallback` is enabled on the job
- Save `serviceUsed` per recipient so the UI can show blue/green badges
- Accept `smsFallback` param in the `/send` request body

### 4. `server/services/message-queue.ts`

- Add `smsFallback: boolean` to the `SendJob` interface

### 5. `src/lib/api.ts`

- Add `smsFallback` to the `sendMessage` request type
- Add `serviceUsed` to the `MessageRecipient` interface

### 6. `src/pages/message-compose-page.tsx`

- Add a "Fallback to SMS" checkbox (shown when delivery method is iMessage, default checked)
- Pass `smsFallback` to the send API

### 7. `src/pages/message-detail-page.tsx`

- Show a blue/green badge per recipient indicating whether iMessage or SMS was actually used

## Verification

1. Send iMessage to a known non-iMessage number -- should auto-fallback to SMS and show green "SMS" badge on that recipient
2. Send iMessage to a known iMessage number -- should succeed directly and show blue "iMessage" badge
3. Send with fallback disabled -- should mark as failed (no retry)
4. Check message detail page shows per-recipient service used
